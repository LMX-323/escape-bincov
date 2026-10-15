import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { browserGroups, choosePlan, fingerprint, fullyTested, isDocumentation } from './policy.mjs';
import { checkDocumentation, localLinks } from './check-docs.mjs';

const entry = (path, sha = 'a'.repeat(40), mode = '100644', type = 'blob') => ({ path, sha, mode, type });
const source = entry('src/session.ts'), doc = entry('docs/MAIN-STORY.md');
const repository = 'xuys2025/escape-bincov';
const run = { id: 123, repository: { full_name: repository }, head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success', path: '.github/workflows/ci-pages.yml', head_sha: 'a'.repeat(40) };
const allJobs = ['Build shared game', 'Build and test', 'Deploy Pages', ...browserGroups.map(g => `Browser / ${g}`)]
  .map(name => ({ name, status: 'completed', conclusion: 'success' }));
const fixture = (extra = {}) => ({ eventName: 'pull_request', repository, current: [source, doc], base: [source],
  runs: async () => [run], tree: async () => [source], jobs: async () => allJobs, ...extra });

test('documentation allowlist excludes build inputs, arbitrary files, symlinks and submodules', () => {
  for (const path of ['README.md', 'handoff.md', 'AGENTS.md', 'docs/story/CH01-MARKET-SLICE.md',
    'docs/story/GEMINI-RETURN-MANIFEST-20261014.json']) assert.ok(isDocumentation(entry(path)), path);
  for (const path of ['THIRD_PARTY_NOTICES.md', 'README-游玩说明.txt', 'docs/release-manifest.json',
    'docs/runtime.json', 'assets/license.md', 'scripts/test.mjs', 'tests/save.test.ts',
    '.github/workflows/ci-pages.yml', 'package.json', 'pnpm-lock.yaml', 'docs/new.png', 'new.md']) {
    assert.ok(!isDocumentation(entry(path)), path);
    assert.notEqual(fingerprint([source]), fingerprint([source, entry(path)]));
  }
  assert.ok(!isDocumentation(entry('docs/link.md', 'b'.repeat(40), '120000')));
  assert.ok(!isDocumentation(entry('docs/submodule.md', 'b'.repeat(40), '160000', 'commit')));
});

test('fingerprint detects file deletion, rename, permission change, tests, lockfile and generated artifacts', () => {
  assert.equal(fingerprint([source, doc]), fingerprint([entry('docs/a.md'), source]));
  for (const after of [[], [entry('src/renamed.ts')], [entry(source.path, source.sha, '100755')],
    [source, entry('tests/save.test.ts')], [source, entry('pnpm-lock.yaml')], [source, entry('dist/index.html')]]) {
    assert.notEqual(fingerprint([source]), fingerprint(after));
  }
});

test('docs PR and docs main reuse only the same fully validated content', async () => {
  for (const eventName of ['pull_request', 'push']) {
    const plan = await choosePlan(fixture({ eventName }));
    assert.equal(plan.browserRequired, false); assert.equal(plan.validatedRun, run.id);
    assert.deepEqual(plan.changed, ['docs/MAIN-STORY.md']);
  }
});

test('whole PR comparison catches code followed by a final documentation commit', async () => {
  assert.equal((await choosePlan(fixture({ current: [entry(source.path, 'b'.repeat(40)), doc] }))).browserRequired, true);
  assert.equal((await choosePlan(fixture({ base: undefined }))).browserRequired, true);
});

test('main docs after a cancelled/untested code push cannot reuse the last release', async () => {
  const changed = [entry(source.path, 'b'.repeat(40)), doc];
  assert.equal((await choosePlan(fixture({ eventName: 'push', current: changed }))).browserRequired, true);
  // Even a docs-only PR on an unvalidated main must run full regression.
  assert.equal((await choosePlan(fixture({ current: changed, base: changed.slice(0, 1) }))).browserRequired, true);
});

test('manual runs always perform full regression', async () => {
  for (const eventName of ['workflow_dispatch', 'unknown']) {
    assert.equal((await choosePlan(fixture({ eventName }))).browserRequired, true);
  }
});

test('missing, failed, cancelled, duplicate and skipped groups cannot authorize reuse', async () => {
  assert.ok(fullyTested(allJobs));
  for (const bad of [allJobs.slice(1), [...allJobs, allJobs[0]],
    ...['failure', 'cancelled', 'skipped'].map(conclusion => allJobs.map(j => j.name === 'Browser / world' ? { ...j, conclusion } : j))]) {
    assert.ok(!fullyTested(bad));
    assert.equal((await choosePlan(fixture({ jobs: async () => bad }))).browserRequired, true);
  }
});

test('PR, different repository/workflow and unsuccessful main runs are not evidence', async () => {
  for (const patch of [{ event: 'pull_request' }, { head_branch: 'feature' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'other/repo' } }]) {
    assert.equal((await choosePlan(fixture({ runs: async () => [{ ...run, ...patch }] }))).browserRequired, true);
  }
});

