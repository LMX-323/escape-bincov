import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORLD } from '../../src/world.ts';
import { browserOptions } from '../../scripts/browser-options.mjs';

const out = resolve('test-results/feedback-flow');
await mkdir(out, { recursive: true });
// Baseline investigation, not a CI regression test: some assertions intentionally
// reproduce defects. Replace them with desired outcomes when implementing fixes.
const report = { baseline: '4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2', startedAt: new Date().toISOString(), method: 'Offline Chromium mobile emulation and trusted touch. Synthetic player positions, bleeding and ammunition via explicit ?test=1. Viewport and CSS safe-area fixtures do not establish actual browser-bar or physical phone behavior.', checks: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, offline: true });
const page = await context.newPage(); page.setDefaultTimeout(10000);
page.on('pageerror', e => report.errors.push(e.message));
page.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const record = (name, data) => { report.checks.push({ name, ...data }); console.log(name, JSON.stringify(data)); };
const action = name => page.locator(`[data-action="${name}"]`);
const state = () => page.evaluate(() => { const { app } = __bincov; return { selected: app.selected, placement: app.placement, overlay: app.overlay, hp: app.raid.hp, elapsed: app.raid.elapsed }; });
async function resize(width, height) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(120);
  if (await action('close').count()) await action('close').tap();
}
async function inspect(selector) {
  return page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(), p = el.closest('.panel')?.getBoundingClientRect();
    const visible = getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { text: el.textContent, visible, rect: { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }, inViewport: r.y >= 0 && r.bottom <= innerHeight, inPanel: !p || (r.y >= p.y && r.bottom <= p.bottom), centerHit: !!hit && (hit === el || el.contains(hit)), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
  await action('enter').tap(); await page.locator('#seed').fill('42'); await action('deploy').tap();
  await page.waitForFunction(() => __bincov.app.raid?.player?.active);
  await page.evaluate(() => { const r = __bincov.app.raid; r.player.setPosition(700, 784); r.enemies.forEach(e => { e.cooldown = 9999; }); });
  for (const [width, height] of [[667,375],[740,300],[844,390],[915,412],[932,430]]) {
    await resize(width, height);
    await page.locator('[data-panel="inventory"]').tap();
    const initial = await inspect('[data-action="close"]');
    const safe = await inspect('[data-grid="safe"]');
    assert.equal(initial.centerHit, false); assert.equal(safe.centerHit, false);
    record(`inventory-exit-${width}x${height}`, { status: 'usability-gap-reproduced', initial, safe });
    if (width === 844) await page.screenshot({ path: resolve(out, 'inventory-exit-844.png') });
    await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();
    const closeDetails = await inspect('[data-action="clear-selection"]');
    assert.equal(closeDetails.centerHit, height !== 300);
    record(`detail-close-${width}x${height}`, { status: height === 300 ? 'usability-gap-reproduced' : 'reachable', ...closeDetails });
    if (width === 740) await page.screenshot({ path: resolve(out, 'details-exit-740.png') });
    await action('clear-selection').tap(); await action('close').tap();
  }
  await resize(844, 390);
  await page.locator('[data-panel="inventory"]').tap();
  await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();
  await action('place-item').tap();
  const placement = { ...(await state()), cancelButtons: await action('clear-selection').count(), instruction: await page.locator('.placement-hint').count() };
  assert.equal(placement.placement, true); assert.equal(placement.cancelButtons, 0); assert.equal(placement.instruction, 0);
  record('run-placement-no-cancel', { status: 'defect-reproduced', ...placement });
  await page.screenshot({ path: resolve(out, 'placement-no-cancel-844.png') });
  await action('close').tap(); await page.locator('[data-panel="inventory"]').tap();
  await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();
  const stuck = { ...(await state()), detailActions: await page.locator('.details:not(.details-empty)').count() };
  assert.equal(stuck.selected, ''); assert.equal(stuck.placement, true); assert.equal(stuck.detailActions, 0);
  record('run-placement-stuck-after-reopen', { status: 'defect-reproduced', ...stuck });
  // Fixture cleanup only. No corresponding touch-only reset is present in the run UI.
  await page.evaluate(() => { __bincov.app.placement = false; __bincov.setOverlay(''); });
  await page.evaluate(() => { const r = __bincov.app.raid; r.bleeding = 1; r.hp = 75; });
  await page.locator('[data-panel="inventory"]').tap(); const before = await state(); await page.waitForTimeout(400);
  const live = { before, after: await state(), pauseVisible: await page.locator('[data-panel="pause"]').isVisible() };
  assert.ok(live.after.elapsed > live.before.elapsed); assert.ok(live.after.hp < live.before.hp); assert.equal(live.pauseVisible, false);
  record('inventory-remains-live', { status: 'existing-rule-confirmed', ...live });
  await action('close').tap(); await page.evaluate(() => { __bincov.app.raid.bleeding = 0; });
  await resize(740, 300);
  await page.evaluate(note => { const r = __bincov.app.raid; r.loot.forEach(l => l.sprite.destroy()); r.loot = []; r.player.setPosition(note.x, note.y); }, WORLD.notes[0]);
  await page.waitForFunction(() => document.getElementById('touch-interact').textContent === '阅读');
  await page.locator('#touch-interact').tap();
  await page.waitForFunction(() => __bincov.app.raid.noteSeen.has('水产站维修单'));
  const reading = { radio: await inspect('#radio'), seen: await page.evaluate(() => [...__bincov.app.raid.noteSeen]) };
  assert.equal(reading.radio.visible, false); assert.match(reading.radio.text, /泵机零件三个/); assert.ok(reading.seen.includes('水产站维修单'));
  record('short-screen-reading-hidden', { status: 'defect-reproduced', ...reading });
  await page.screenshot({ path: resolve(out, 'reading-hidden-740.png') });
  await page.evaluate(() => { const r = __bincov.app.raid; r.mag = 1; r.reloadLeft = 0; r.knife = false; });
  await page.locator('[data-command="reload"]').tap();
  await page.waitForFunction(() => __bincov.app.raid.reloadLeft > 0);
  await page.waitForFunction(() => document.getElementById('reload').textContent.includes('换弹中'));
  const reload = { remaining: await page.evaluate(() => __bincov.app.raid.reloadLeft), indicator: await inspect('#reload'), button: await inspect('[data-command="reload"]') };
  assert.ok(reload.remaining > 0); assert.equal(reload.indicator.visible, false); assert.match(reload.indicator.text, /换弹中/); assert.equal(reload.button.text, '换弹');
  record('short-screen-reload-status-hidden', { status: 'defect-reproduced', ...reload });
  await page.screenshot({ path: resolve(out, 'reload-hidden-740.png') });
  await resize(844, 390);
  const active = await state(); await page.setViewportSize({ width: 844, height: 380 });
  await page.waitForTimeout(160);
  const resized = { before: active, after: await state() };
  assert.equal(resized.before.overlay, ''); assert.equal(resized.after.overlay, 'pause');
  record('height-only-resize-pauses', { status: 'simulated-risk-confirmed', note: 'Only a 10 CSS px height change is simulated. No claim of reproduced Safari/QQ toolbar behavior.', ...resized });
  await action('close').tap();
  for (const [width, height] of [[667,375],[740,300],[844,390]]) {
    await resize(width, height);
    await page.evaluate(() => { const r = __bincov.app.raid; r.player.setPosition(700, 784); r.loot.forEach(l => l.sprite.destroy()); r.loot = []; r.spawnLoot(700, 784, 'sample', 1); });
    await page.waitForFunction(() => document.getElementById('interaction').textContent.includes('样本'));
    const overlaps = await page.evaluate(() => {
      const r = document.getElementById('interaction').getBoundingClientRect();
      const overlap = b => Math.max(0, Math.min(r.right,b.right)-Math.max(r.x,b.x))*Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.y,b.y));
      return [...document.querySelectorAll('#touch-controls button')].map(b => ({ text: b.textContent, overlap: overlap(b.getBoundingClientRect()) })).filter(b => b.overlap > 0);
    });
    assert.equal(overlaps.length > 0, width === 667);
    record(`interaction-controls-${width}x${height}`, { status: overlaps.length ? 'panel-overlap-reproduced' : 'clear', note: 'Panel boundaries overlap; this alone does not prove item-name text or button centers are covered.', overlaps });
    if (width === 667) await page.screenshot({ path: resolve(out, 'controls-overlap-667.png') });
  }
  await resize(844, 390);
  await page.evaluate(() => { document.documentElement.style.setProperty('--safe-left', '47px'); document.documentElement.style.setProperty('--safe-right', '0px'); document.documentElement.style.setProperty('--safe-bottom', '21px'); dispatchEvent(new Event('resize')); });
  const safeControls = await page.locator('#touch-controls button').evaluateAll(buttons => buttons.map(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { label: el.textContent, inside: r.x >= 47 && r.right <= 844 && r.y >= 0 && r.bottom <= 369, minSize: r.width >= 48 && r.height >= 48, hit: hit === el || el.contains(hit) }; }));
  assert.ok(safeControls.every(b => b.inside && b.minSize && b.hit));
  record('injected-safe-area-control-reachability', { status: 'passed', controls: safeControls, note: 'Injected CSS values, not an actual notch/navigation bar.' });
  await page.evaluate(() => { for (const key of ['--safe-left', '--safe-right', '--safe-bottom']) document.documentElement.style.removeProperty(key); dispatchEvent(new Event('resize')); });
  await page.locator('[data-panel="map"]').tap();
  const mapClose = await inspect('[data-action="close"]');
  assert.equal(mapClose.centerHit, true);
  record('map-close-reachable', { status: 'passed', ...mapClose });
  await action('close').tap(); await page.locator('[data-panel="pause"]').tap();
  const paused = await state(); await page.waitForTimeout(250); const still = await state();
  assert.equal(paused.elapsed, still.elapsed);
  await action('close').tap();
  record('pause-and-resume', { status: 'passed', paused: paused.overlay, resumed: (await state()).overlay, elapsedFrozen: paused.elapsed === still.elapsed });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
  report.status = 'completed';
} catch (e) { report.status = 'failed'; report.failure = e.stack; console.error(e); process.exitCode = 1; }
finally { await context.close(); await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report,null,2)); }
