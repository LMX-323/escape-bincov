/**
 * Gunsmith workbench (#28 M2-05, M2-06): the packaged game offline, the real station yard and HideoutRuntime, mouse input.
 * Opens the bench from the weapon slot, item details and the workbench facility; previews never write; confirm writes
 * once; replacing a handguard takes its rail parts along; a smaller magazine unloads into the stash; switching guns or
 * closing with a preview asks first. Screenshots at 1280x720 and 1920x1080. Phones (M2-06, touch): three pages, cancel
 * and confirm in the bottom bar at 844x390, 740x300, 640x300 and 390x844, every step a tap, rotation keeps the preview.
 * Fixtures use the session with ?test=1.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';
import * as D from '../src/domain.ts';
import { factoryState } from '../src/gunsmith/instance.ts';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const out = resolve(option('out', 'test-results/gunsmith-bench')), filter = stepFilter();
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML offline; real mouse input on the station yard, its HideoutRuntime, SaveSession and localStorage. Fixtures use the session transaction with ?test=1.', steps: [], errors: [], external: [], screenshots: [] };
let context, page, mobile = false;
const yard = s => page.locator(`#station-yard ${s}`);
const bench = s => yard(`.modal.k-gunsmith ${s}`);
const snapshot = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const ready = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); };
const GUN = 'gun-bench-m4';

/** M4A1 equipped with 28 rounds; a G17 and ten sample parts in the stash; spare rounds in the bag. */
function fixture() {
  const p = D.newSave(); p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2); p.cash = 900;
  p.equipment = { weapon: 'mb4a1', weaponUid: GUN, gun: factoryState(), ammo: 28, ammoRelief: 0, relief: false };
  for (const id of ['gb17', 'O03', 'O08', 'H01', 'F01', 'T01', 'G10', 'S01', 'B01', 'M03']) assert.equal(D.addItem(p.stash, id), 0, id);
  assert.equal(D.addItem(p.bag, 'ammoR', 30), 0);
  return p;
}
async function seed(p) {
  await page.evaluate(async p => {
    await window.__station.reseed(() => {
      const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
        for (const key of ['cash', 'stash', 'bag', 'safe', 'equipment', 'upgraded']) d.profile[key] = structuredClone(p[key]);
      });
      if (s.commitExpansionMutation(t) !== 'committed') throw Error('fixture did not commit');
    });
  }, p);
  await ready();
}
async function open(p = fixture(), size = [1280, 720]) {
  await context?.close();
  mobile = size[0] < 900 || size[1] < 560;
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('https://station.test/?test=1'); await page.locator('[data-action="enter"]').click(); await ready(); await seed(p);
}
const tap = el => mobile ? el.tap() : el.click();
async function quick(kind) {
  const btn = yard(`[data-quick="${kind}"]`); if (!await btn.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(btn);
}
/** From the weapon slot of the gear panel. */
async function openFromSlot() {
  await quick('gear'); await tap(yard(`[data-act="gunsmith:${GUN}"]`)); await bench('.gs').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const m = document.querySelector('#station-yard').shadowRoot.querySelector('.modal.k-gunsmith');
    await Promise.all(m.getAnimations().map(a => a.finished.catch(() => {})));
  });
}
const pos = key => bench(`[data-gs="pos"][data-arg="${key}"]`);
const part = id => bench(`.gs-list [data-gs="part"][data-arg="${id}"]`);
const equipped = async () => (await snapshot()).profile.equipment;
/** The whole bench inside the viewport, no horizontal scroll, the confirm and cancel buttons visible. */
async function fits() {
  const size = page.viewportSize();
  for (const sel of ['.gs', '[data-gs="confirm"]', '[data-gs="cancel"]', '.gs-stats h3']) {
    const r = await bench(sel).boundingBox();
    assert.ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= size.width + 1 && r.y + r.height <= size.height + 1, `${sel} outside the viewport`);
  }
  assert.equal(await bench('.gs').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, 'bench scrolls sideways');
}
/** Phones: the header, the page and the bottom bar inside the screen, nothing scrolls sideways, cancel and confirm are on top. */
async function phoneFits() {
  const size = page.viewportSize();
  if (process.env.GS_BOXES) console.log(await page.evaluate(await readFile(process.env.GS_BOXES, 'utf8')));
  for (const sel of ['.gs-ctop', '.gs-cfoot', '[data-gs="confirm"]', '[data-gs="cancel"]', '[data-gs="close"]']) {
    const r = await bench(sel).boundingBox();
    assert.ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= size.width + 1 && r.y + r.height <= size.height + 1, `${sel} outside ${size.width}x${size.height}`);
  }
  for (const sel of ['.gs', '.gs-cpage']) assert.equal(await bench(sel).evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `${sel} scrolls sideways`);
  assert.ok(await bench('[data-gs="confirm"]').evaluate(el => {
    const r = el.getBoundingClientRect(), hit = el.getRootNode().elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  }), 'confirm is covered');
}
const phonePage = async name => { await tap(bench(`.gs-tabs [data-gs="page"][data-arg="${name}"]`)); await bench(`.gs-cpage.gs-p-${name}`).waitFor(); };
async function step(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name }, errorStart = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errorStart), []); assert.deepEqual(report.external, []);
    assert.deepEqual(await page.evaluate(() => window.__station?.host?.errors ?? []), []); row.status = 'passed'; console.log('PASS', name);
  } catch (e) { row.status = 'failed'; row.error = String(e.stack); await shot(`failure-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
}

try {
  await step('B1-preview-writes-nothing-confirm-writes-once', async () => {
    await open(); await openFromSlot(); await fits();
    const before = await raw();
    await pos('gun/top/0').click(); await part('O08').click();
    await bench('.gs-badge').waitFor();
    assert.match(await bench('.gs-badge').innerText(), /1 处改动/);
    assert.match(await bench('.gs-foot').innerText(), /轻型远距镜/);
    assert.equal(await raw(), before, 'a preview writes nothing');
    assert.deepEqual((await equipped()).gun.parts, []);
    await shot('01-desktop-1280x720-preview');
    await bench('[data-gs="cancel"]').click();
    assert.equal(await bench('.gs-badge').count(), 0);
    await part('O08').click(); await bench('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    const e = await equipped(); assert.equal(e.gun.parts[0].id, 'O08');
    assert.equal(D.count((await snapshot()).profile.stash, 'O08'), 0, 'the scope left the stash');
    assert.equal(await bench('.gs-badge').count(), 0, 'no preview after the commit');
    assert.notEqual(await raw(), before);
  });

  await step('B2-handguard-rails-magazine-unload', async () => {
    await open(); await openFromSlot();
    // Closed until a railed handguard is on.
    assert.match(await pos('gun/under/0').innerText(), /需要 AR 短导轨护木/);
    await pos('gun/handguard/0').click(); await part('H01').click();
    const h01 = (await bench('.gs-foot').innerText()); assert.match(h01, /AR 短导轨护木/);
    const keys = await bench('[data-gs="pos"]').evaluateAll(els => els.map(e => e.dataset.arg));
    const under = keys.find(k => k.endsWith('/under/0') && !k.startsWith('gun/')), side = keys.find(k => k.endsWith('/side/0') && !k.startsWith('gun/'));
    assert.ok(under && side, `rail positions: ${keys}`);
    await pos(under).click(); await part('F01').click();
    await pos(side).click(); await part('T01').click();
    await pos('gun/mag/0').click(); await part('G10').click();
    const foot = await bench('.gs-foot').innerText();
    assert.match(foot, /卸出 8 发卡宾枪弹/); assert.match(foot, /30 发 → 20 发/);
    assert.match(await bench('.gs-badge').innerText(), /4 处改动/);
    await bench('[data-gs="detail"]').click(); assert.match(await bench('.gs-stats').innerText(), /弹匣 30 发 → 20 发/);
    await shot('02-desktop-1280x720-mid-edit'); await fits();
    await bench('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 2);
    const e = await equipped(), p = (await snapshot()).profile;
    assert.equal(e.ammo, 20); assert.equal(D.count(p.stash, 'ammoR'), 8);
    assert.deepEqual(e.gun.parts.map(n => [n.id, n.children.map(c => c.id).sort()]).sort(), [['G10', []], ['H01', ['F01', 'T01']]]);
    // Back to the factory handguard: the foregrip and the laser come off with it.
    await pos('gun/handguard/0').click(); await bench('.gs-list [data-gs="part"][data-arg=""]').click();
    const rem = await bench('.gs-foot').innerText();
    assert.match(rem, /短垂直前握把/); assert.match(rem, /随AR 短导轨护木拆下|随 AR 短导轨护木拆下/);
    await bench('[data-gs="cancel"]').click();
  });

  await step('B3-refusal-and-switch-guns-asks-first', async () => {
    await open(); await openFromSlot();
    await pos('gun/top/0').click(); await part('O03').click(); await bench('.gs-badge').waitFor();
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await bench(`[data-gs="gun"][data-arg="${g17}"]`).click();
    await bench('.gs-dialog').waitFor(); await shot('03-desktop-1280x720-switch-dialog');
    await bench('[data-gs="leave-stay"]').click(); assert.equal(await bench('.gs-dialog').count(), 0);
    assert.match(await bench('.gs-badge').innerText(), /1 处改动/, 'staying keeps the preview');
    await bench(`[data-gs="gun"][data-arg="${g17}"]`).click(); await bench('[data-gs="leave-discard"]').click();
    assert.match(await bench('.gs-head').innerText(), /G17/);
    assert.equal(await bench('.gs-badge').count(), 0);
    // A suppressor before the barrel group: refused with the reason, nothing previewed.
    await pos('gun/muzzle/0').click(); await part('M03').click();
    assert.match(await bench('.gs-refuse').innerText(), /需要九系精瞄枪管组/);
    assert.equal(await bench('.gs-badge').count(), 0);
    await pos('gun/barrel/0').click(); await part('B01').click();
    await pos('gun/muzzle/0').click(); await part('M03').click();
    assert.match(await bench('.gs-badge').innerText(), /2 处改动/);
    await bench('[data-gs="detail"]').click(); assert.match(await bench('.gs-stats').innerText(), /510 → 255/);
    await shot('04-desktop-1280x720-g17');
    // Esc with a preview asks; Esc again stays; discarding closes back to the gear panel.
    await page.keyboard.press('Escape'); await bench('.gs-dialog').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await bench('.gs-dialog').count(), 0);
    await page.keyboard.press('Escape'); await bench('[data-gs="leave-discard"]').click();
    await yard('.panel.k-gear').waitFor(); assert.equal(await yard('.modal.k-gunsmith').isVisible(), false);
  });

  await step('B4-entries-details-and-workbench', async () => {
    await open();
    await quick('gear');
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await yard(`[data-grid="stash"] [data-uid="${g17}"]`).click(); await yard('.details [data-act="gunsmith"]').click();
    await bench('.gs').waitFor(); assert.match(await bench('.gs-head').innerText(), /G17/);
    await yard('.modal.k-gunsmith .phead [data-act="close"]').click();
    await yard('.panel.k-gear').waitFor();
    await yard('[data-tab="facility"]').click(); await yard('[data-act="fac:workbench"]').click(); await yard('.bench-entry [data-act="gunsmith"]').click();
    await bench('.gs').waitFor(); assert.match(await bench('.gs-head').innerText(), /M4A1/);
  });

  await step('B6-old-tab-page-same-panel', async () => {
    await open(); await yard('[data-tabs]').click();
    await page.locator('[data-action="gunsmith-open"]').first().click();
    const old = s => page.locator(`.gs-page ${s}`);
    await old('.gs').waitFor(); await page.evaluate(() => document.fonts.ready);
    await old('[data-gs="pos"][data-arg="gun/top/0"]').click(); await old('.gs-list [data-gs="part"][data-arg="O03"]').click();
    assert.match(await old('.gs-badge').innerText(), /1 处改动/);
    await shot('06-tab-page-1280x720');
    await old('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    assert.equal((await equipped()).gun.parts[0].id, 'O03');
    await old('[data-gs="pos"][data-arg="gun/mag/0"]').click(); await old('.gs-list [data-gs="part"][data-arg="G10"]').click();
    await page.keyboard.press('Escape'); await old('.gs-dialog').waitFor();
    await old('[data-gs="leave-discard"]').click(); assert.equal(await page.locator('.gs-page').count(), 0);
  });

  await step('P1-phone-844x390-pages-taps-rotation', async () => {
    await open(fixture(), [844, 390]); await openFromSlot();
    assert.equal(await bench('.gs.gs-compact').count(), 1); await phoneFits();
    assert.equal(await yard('.modal.k-gunsmith > .phead').isVisible(), false, 'the bench brings its own header');
    await shot('07-phone-844x390-body');
    // A position on the body page opens the parts page for it.
    await tap(pos('gun/top/0')); await bench('.gs-cpage.gs-p-parts').waitFor();
    assert.match(await bench('.gs-tabs [data-arg="parts"]').innerText(), /瞄具/);
    await tap(part('O08')); await phoneFits();
    assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/);
    await shot('08-phone-844x390-parts');
    await phonePage('stats'); assert.match(await bench('.gs-stats').innerText(), /精度/); await phoneFits();
    await tap(bench('.gs-sumbtn')); await bench('.gs-sheet').waitFor();
    assert.match(await bench('.gs-sheet').innerText(), /轻型远距镜/);
    await shot('09-phone-844x390-sheet');
    await tap(bench('.gs-sheet [data-gs="sheet"]')); assert.equal(await bench('.gs-sheet').count(), 0);
    // Turning the phone keeps the preview and the page.
    await page.setViewportSize({ width: 390, height: 844 }); await bench('.gs.gs-compact').waitFor();
    assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/); await phoneFits();
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal((await equipped()).gun.parts.length, 0, 'nothing written yet');
    await tap(bench('[data-gs="confirm"]'));
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    assert.equal((await equipped()).gun.parts[0].id, 'O08');
  });

  for (const size of [[740, 300], [640, 300]]) await step(`P2-phone-${size[0]}x${size[1]}-short`, async () => {
    await open(fixture(), size); await openFromSlot(); await phoneFits();
    await tap(pos('gun/mag/0')); await tap(part('G10')); await phoneFits();
    assert.match(await bench('.gs-sumbtn').innerText(), /卸出 8 发/);
    await shot(`10-phone-${size[0]}x${size[1]}-parts`);
    await phonePage('body'); await phoneFits();
    await shot(`11-phone-${size[0]}x${size[1]}-body`);
    await tap(bench('[data-gs="cancel"]')); assert.match(await bench('.gs-sumbtn').innerText(), /还没有改动/);
  });

  await step('P3-phone-390x844-switch-and-close-ask', async () => {
    await open(fixture(), [390, 844]); await openFromSlot(); await phoneFits();
    await shot('12-phone-390x844-body');
    await tap(pos('gun/handguard/0')); await tap(part('H01'));
    await shot('13-phone-390x844-parts');
    await phonePage('stats'); await tap(bench('[data-gs="detail"]')); await shot('14-phone-390x844-stats');
    await phonePage('body');
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await tap(bench(`[data-gs="gun"][data-arg="${g17}"]`)); await bench('.gs-dialog').waitFor();
    await tap(bench('[data-gs="leave-stay"]')); assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/);
    await tap(bench('.gs-ctop [data-gs="close"]')); await bench('.gs-dialog').waitFor();
    await tap(bench('[data-gs="leave-discard"]')); assert.equal(await yard('.modal.k-gunsmith').isVisible(), false);
  });

  await step('P4-phone-390x844-old-tab-page', async () => {
    await open(fixture(), [390, 844]);
    const tabs = yard('[data-tabs]'); if (!await tabs.isVisible()) await tap(yard('[data-quickmenu]'));
    // The phone tab page shows the equipment card under its own container tab.
    await tap(tabs); await tap(page.locator('[data-action="container"][data-id="safe"]')); await tap(page.locator('[data-action="gunsmith-open"]').first());
    const old = s => page.locator(`.gs-page ${s}`);
    await old('.gs.gs-compact').waitFor();
    await tap(old('[data-gs="pos"][data-arg="gun/top/0"]')); await tap(old('.gs-list [data-gs="part"][data-arg="O03"]'));
    assert.match(await old('.gs-sumbtn').innerText(), /待装 1/);
    const size = page.viewportSize(), r = await old('[data-gs="confirm"]').boundingBox();
    assert.ok(r && r.y + r.height <= size.height + 1, 'confirm on screen');
    await shot('15-phone-390x844-tab-page');
    await tap(old('[data-gs="confirm"]'));
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    await tap(old('.gs-ctop [data-gs="close"]')); assert.equal(await page.locator('.gs-page').count(), 0);
  });

  await step('B5-desktop-1920x1080', async () => {
    await open(fixture(), [1920, 1080]); await openFromSlot(); await fits();
    await pos('gun/top/0').click(); await bench('[data-gs="unowned"]').click(); await bench('[data-gs="detail"]').click();
    await part('O08').click();
    await shot('05-desktop-1920x1080');
  });
} finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  const filterProblems = reportFilter(filter, report.steps.length); if (filterProblems.length) report.summary.filterProblems = filterProblems;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.total || report.errors.length || report.external.length) process.exitCode = 1;
}
