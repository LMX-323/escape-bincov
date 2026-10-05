/** Controlled save fixtures, real UI input; HTTP is diagnostic, file:// is offline acceptance. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { placeAt, clickSlot } from './inventory-actions.mjs';
const url = new URL(process.env.BINCOV_TEST_URL || pathToFileURL(resolve('dist/index.html')).href);
if (url.protocol !== 'file:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw Error('Only offline or loopback test URLs are supported');
url.searchParams.set('test', '1');
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { mode: url.protocol === 'file:' ? 'offline' : 'local HTTP diagnostic', browser: browser.version(), results: [] };
async function suite(viewport, touch = false) {
  const label = `${viewport.width}x${viewport.height}${touch ? '-touch' : ''}`;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, offline: url.protocol === 'file:' });
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  await context.route(/^https?:/, route => { if (url.protocol === 'http:' && new URL(route.request().url()).origin === url.origin) return route.continue(); errors.push('External request'); return route.abort(); });
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
  const save = () => page.evaluate(() => structuredClone(window.__bincov.app.save));
  const overlay = () => page.evaluate(() => window.__bincov.app.overlay);
  async function step(name, work) {
    const row = { viewport: label, name, status: 'running' }; report.results.push(row);
    try { await work(); assert.deepEqual(errors, []); row.status = 'passed'; console.log('PASS', label, name); }
    catch (e) { row.status = 'failed'; row.error = e.stack; await page.screenshot({ path: resolve(out, `qol-failed-${label}.png`) }); throw e; }
  }
  try {
    await page.goto(url.href); await action('enter').click();
    await page.evaluate(() => {
      const { app, persist } = window.__bincov;
      app.save.cash = 0; app.save.stash.items = [
        { uid: 'shop-watch', id: 'watch', qty: 1, x: 0, y: 0 },
        { uid: 'shop-scrap', id: 'scrap', qty: 3, x: 1, y: 0 },
      ]; app.save.bag.items = []; app.save.safe.items = []; persist();
    });
    await action('tab', 'arms').click();
    await step('mixed transaction stays provisional, cancels both ways, confirms leaving and uses net cash', async () => {
      const before = await save();
      await placeAt(page, 'merchant', 'ammo9', 'buy');
      await placeAt(page, 'stash', 'watch', 'sell');
      assert.deepEqual(await save(), before);
      assert.match(await page.locator('.shop-checkout').innerText(), /可得 ¥ 156/);
      await page.screenshot({ path: resolve(out, `qol-shop-${label}.png`) });
      await action('tab', 'med').click(); assert.equal(await overlay(), 'shop-leave');
      await action('close').click(); assert.deepEqual(await save(), before);
      await placeAt(page, 'buy', 'ammo9', 'merchant'); await placeAt(page, 'sell', 'watch', 'stash');
      assert.deepEqual(await save(), before);
      await placeAt(page, 'merchant', 'ammo9', 'buy'); await placeAt(page, 'stash', 'watch', 'sell');
      await action('checkout').click(); const after = await save(); assert.equal(after.cash, 156);
      assert.equal(after.stash.items.find(i => i.id === 'ammo9').qty, 12); assert.ok(!after.stash.items.some(i => i.id === 'watch'));
      assert.equal(await action('checkout').isDisabled(), true);
    });
    await step('quest sale explains final shortage; cancel and save failure preserve the whole transaction', async () => {
      const before = await save(); await placeAt(page, 'stash', 'scrap', 'sell');
      await action('checkout').click(); assert.equal(await overlay(), 'shop-quest');
      assert.match(await page.locator('.modal').innerText(), /需要 泵机零件 3 件.*卖出 3 件.*剩 0 件/s);
      await action('close').click(); assert.deepEqual(await save(), before);
      await page.evaluate(() => { window.__realWrite = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'escape-bincov.session.v2') throw new DOMException('quota', 'QuotaExceededError'); return window.__realWrite.call(this,k,v); }; });
      await action('checkout').click(); await action('checkout-confirm').click(); assert.deepEqual(await save(), before);
      await page.evaluate(() => { Storage.prototype.setItem = window.__realWrite; });
      await action('checkout').click(); await action('checkout-confirm').click(); assert.equal((await save()).cash, before.cash + 105);
      await page.reload(); await action('enter').click(); assert.equal((await save()).cash, before.cash + 105);
    });
    await step('loot rotation and quantity previews cancel cleanly; split and partial merge preserve remainders', async () => {
      await page.evaluate(() => {
        const { app, persist } = window.__bincov;
        app.save.equipment = {weapon:'pistol',ammo:8,ammoRelief:0,relief:false};
        app.save.bag.items = [{ uid: 'qol-ammo', id: 'ammo9', qty: 35, x: 0, y: 0 }]; app.save.safe.items = []; persist();
      });
      await page.locator('#seed').fill('42'); await action('deploy').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      const id = await page.evaluate(() => {
        const a = window.__bincov.app, r = a.raid, c = r.containers[0];
        r.enemies.forEach(e => { e.sprite.setPosition(208,1456); e.home = e.target = {x:208,y:1456}; e.timer = e.cooldown = 9999; e.path = []; });
        c.inventory.items = [{uid:'qol-water',id:'water',qty:2,x:0,y:0},{uid:'qol-incoming',id:'ammo9',qty:12,x:1,y:0}];
        r.player.setPosition(c.x,c.y); r.hp=100; r.bleeding=0; r.checkpoint(); return c.id;
      });
      if (touch) await page.locator(`[data-loot-target="${id}"] button`).tap(); else await page.keyboard.press('e');
      const inventoryState = () => page.evaluate(id => ({bag:window.__bincov.app.loadout.bag, safe:window.__bincov.app.loadout.safe, source:window.__bincov.app.raid.getLootContainer(id).inventory}), id);
      const before = await inventoryState();
      await page.locator('[data-uid="qol-water"]').click(); await action('rotate-item').click();
      assert.deepEqual(await inventoryState(), before); await action('clear-selection').click(); assert.deepEqual(await inventoryState(), before);
      await page.locator('[data-uid="qol-water"]').click(); await page.locator('#split-quantity').fill('1'); await action('split-item').click();
      await action('rotate-preview').click(); await clickSlot(page,'safe',0,0);
      let after = await inventoryState(); assert.equal(after.source.items.find(i=>i.uid==='qol-water').qty,1);
      assert.equal(after.safe.items[0].rotated,true); assert.equal(after.safe.items[0].qty,1); assert.notEqual(after.safe.items[0].uid,'qol-water');
      await placeAt(page,'container','ammo9','bag',0,0); after = await inventoryState();
      assert.equal(after.bag.items.find(i=>i.uid==='qol-ammo').qty,40); assert.equal(after.source.items.find(i=>i.uid==='qol-incoming').qty,7);
      await page.screenshot({path:resolve(out,`qol-inventory-${label}.png`)}); await action('close').click();
    });
  } finally { await context.close(); }
}
try {
  await suite({ width: 1280, height: 720 }); await suite({ width: 1920, height: 1080 });
  await suite({ width: 844, height: 390 }, true);
} finally { await writeFile(resolve(out, 'qol-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