test('API failures and missing history fall back to full regression', async () => {
  for (const field of ['runs', 'tree', 'jobs']) {
    assert.equal((await choosePlan(fixture({ [field]: async () => { throw Error('unavailable/truncated'); } }))).browserRequired, true);
  }
  assert.equal((await choosePlan(fixture({ runs: async () => [] }))).browserRequired, true);
});

test('docs runs are never transitive evidence; find an earlier full run', async () => {
  const docsRun = { ...run, id: 124 };
  const plan = await choosePlan(fixture({ runs: async () => [docsRun, run],
    jobs: async id => id === docsRun.id ? allJobs.map(j => j.name.startsWith('Browser /') ? { ...j, conclusion: 'skipped' } : j) : allJobs }));
  assert.equal(plan.validatedRun, 123);
});

test('new documentation links are checked with real Git history, including encoded Chinese names', t => {
  const root = mkdtempSync(join(tmpdir(), 'bincov-ci-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'README.md'), '[historical](missing.md)\n');
  writeFileSync(join(root, 'docs', '指南.md'), 'fixture\n');
  git('add', '.'); git('commit', '-m', 'fixture base'); const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(root, 'README.md'), '[historical](missing.md)\n[new](docs/%E6%8C%87%E5%8D%97.md#heading)\n');
  git('add', '.'); git('commit', '-m', 'valid link'); checkDocumentation(['README.md'], base, root);
  writeFileSync(join(root, 'README.md'), '[new](docs/absent.md)\n');
  git('add', '.'); git('commit', '-m', 'bad link'); assert.throws(() => checkDocumentation(['README.md'], base, root), /Broken/);
  assert.deepEqual(localLinks('```md\n[x](missing)\n```\n[a](https://example.com) [b](#x) [c](<docs/a b.md>)'), ['docs/a b.md']);
});

test('workflow preserves every original browser command exactly once across eight groups', () => {
  const yaml = readFileSync(resolve('.github/workflows/ci-pages.yml'), 'utf8');
  const browser = yaml.split('\n  browser:')[1].split('\n  verify:')[0];
  const expected = ['browser', 'desktop-input', 'shop-drag', 'asset-load', 'hud-release', 'coast-render-targets', 'shop-feedback',
    'issue26-station', 'issue26-inventory', 'issue26-spatial', 'issue26-phaser-spatial', 'ui', 'coast-animation', 'tactical', 'art', 'opening',
    'title', 'title-water', 'save-browser', 'expansion', 'buildings', 'qol-expansion', 'systems', 'station-tier1', 'station-tier2',
    'station-relief', 'station-reset', 'mall-passages', 'mall-landing', 'mall-sample', 'loot', 'loot-target', 'qol', 'mobile', 'mobile-ux', 'portable', 'raid-default'];
  assert.deepEqual([...browser.matchAll(/pnpm test:([\w-]+)/g)].map(m => m[1]).sort(), expected.sort());
  assert.deepEqual(browser.match(/group: \[([^\]]+)\]/)[1].split(',').map(s => s.trim()), browserGroups);
  for (const m of browser.matchAll(/matrix.group == '([^']+)'/g)) assert.ok(browserGroups.includes(m[1]));
  assert.match(browser, /max-parallel: 8/);
  // The old-client fixture must travel with its consumer after regrouping.
  assert.match(browser, /name: Obtain actual pre-expansion client\s+if: matrix.group == 'title'/);
  assert.match(browser, /name: Expansion storage and actual old-client regression\s+if: matrix.group == 'title'/);
});

test('actual shell gate rejects missing policy, failed build and unintended skipped/cancelled browsers', () => {
  const yaml = readFileSync(resolve('.github/workflows/ci-pages.yml'), 'utf8');
  const block = yaml.split('name: Require build and the selected browser policy to succeed')[1].split('\n      - name:')[0];
  const script = block.split('run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  for (const build of ['success', 'failure', 'skipped', 'cancelled', '']) for (const required of ['true', 'false', '']) {
    for (const result of ['success', 'failure', 'skipped', 'cancelled', '']) {
      let passed = true;
      try { execFileSync(bash, ['-c', script], { env: { ...process.env, BUILD_RESULT: build, BROWSER_REQUIRED: required, BROWSER_RESULT: result }, stdio: 'pipe' }); }
      catch { passed = false; }
      assert.equal(passed, build === 'success' && ((required === 'true' && result === 'success') || (required === 'false' && result === 'skipped')),
        `${build}/${required}/${result}`);
    }
  }
});
