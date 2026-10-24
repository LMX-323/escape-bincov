import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { raidReady, waitPanel } from './raid-view.mjs';

const root = resolve('test-results'); await mkdir(root, { recursive: true });
const oldPath = resolve(process.argv[2] ?? 'test-results/pre-m0.html');
// The last client before the perk format (session v5): it reads session records 2, 3 and 4 only.
const v4Path = resolve(process.argv[3] ?? 'test-results/pre-perk.html');
const [legacy, v4Client, current] = await Promise.all([readFile(oldPath, 'utf8'), readFile(v4Path, 'utf8'), readFile(resolve('dist/index.html'), 'utf8')]);
const hash = text => createHash('sha256').update(text).digest('hex');
const legacyClients = {
    '2984e201d2b33c0f242e2c290f01425652463ef20b25df47b528471b4be5e731': '49738b89cc8556a0b39d339239bf09945e44ab9e',
    'e748efcbad1bb2cde79e3898d9faafc62085e9dee51411df64b2c2cd2d708efc': '07b1414da9f1ac4c3ad13a23ec914630ccbd7fbb',
};
const v4Clients = { '7daee656304456ee9e92490d034a85ed720c2e92324a1e115aee1a47e3281da0': '44494eaccc45315dc0c5b36b9e66c4e92f463308' };
assert.ok(Object.hasOwn(legacyClients, hash(legacy)), 'Use an actual pinned pre-expansion main HTML, not a simulated old decoder');
assert.ok(Object.hasOwn(v4Clients, hash(v4Client)), 'Use the actual pinned pre-perk main HTML, not a simulated old decoder');
const report = { startedAt: new Date().toISOString(), baseline: legacyClients[hash(legacy)], v4Baseline: v4Clients[hash(v4Client)],
    legacySha256: hash(legacy), v4Sha256: hash(v4Client), currentSha256: hash(current), steps: [], errors: [], unexpectedRequests: [],
    methodology: 'Injected session clock for exact persistence snapshots (not a timing test). Real pinned main HTMLs (pre-expansion and pre-perk) and current bundle on one locally fulfilled HTTPS origin, offline; explicit test-only extension fixture. No new map/gameplay/UI acceptance is claimed.' };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, acceptDownloads: true });
const client = path => path.startsWith('/legacy') ? legacy : path.startsWith('/v4') ? v4Client : current;
await context.route('https://bincov-expansion.test/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
    body: client(new URL(route.request().url()).pathname) }));
