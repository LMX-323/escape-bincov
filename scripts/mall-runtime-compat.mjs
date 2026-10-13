/** Actual main HTML compatibility, plus renderer-free Runtime in a browser with real localStorage. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = 'test-results/mall-runtime'; await mkdir(out, { recursive: true });
const baseline = execFileSync('git', ['rev-parse', process.argv[2] ?? 'origin/main'], { encoding: 'utf8' }).trim();
const old = execFileSync('git', ['show', `${baseline}:dist/index.html`], { maxBuffer: 16 * 1024 * 1024 });
const current = await readFile('dist/index.html');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(`${out}/main-reference.html`, old);
const entry = `
import { createSessionState, SaveSession } from './src/session';
import { createTestCoastHost } from './src/raid-runtime/test-support';
import { encodeRecoveryBackup, decodePortableBackup } from './src/save-backup';
const now = () => 1800000000000;
window.mallTest = { boot(layout) {
  const state = createSessionState(), saves = new SaveSession(state, () => localStorage, undefined, now);
  if (!saves.initialize()) throw Error(state.storageError);
  if (layout) { state.state = 'hideout'; if (!saves.beginRun(42, 'mall', { mallLayout: layout })) throw Error(state.storageError); }
  else if (!saves.resumeRun()) throw Error('No saved raid');
  state.state = 'run'; const host = createTestCoastHost(state, saves, location.search); host.driver.freezeAI(true);
  Object.assign(window.mallTest, {state, saves, host});
  return host.runtime.current().map.key;
}, backup() { return encodeRecoveryBackup(this.host.services.backup()); },
importBackup(text) {
  const state = createSessionState(), saves = new SaveSession(state, () => localStorage, undefined, now);
  if (!saves.initialize()) throw Error(state.storageError); state.state='hideout';
  const value=decodePortableBackup(text); if(value.kind!=='session'||!saves.importRecord(value.record)) throw Error(state.storageError);
  state.state='menu'; if(!saves.resumeRun()) throw Error('Import resume failed'); state.state='run';
  const host=createTestCoastHost(state,saves,location.search); Object.assign(this,{state,saves,host}); return host.runtime.current().map.key;
}};`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'mall-runtime-compat-fixture.ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
const harness = `<!doctype html><meta charset="utf-8"><title>Mall Runtime compatibility fixture</title><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`;
const report = { baseline, baselineHtmlSha256: hash(old), currentHtmlSha256: hash(current), fixtureSha256: hash(harness), startedAt: new Date().toISOString(),
    methodology: 'Actual accepted main HTML; new renderer-free production Runtime plus explicit ?test=1 driver. Same HTTPS origin fulfilled offline, real browser localStorage and reloads. Controlled clock; this is save compatibility, not mall-view or natural-input acceptance.', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const contexts = [];
async function context() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true }); contexts.push(ctx);
    await ctx.route('https://mall-runtime.test/**', route => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: path.startsWith('/old') ? old : path.startsWith('/current') ? current : harness });
    });
    ctx.on('page', p => p.on('pageerror', e => report.errors.push(e.stack ?? e.message)));
    ctx.on('request', r => { if (!r.url().startsWith('https://mall-runtime.test/')) report.requests.push(r.url()); });
    return ctx;
}
const raw = page => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
async function ready(page) {
    await page.waitForFunction(() => !!window.__bincov?.saveSession);
    await page.evaluate(() => { window.__bincov.saveSession.now = () => 1800000000000; });
}
async function step(name, action) {
    const row = { name, status: 'running' }; report.steps.push(row);
    try { row.evidence = await action(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); row.status = 'passed'; console.log('PASS', name); }
    catch (e) { row.status = 'failed'; row.error = e.stack; throw e; }
}
try {
    let v1raw, v1terminal;
    await step('A4/S-07 actual main creates a v1 raid; its accepted snapshot and abandon result are the reference', async () => {
        const ctx = await context(), page = await ctx.newPage();
        await page.goto('https://mall-runtime.test/old?test=1&entry=tabs'); await ready(page);
        await page.locator('[data-action="enter"]').click(); await page.locator('#run-world').selectOption('mall');
        await page.locator('#seed').fill('42'); await page.locator('[data-action="deploy"]').click();
        await page.waitForFunction(() => !!window.__bincov.app.raid?.player?.active);
        await page.evaluate(() => { const a=window.__bincov; a.setOverlay('pause'); if(!a.app.raid.checkpoint()) throw Error(a.app.storageError); });
        v1raw = await raw(page); assert.equal(JSON.parse(v1raw).expansion.raid.worldVersion, 'mall-v1');
        await page.locator('[data-action="abandon"]').click(); await page.locator('[data-action="confirm-abandon"]').click();
        await page.waitForFunction(() => window.__bincov.app.state === 'result');
        v1terminal = await page.evaluate(() => { const r=window.__bincov.saveSession.currentRecord(); return {profile:r.profile, expansion:r.expansion, terminal:r.terminal}; });
        await ctx.close(); return { snapshotSha256: hash(v1raw), terminalSha256: hash(JSON.stringify(v1terminal)), world: 'mall-v1' };
    });
    await step('A4 v1 snapshot resumes in new Runtime without change and settles identically to actual main', async () => {
        const ctx=await context(), page=await ctx.newPage(); await page.goto('https://mall-runtime.test/runtime?test=1');
        await page.evaluate(bytes=>localStorage.setItem('escape-bincov.session.v2',bytes),v1raw);
        const result=await page.evaluate(()=>{const t=window.mallTest;t.boot(); const expansion=t.saves.backupRecord().expansion; t.host.services.abandon(); const r=t.saves.currentRecord(); return {expansion, settled:{profile:r.profile, expansion:r.expansion,terminal:r.terminal}};});
        assert.deepEqual(result.expansion,JSON.parse(v1raw).expansion); assert.deepEqual(result.settled,v1terminal);
        await ctx.close(); return { exactSnapshot:true, exactTerminal:true };
    });
    let v2raw, v2backup;
    await step('A4/S-03/S-08 v2 F2 survives browser refresh and exported backup import', async () => {
        const ctx=await context(), page=await ctx.newPage(); await page.goto('https://mall-runtime.test/runtime?test=1');
        const before=await page.evaluate(()=>{ const t=window.mallTest; t.boot(2); t.host.driver.placePlayer({x:2000,y:432},.3,'mall-f2'); if(!t.host.services.checkpoint())throw Error(t.state.storageError); return t.saves.backupRecord().expansion; });
        v2raw=await raw(page); v2backup=await page.evaluate(()=>window.mallTest.backup()); await page.reload();
        const restored=await page.evaluate(()=>{window.mallTest.boot();return window.mallTest.saves.backupRecord().expansion;}); assert.deepEqual(restored,before);
        const other=await context(), imported=await other.newPage(); await imported.goto('https://mall-runtime.test/runtime?test=1');
        const key=await imported.evaluate(backup=>window.mallTest.importBackup(backup),v2backup);
        assert.equal(key.worldVersion,'mall-v2'); assert.equal(key.mapId,'mall-f2'); assert.equal(key.layoutRevision,'mall-layout-2');
        assert.deepEqual(await imported.evaluate(()=>window.mallTest.saves.backupRecord().expansion),before);
        await ctx.close(); await other.close(); return {key,rawSha256:hash(v2raw),backupSha256:hash(v2backup)};
    });
    await step('A4/S-07 actual main HTML rejects a v2 action without a writer lock and preserves exact raw bytes', async () => {
        const ctx=await context(), page=await ctx.newPage(); await page.goto('https://mall-runtime.test/runtime?test=1');
        await page.evaluate(bytes=>localStorage.setItem('escape-bincov.session.v2',bytes),v2raw);
        await page.goto('https://mall-runtime.test/old?test=1&entry=tabs'); await ready(page);
        const state=await page.evaluate(()=>({ok:window.__bincov.app.storageOK,error:window.__bincov.app.storageError,write:window.__bincov.persist()}));
        assert.equal(state.ok,false); assert.equal(state.write,false); assert.match(state.error,/世界|内容|兼容|无法读取|无效/); assert.equal(await raw(page),v2raw);
        await page.screenshot({path:`${out}/old-main-rejects-v2.png`}); await page.reload(); await ready(page); assert.equal(await raw(page),v2raw);
        assert.equal(await page.evaluate(()=>window.__bincov.persist()),false); assert.equal(await raw(page),v2raw);
        await ctx.close(); return {...state,unchanged:true,rawSha256:hash(v2raw)};
    });
    await step('S-08 current game native import cancel/failure/confirmation keeps complete v2 F2 backup', async () => {
        const ctx=await context(), page=await ctx.newPage(); await page.goto('https://mall-runtime.test/current?test=1&entry=tabs'); await ready(page);
        await page.locator('[data-action="enter"]').click();
        await page.locator('[data-action="tab"][data-id="home"]').click();
        const before=await raw(page), file={name:'mall-v2-backup.json',mimeType:'application/json',buffer:Buffer.from(v2backup)};
        await page.locator('#backup-file').setInputFiles(file); await page.locator('[data-action="close"]').click(); assert.equal(await raw(page),before);
        await page.locator('#backup-file').setInputFiles(file);
        await page.evaluate(()=>{window.mallOriginalWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='escape-bincov.session.v2')throw new DOMException('mall import quota','QuotaExceededError');return window.mallOriginalWrite.call(this,k,v);};});
        await page.locator('[data-action="confirm-import"]').click(); assert.equal(await raw(page),before); assert.equal(await page.evaluate(()=>window.__bincov.app.save.activeRun),null);
        await page.evaluate(()=>{Storage.prototype.setItem=window.mallOriginalWrite;}); await page.locator('[data-action="confirm-import"]').click();
        const imported=JSON.parse(await raw(page));assert.equal(imported.expansion.raid.worldVersion,'mall-v2');assert.equal(imported.expansion.raid.currentMap,'mall-f2');
        assert.deepEqual(imported.expansion,JSON.parse(v2raw).expansion);
        await page.reload();await ready(page);assert.deepEqual(JSON.parse(await raw(page)).expansion,imported.expansion);
        await ctx.close();return {cancelPreserved:true,failurePreserved:true,confirmedWorld:'mall-v2',confirmedMap:'mall-f2',refreshPreserved:true};
    });
    await step('S-06 actual current HTML second tab cannot write the v2 record owned by the first tab', async () => {
        const ctx=await context(), a=await ctx.newPage(); await a.goto('https://mall-runtime.test/runtime?test=1');
        await a.evaluate(bytes=>localStorage.setItem('escape-bincov.session.v2',bytes),v2raw);
        await a.goto('https://mall-runtime.test/current?test=1&entry=tabs');await ready(a);assert.equal(await a.evaluate(()=>window.__bincov.app.storageOK),true);
        const before=await raw(a), b=await ctx.newPage();await b.goto('https://mall-runtime.test/current?test=1&entry=tabs');await ready(b);
        const locked=await b.evaluate(()=>({ok:window.__bincov.app.storageOK,write:window.__bincov.persist(),error:window.__bincov.app.storageError}));
        assert.equal(locked.ok,false); assert.equal(locked.write,false); assert.equal(await raw(a),before);
        await ctx.close(); return {...locked,unchanged:true};
    });
    report.status='passed';
} catch(e) { report.status='failed';report.failure=e.stack;console.error(e);process.exitCode=1; }
finally { for(const ctx of contexts)await ctx.close().catch(()=>{});await browser.close();report.finishedAt=new Date().toISOString();await writeFile(`${out}/compat-report.json`,JSON.stringify(report,null,2)); }
