import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as D from '../../src/domain.ts';
import { browserOptions } from '../../scripts/browser-options.mjs';

const out = resolve('test-results/feedback');
await mkdir(out, { recursive: true });
const report = { baseline: '4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2', method: 'Current source and rebuilt HTML; Chromium touch emulation. Synthetic inventories, HP, player and loot positions only through ?test=1. No physical phone or QQ browser.', checks: [], errors: [], requests: [] };
const check = (name, data) => { report.checks.push({ name, ...data }); console.log(name, JSON.stringify(data)); };
for (const [first, second] of [['medkit', 'water'], ['water', 'medkit']]) {
  const inv = D.createInventory(2, 2);
  assert.equal(D.addItem(inv, first), 0);
  const left = D.addItem(inv, second);
  assert.equal(left, 1);
  check(`safe-${first}-then-${second}`, { status: 'limitation-reproduced', secondItemRemaining: left });
}
let arrangements = 0, validPairs = 0;
for (let my = 0; my < 2; my++) for (let wx = 0; wx < 2; wx++) {
  const inv = D.createInventory(2, 2);
  inv.items.push({ uid: 'med', id: 'medkit', qty: 1, x: 0, y: my });
  arrangements++;
  if (D.fits(inv, 'water', wx, 0)) validPairs++;
}
assert.equal(validPairs, 0);
check('all-fixed-orientation-pairs', { status: 'confirmed', arrangements, validPairs });