context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('https://bincov-expansion.test/')) report.unexpectedRequests.push(request.url()); });
context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
const raw = page => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const action = (page, name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const ready = async page => {
    await page.waitForFunction(() => !!window.__bincov?.saveSession);
    // Persistence fixture only: leave the raid view's browser clock and real input scheduling intact.
    if (new URL(page.url()).pathname.startsWith('/current')) await page.evaluate(() => { window.__bincov.saveSession.now = () => 1800000000000; });
};
async function failStorage(page, on, terminalOnly = false) {
    await page.evaluate(({ on, terminalOnly }) => {
        window.__m0Write ??= Storage.prototype.setItem;
        Storage.prototype.setItem = on ? function (key, value) {
            if (key === 'escape-bincov.session.v2' && (!terminalOnly || !JSON.parse(value).profile.activeRun)) throw new DOMException('M0 quota fault', 'QuotaExceededError');
            return window.__m0Write.call(this, key, value);
        } : window.__m0Write;
    }, { on, terminalOnly });
}
async function step(name, work) {
    const result = { name, status: 'running' }; report.steps.push(result);
    try { await work(); assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpectedRequests, []); result.status = 'passed'; console.log('PASS', name); }
    catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
}
let old = await context.newPage(), page = await context.newPage(), preUpgrade, prePerk;
try {
    await step('the actual v3 main client creates progress; new client respects its lock then takes over', async () => {
        await old.goto('https://bincov-expansion.test/legacy?test=1&entry=tabs'); await ready(old); await action(old, 'enter').click();
        assert.equal(await old.evaluate(() => { window.__bincov.app.save.cash = 1842; return window.__bincov.persist(); }), true);
        const bytes = await raw(old);
        await page.goto('https://bincov-expansion.test/current?test=1&entry=tabs'); await ready(page);
        assert.equal(await page.evaluate(() => window.__bincov.app.storageOK), false); assert.equal(await raw(page), bytes);
        await old.close(); await page.reload(); await ready(page); // Inspect v3 before the mandatory station-boundary upgrade.
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 1842);
        preUpgrade = await raw(page); assert.equal(JSON.parse(preUpgrade).version, 3);
    });
    await step('activation quota failure preserves original bytes; retry retains one exact rollback record', async () => {
        await failStorage(page, true);
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.enableExpansion(1000)), false);
        assert.equal(await raw(page), preUpgrade); assert.equal(await page.evaluate(() => window.__bincov.app.expansion), null);
        await failStorage(page, false);
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.enableExpansion(1000)), true);
        assert.equal(JSON.parse(await raw(page)).systemsBackup, preUpgrade);
        assert.equal(await page.evaluate(() => {
            const { saveSession } = window.__bincov;
            const ticket = saveSession.prepareExpansionMutation(d => { d.expansion.body.hp = 37; d.expansion.growth.progress.technique = .2; });
            return saveSession.commitExpansionMutation(ticket);
        }), 'committed');
    });
    await step('the actual old HTML rejects v4 both with and without the writer lock, preserving every byte', async () => {
        const bytes = await raw(page); old = await context.newPage();
        await old.goto('https://bincov-expansion.test/legacy?test=1&entry=tabs'); await ready(old);
        assert.equal(await old.evaluate(() => window.__bincov.app.storageOK), false);
        assert.match(await old.evaluate(() => window.__bincov.app.storageError), /兼容|无法读取/);
        assert.equal(await old.evaluate(() => window.__bincov.persist()), false); assert.equal(await raw(old), bytes);
        await page.close(); await old.reload(); await ready(old);
        assert.equal(await old.evaluate(() => window.__bincov.app.storageOK), false);
        assert.equal(await old.evaluate(() => window.__bincov.persist()), false); assert.equal(await raw(old), bytes);
        await old.close(); page = await context.newPage();
        await page.goto('https://bincov-expansion.test/current?test=1&entry=tabs'); await ready(page);
        prePerk = await raw(page); assert.equal(JSON.parse(prePerk).version, 4);
        // The station entry is the perk upgrade boundary: v5 keeps that exact v4 text once.
        await action(page, 'enter').click();
        const upgraded = JSON.parse(await raw(page));
        assert.equal(upgraded.version, 5); assert.equal(upgraded.expansion.version, 3); assert.deepEqual(upgraded.expansion.growth.perks, []);
        assert.equal(upgraded.systemsBackup, preUpgrade); assert.equal(upgraded.perksBackup, prePerk);
    });
    await step('both actual old HTMLs (pre-expansion and the last v4 client) reject v5 with and without the writer lock, preserving every byte', async () => {
        const bytes = await raw(page), clients = ['legacy', 'v4'];
        const refuses = async path => {
            old = await context.newPage(); await old.goto(`https://bincov-expansion.test/${path}?test=1&entry=tabs`); await ready(old);
            assert.equal(await old.evaluate(() => window.__bincov.app.storageOK), false, path);
            assert.match(await old.evaluate(() => window.__bincov.app.storageError), /兼容|无法读取/, path);
            assert.equal(await old.evaluate(() => window.__bincov.persist()), false, path); assert.equal(await raw(old), bytes, path);
            await old.close();
        };
        for (const path of clients) await refuses(path); // the current page holds the writer lock
        await page.close();
        for (const path of clients) await refuses(path); // now each old page owns the lock
        page = await context.newPage();
        await page.goto('https://bincov-expansion.test/current?test=1&entry=tabs'); await ready(page); await action(page, 'enter').click();
        const record = JSON.parse(await raw(page));
        assert.equal(record.version, 5); assert.equal(record.perksBackup, prePerk); assert.equal(record.systemsBackup, preUpgrade);
    });
    await step('settled native export includes the full extension; cancel/failure/confirmation preserve atomic import', async () => {
        await action(page, 'tab', 'home').click();
        const [download] = await Promise.all([page.waitForEvent('download'), action(page, 'export-save').click()]);
        const path = resolve(root, 'expansion-settled.json'); await download.saveAs(path);
        const backup = JSON.parse(await readFile(path, 'utf8')); assert.equal(backup.formatVersion, 5); assert.equal(backup.record.expansion.version, 3);
        assert.equal(backup.record.expansion.body.hp, 37); assert.equal(backup.record.expansion.growth.progress.technique, .2);
        const changed = structuredClone(backup); changed.record.profile.cash = 2842;
        const changedPath = resolve(root, 'expansion-import-fixture.json'); await writeFile(changedPath, JSON.stringify(changed));
        const before = await raw(page); await page.locator('#backup-file').setInputFiles(changedPath); await action(page, 'close').click(); assert.equal(await raw(page), before);
        await page.locator('#backup-file').setInputFiles(changedPath); await failStorage(page, true); await action(page, 'confirm-import').click();
        assert.equal(await raw(page), before); assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 1842);
        await failStorage(page, false); await action(page, 'confirm-import').click(); await action(page, 'enter').click();
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 2842);
        assert.equal(await page.evaluate(() => window.__bincov.app.expansion.growth.progress.technique), .2);
        await page.reload(); await ready(page); await action(page, 'enter').click();
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 2842);
    });
    await step('the last v4 client refuses the v5 backup file and keeps its own save', async () => {
        // A separate profile: the v4 client needs a save it can write to reach its import dialog.
        const other = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
        await other.route('https://bincov-expansion.test/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: v4Client }));
        other.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('https://bincov-expansion.test/')) report.unexpectedRequests.push(request.url()); });
        other.on('page', p => p.on('pageerror', error => report.errors.push(error.message)));
        try {
            const v4 = await other.newPage(); await v4.goto('https://bincov-expansion.test/v4?test=1&entry=tabs'); await ready(v4); await action(v4, 'enter').click();
            const own = await raw(v4); assert.equal(JSON.parse(own).version, 4);
            await action(v4, 'tab', 'home').click(); await v4.locator('#backup-file').setInputFiles(resolve(root, 'expansion-settled.json'));
            await v4.waitForFunction(() => !!document.querySelector('#toast')?.textContent?.includes('不兼容'));
            assert.equal(await action(v4, 'confirm-import').count(), 0); assert.equal(await raw(v4), own);
        } finally { await other.close(); }
    });
    await step('legacy coast still deploys/resumes; failed abandon exports pending body/growth and retries only once', async () => {
        // The classic coast is closed to players but test pages still deploy it: the kind of checkpoint raid an old save holds.
        await action(page, 'tab', 'gear').click(); await page.locator('#run-world').selectOption('coast'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
        assert.equal((await raidReady(page)).worldVersion, 'coast-v2', 'a classic checkpoint raid on the 2.5D view');
        await page.keyboard.press('Escape'); await waitPanel(page, 'pause');
        assert.equal(await page.evaluate(() => { window.__bincovSample.driver.vitals({ hp: 37, stamina: 15, pollution: 63 }); return window.__bincovSample.host.services.checkpoint(); }), true);
        await page.reload(); await ready(page); await action(page, 'enter').click();
        await raidReady(page); await waitPanel(page, 'pause');
        assert.equal(await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.hud.hp), 37);
        await failStorage(page, true, true); await page.locator('.coast-sample [data-do="abandon"]').click();
        const bytes = await raw(page); await page.locator('.coast-sample [data-do="abandon-yes"]').click();
        await page.waitForFunction(() => document.querySelector('.coast-sample [data-ending-title]')?.textContent === '已放弃行动 · 正在保存结算'
            && !!document.querySelector('.coast-sample [data-do="retry-settlement"]'));
        assert.equal(await raw(page), bytes);
        const pending = await page.evaluate(() => window.__bincov.app.pendingExpansion); assert.equal(pending.body.hp, 37);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.coast-sample [data-do="backup"]').click()]);
        const path = resolve(root, 'expansion-pending.json'); await download.saveAs(path);
        const backup = JSON.parse(await readFile(path, 'utf8'));
        assert.equal(backup.record.expansion.growth.progress.technique, .2); assert.equal(backup.record.expansion.body.hp, 37);
        assert.equal(backup.record.expansion.base.location, 'settlement'); assert.equal(backup.record.terminal.reason, 'abandon');
        assert.equal(backup.record.profile.activeRun, null); assert.equal(backup.record.raid, null);
        await page.screenshot({ path: resolve(root, 'm0-pending-1280x720.png') });
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.screenshot({ path: resolve(root, 'm0-pending-1920x1080.png') });
        await failStorage(page, false); await page.locator('.coast-sample [data-do="retry-settlement"]').click();
        // The settlement is written at once; the result page follows the short outro.
        await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.retrySettlement()), false);
        assert.equal(JSON.parse(await raw(page)).profile.stats.runs, 1);
        assert.equal(JSON.parse(await raw(page)).expansion.base.location, 'base');
    });
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; report.diagnostic = await page.evaluate(() => ({state:window.__bincov?.app.state, panel:window.__bincovSample?.host?.panel ?? null, error:window.__bincov?.app.storageError})).catch(()=>null); console.error(error); process.exitCode = 1; }
finally { await context.close(); await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(resolve(root, 'expansion-browser-report.json'), JSON.stringify(report, null, 2)); }
