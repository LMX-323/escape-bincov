// The documents an agent reads first must not point at missing files, headings or repository paths. Archival docs
// keep their own links (check-docs.mjs only blocks newly added broken ones there).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import { localLinks } from './check-docs.mjs';

// WORK-QUEUE is checked up to its archived history (the first <details>).
const ENTRY = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'docs/CODEMAP.md', 'docs/AGENT-HANDBOOK.md', 'docs/ARCHITECTURE.md',
  'docs/CI.md', 'docs/CHECKS.md', 'docs/WORK-QUEUE.md', 'docs/TASK-HANDOFF-TEMPLATE.md'];
const root = resolve('.');
const current = file => { const text = readFileSync(resolve(root, file), 'utf8'); return file === 'docs/WORK-QUEUE.md' ? text.split('<details>')[0] : text; };

/** GitHub heading anchors: lower case, punctuation dropped, spaces to hyphens, numbered duplicates. */
function headingAnchors(markdown) {
  const anchors = new Set(), seen = new Map();
  for (const line of markdown.replace(/```[^]*?```|~~~[^]*?~~~/g, '').split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const slug = heading.replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(slug) ?? 0; seen.set(slug, n + 1);
    anchors.add(n ? `${slug}-${n}` : slug);
  }
  return anchors;
}

test('heading anchors follow GitHub for Chinese, code and duplicate headings', () => {
  assert.deepEqual([...headingAnchors('# 4. 按风险验证\n## `pnpm test` 与 CI\n## 交易\n## 交易\n```\n# not a heading\n```')],
    ['4-按风险验证', 'pnpm-test-与-ci', '交易', '交易-1']);
});

test('entry documents link only to existing files and headings', () => {
  const broken = [];
  for (const file of ENTRY) {
    for (const link of localLinks(current(file))) {
      const [path, anchor] = link.split('#');
      const target = path ? resolve(dirname(resolve(root, file)), decodeURIComponent(path.split('?')[0])) : resolve(root, file);
      if (relative(root, target).startsWith('..') || !existsSync(target)) { broken.push(`${file}: ${link}`); continue; }
      if (anchor && target.endsWith('.md') && statSync(target).isFile() && !headingAnchors(readFileSync(target, 'utf8')).has(decodeURIComponent(anchor).toLowerCase())) {
        broken.push(`${file}: ${link} (no such heading)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('repository paths quoted in entry documents exist', () => {
  const missing = [];
  for (const file of ENTRY) {
    for (const m of current(file).matchAll(/`((?:src|scripts|tests|docs|assets)\/[^`\s*]+\.(?:ts|mjs|js|css|json|md|png))`/g)) {
      if (!existsSync(resolve(root, m[1]))) missing.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