const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
const contexts = [];
async function fresh(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, offline: true });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
  await page.locator('[data-action="enter"]').tap();
  return page;
}
const action = (p, name, id) => p.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
async function deploy(p) {
  await p.locator('#seed').fill('42');
  await action(p, 'deploy').tap();
  await p.waitForFunction(() => window.__bincov?.app.raid?.player?.active);
  await p.evaluate(() => { const r = __bincov.app.raid; r.player.setPosition(700, 784); r.enemies.forEach(e => { e.cooldown = 9999; }); r.bleeding = 0; r.pollution = 0; });
}
async function screenshot(p, name) { await p.screenshot({ path: resolve(out, name + '.png') }); }
try {
  const prep = await fresh(390, 844);
  await action(prep, 'container', 'stash').tap();
  await prep.locator('.inventory-row').filter({ hasText: '急救包' }).tap();
  await action(prep, 'secure').tap();
  await action(prep, 'container', 'bag').tap();
  await prep.locator('[data-source="bag"][aria-label^="净水瓶"]').tap();
  await action(prep, 'secure').tap();
  assert.match(await prep.locator('#toast').innerText(), /放不下/);
  const prepState = await prep.evaluate(() => ({ safe: __bincov.app.save.safe, waterInBag: __bincov.app.save.bag.items.some(i => i.id === 'water'), notice: document.getElementById('toast').textContent }));
  assert.equal(prepState.waterInBag, true);
  assert.deepEqual(prepState.safe.items.map(i => i.id), ['medkit']);
  await screenshot(prep, 'safe-rejection-390');
  check('touch-safe-transfer', { status: 'limitation-reproduced', ...prepState });

  const p = await fresh(844, 390);
  await deploy(p);
  for (const [width, height] of [[667, 375], [740, 300], [844, 390], [915, 412], [932, 430]]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(120);
    if (await action(p, 'close').count()) await action(p, 'close').tap();
    const target = await p.locator('[data-command="heal"]').evaluate(el => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { text: el.textContent, x: r.x, y: r.y, width: r.width, height: r.height, hit: hit === el || el.contains(hit), onscreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    });
    assert.ok(target.hit && target.onscreen && target.width >= 48 && target.height >= 48);
    check(`heal-visible-${width}x${height}`, { status: 'passed', ...target });
  }
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(120);
  if (await action(p, 'close').count()) await action(p, 'close').tap();
  await screenshot(p, 'heal-button-844');
  await p.evaluate(() => { __bincov.app.raid.hp = 50; });
  await p.locator('[data-command="heal"]').tap();
  await p.waitForFunction(() => __bincov.app.raid.hp === 66);
  const treatment = await p.evaluate(() => ({ hp: __bincov.app.raid.hp, bandages: __bincov.app.loadout.bag.items.find(i => i.id === 'bandage')?.qty, notice: document.getElementById('toast').textContent }));
  assert.equal(treatment.bandages, 1);
  check('trusted-touch-heals-from-bag', { status: 'passed', ...treatment });

  await p.evaluate(() => {
    const { app } = __bincov;
    app.raid.hp = 40;
    app.loadout.bag.items = app.loadout.bag.items.filter(i => !['bandage', 'medkit'].includes(i.id));
    app.loadout.safe.items = [{ uid: 'safe-med', id: 'medkit', qty: 1, x: 0, y: 0 }];
    app.raid.checkpoint();
  });
  await p.locator('[data-command="heal"]').tap();
  await p.waitForTimeout(160);
  assert.equal(await p.evaluate(() => __bincov.app.raid.hp), 40);
  const noMedicine = await p.locator('#toast').innerText();
  assert.match(noMedicine, /背包中没有/);
  await screenshot(p, 'safe-medicine-shortcut-844');
  await p.locator('[data-panel="inventory"]').tap();
  await p.locator('[data-source="safe"][aria-label^="急救包"]').tap();
  await screenshot(p, 'safe-medicine-use-844');
  await action(p, 'use').tap();
  assert.equal(await p.evaluate(() => __bincov.app.raid.hp), 95);
  check('safe-only-medicine-shortcut-and-manual-use', { status: 'limitation-reproduced', shortcutMessage: noMedicine, hpBefore: 40, hpAfterShortcut: 40, hpAfterManualUse: 95, menuTaps: 3 });
  await action(p, 'close').tap();

  await p.evaluate(() => {
    const { app } = __bincov, r = app.raid;
    r.player.setPosition(700, 784); r.hp = 100; r.bleeding = 0; r.pollution = 0;
    r.loot.forEach(l => l.sprite.destroy()); r.loot = [];
    r.spawnLoot(700, 784, 'water', 1);
    r.spawnLoot(720, 784, 'bandage', 1);
    app.loadout.bag.items = Array.from({ length: 30 }, (_, i) => ({ uid: `full-${i}`, id: 'bandage', qty: i === 0 ? 3 : 4, x: i % 6, y: Math.floor(i / 6) }));
    r.checkpoint();
  });
  await p.waitForTimeout(120);
  await p.locator('#touch-interact').tap();
  await p.waitForTimeout(120);
  await p.locator('#touch-interact').tap();
  await p.waitForTimeout(120);
  const blocked = await p.evaluate(() => ({ bandages: __bincov.app.loadout.bag.items.reduce((n, i) => n + i.qty, 0), loot: __bincov.app.raid.loot.map(l => ({ id: l.id, qty: l.qty })), notice: document.getElementById('toast').textContent, prompt: document.getElementById('interaction').textContent }));
  assert.equal(blocked.bandages, 119);
  assert.deepEqual(blocked.loot.map(l => l.id), ['water', 'bandage']);
  assert.match(blocked.notice, /空间不足/);
  await screenshot(p, 'nearest-loot-blocked-844');
  assert.equal(await p.evaluate(() => __bincov.app.overlay), '');
  await p.evaluate(() => { __bincov.app.raid.player.setPosition(720, 784); });
  await p.waitForTimeout(120);
  await p.locator('#touch-interact').tap();
  await p.waitForFunction(() => __bincov.app.raid.loot.length === 1);
  const afterMoving = await p.evaluate(() => ({ bandages: __bincov.app.loadout.bag.items.reduce((n, i) => n + i.qty, 0), loot: __bincov.app.raid.loot.map(l => l.id) }));
  assert.equal(afterMoving.bandages, 120);
  check('nearest-unfittable-loot-blocks-stackable-neighbor', { status: 'limitation-reproduced', afterTwoTaps: blocked, afterMoving20Pixels: afterMoving });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requests, []);
  report.status = 'completed';
} catch (e) {
  report.status = 'failed'; report.failure = e.stack; process.exitCode = 1; console.error(e);
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
