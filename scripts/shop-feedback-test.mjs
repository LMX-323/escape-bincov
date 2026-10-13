// Packaged game, real transactions and visible controls; only inventory setup uses ?test=1.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/shop-feedback'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions), report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), checks: [] };
let context, page, errors = [];
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
async function open(size, kind, tabs = false) {
  await context?.close(); context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, hasTouch: size[0] < 500 });
  errors = [];
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://shop.test/')) errors.push(`External request: ${r.url()}`); });
  await context.route('https://shop.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(String(e.stack)));
  await page.clock.setFixedTime(new Date());
  await page.goto(`https://shop.test/?test=1${tabs ? '&entry=tabs' : ''}`);
  await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
  await page.evaluate(kind => {
    const s = window.__bincov.saveSession; if (!s.ensureRpg()) throw Error('fixture upgrade');
    const ticket = s.prepareExpansionMutation(d => {
      d.profile.cash = kind === 'funds' ? 0 : 5000;
      d.profile.stash.items = kind === 'space' ? Array.from({ length: 60 }, (_, i) => ({ uid: `full-${i}`, id: 'scrap', qty: 5, x: i % 10, y: Math.floor(i / 10) })) : [];
    });
    if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('fixture commit');
  }, kind);
  await page.locator('[data-action="enter"]').click();
  if (tabs) await page.locator('[data-action="tab"][data-id="arms"]').click();
  else {
    await page.waitForFunction(() => window.__station?.mounted);
    const quick = page.locator('#station-yard [data-quick="arms"]');
    if (!await quick.isVisible()) await page.locator('#station-yard [data-quickmenu]').click();
    await quick.click();
  }
}
async function check(name, fn) {
  const row = { name }; report.checks.push(row);
  try { row.detail = await fn(); assert.deepEqual(errors, []); row.status = 'passed'; }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; }
  await page?.screenshot({ path: resolve(out, `${report.checks.length}.png`) }).catch(() => {});
  console.log(row.status, name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
try {
  for (const size of [[1280, 720], [1920, 1080], [390, 844]]) for (const kind of ['funds', 'space']) await check(`${size.join('x')} ${kind} rejection`, async () => {
    await open(size, kind);
    const id = await page.evaluate(() => window.__station.host.ui.shop.view().catalog.items.find(i => i.id === 'pistol').uid);
    const item = page.locator(`#station-yard [data-grid="merchant"] [data-uid="${id}"]`);
    if (size[0] < 500) {
      await item.scrollIntoViewIfNeeded();
      await page.evaluate(async () => { const root = document.querySelector('#station-yard').shadowRoot; await Promise.all([...root.querySelectorAll('.panel')].flatMap(e => e.getAnimations()).map(a => a.finished.catch(() => {}))); });
      const box = await item.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y);
    } else await item.dblclick();
    await page.waitForFunction(() => window.__station.host.ui.shop.view().buy.items.length === 1);
    const before = await raw(); await page.locator('#station-yard [data-act="cart-settle"]').click();
    const toast = page.locator('#station-yard .toast').last(); await toast.waitFor();
    const message = await toast.innerText(); assert.match(message, kind === 'funds' ? /现金不足/ : /仓库空间不足/);
    assert.equal(await raw(), before); assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().buy.items.length), 1);
    await toast.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
    const box = await toast.boundingBox(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size[0] + 1 && box.y + box.height <= size[1] + 1);
    return { message, box, unchangedSave: true };
  });
  for (const tabs of [false, true]) await check(`${tabs ? 'tabs' : 'yard'} refreshes stale empty cart without reopening`, async () => {
    await open([1280, 720], 'stale', tabs);
    await page.evaluate(() => {
      const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => { d.profile.stash.items.push({ uid: 'new-stock', id: 'watch', qty: 1, x: 0, y: 0 }); });
      if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('external commit');
      window.__bincov.hideoutRuntime.snapshot();
      if (window.__station?.mounted) window.__station.host.ui.refresh(true);
    });
    if (tabs) await page.locator('[data-action="tab"][data-id="arms"]').click();
    const before = await raw(), reset = page.locator(tabs ? '[data-action="cart-reset"]' : '#station-yard [data-act="cart-reset"]');
    await reset.waitFor(); assert.equal(await reset.innerText(), '刷新清单'); assert.ok(await reset.isEnabled());
    await reset.click(); assert.equal(await raw(), before);
    await page.locator(`${tabs ? '' : '#station-yard '}[data-grid="stash"] [data-uid="new-stock"]`).waitFor();
    if (!tabs) assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().stale), false);
    return { unchangedSave: true, newStockVisible: true };
  });
  for (const kind of ['funds', 'space']) await check(`legacy tabs show the same ${kind} rejection`, async () => {
    await open([1280, 720], kind, true);
    const uid = await page.evaluate(() => window.__bincov.app.shop.catalog.items.find(i => i.id === 'pistol').uid);
    const item = await page.locator(`[data-grid="merchant"] [data-uid="${uid}"]`).boundingBox();
    const target = await page.locator('[data-grid="buy"]').boundingBox();
    await page.mouse.move(item.x + 10, item.y + 10); await page.mouse.down();
    await page.mouse.move(target.x + 10, target.y + 10, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => window.__bincov.app.shop.buy.items.length === 1);
    const before = await raw(); await page.locator('[data-action="checkout"]').click();
    const message = await page.locator('#toast').innerText(); assert.match(message, kind === 'funds' ? /现金不足/ : /仓库空间不足/);
    assert.equal(await raw(), before); return { message, unchangedSave: true };
  });
  await check('another window still locks settlement and cannot be overwritten through refresh', async () => {
    await open([1280, 720], 'funds');
    const peer = await context.newPage(); await peer.goto('https://shop.test/?test=1');
    await peer.waitForFunction(() => window.__bincov?.saveSession);
    // A real other-window storage event, with valid new bytes; no mutation of this window's state flags.
    const newer = await peer.evaluate(() => {
      const key = 'escape-bincov.session.v2', record = JSON.parse(localStorage.getItem(key));
      record.revision++; record.profile.cash += 1; const raw = JSON.stringify(record); localStorage.setItem(key, raw); return raw;
    });
    await page.waitForFunction(() => window.__bincov.app.conflict);
    const result = await page.evaluate(() => {
      const shop = window.__station.host.ui.shop; shop.reset(); return shop.settle();
    });
    assert.equal(result.reason, 'conflict'); assert.equal(await raw(), newer); await peer.close();
    return { result, newerSavePreserved: true };
  });
} finally { await context?.close(); await browser.close(); }
