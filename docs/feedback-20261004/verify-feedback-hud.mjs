import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOptions } from '../../scripts/browser-options.mjs';

const out = resolve('test-results/feedback-hud');
await mkdir(out, { recursive: true });
const report = { baseline: '4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2', method: 'Rebuilt baseline HTML, offline Chromium touch emulation, trusted touch pickup. Synthetic HP, bleeding and world positions through ?test=1. Not physical phone validation.', checks: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, offline: true });
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', e => report.errors.push(e.message));
page.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const record = (name, data) => { report.checks.push({ name, ...data }); console.log(name, JSON.stringify(data)); };
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
  await page.locator('[data-action="enter"]').tap();
  await page.locator('#seed').fill('42');
  await page.locator('[data-action="deploy"]').tap();
  await page.waitForFunction(() => window.__bincov?.app.raid?.player?.active);
  for (const [width, height] of [[667, 375], [740, 300], [844, 390], [915, 412], [932, 430]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    if (await page.locator('[data-action="close"]').count()) await page.locator('[data-action="close"]').tap();
    await page.evaluate(() => {
      const { app } = __bincov, r = app.raid;
      r.hp = 53; r.bleeding = 1; r.pollution = 0;
      r.player.setPosition(700, 784);
      r.enemies.forEach(e => { e.cooldown = 9999; });
      r.loot.forEach(l => l.sprite.destroy()); r.loot = [];
      r.spawnLoot(700, 784, 'fuse', 1);
      r.spawnLoot(720, 784, 'water', 1);
    });
    await page.waitForFunction(() => document.getElementById('interaction')?.textContent.includes('陶瓷保险管'));
    await page.locator('#touch-interact').tap();
    await page.waitForFunction(() => document.getElementById('interaction')?.textContent.includes('净水瓶') && getComputedStyle(document.getElementById('toast')).opacity === '1');
    const state = await page.evaluate(() => {
      const toast = document.getElementById('toast'), nearby = document.getElementById('interaction');
      const rect = r => ({ x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
      const range = document.createRange(); range.selectNodeContents(nearby);
      const a = rect(toast.getBoundingClientRect()), b = rect(nearby.getBoundingClientRect()), text = rect(range.getBoundingClientRect());
      const overlap = (x, y) => Math.max(0, Math.min(x.right, y.right) - Math.max(x.x, y.x)) * Math.max(0, Math.min(x.bottom, y.bottom) - Math.max(x.y, y.y));
      return { mobile: __bincov.playerInput.touch, toast: toast.textContent, nearby: nearby.textContent, warning: document.getElementById('warning').textContent, toastRect: a, nearbyRect: b, nearbyTextRect: text, panelOverlapArea: overlap(a, b), textOverlapArea: overlap(a, text), textCoveredRatio: overlap(a, text) / (text.width * text.height), toastZIndex: getComputedStyle(toast).zIndex };
    });
    assert.equal(state.mobile, true);
    assert.equal(state.toast, '物资已收入背包。');
    assert.ok(state.textOverlapArea > 0);
    assert.match(state.warning, /Q 止血/);
    record(`toast-covers-nearby-${width}x${height}`, { status: 'defect-reproduced', ...state });
    if (width === 844 || width === 740) await page.screenshot({ path: resolve(out, `toast-and-keyboard-${width}.png`) });
  }
  record('touch-bleeding-instruction', { status: 'defect-reproduced', text: await page.locator('#warning').innerText() });
  await page.locator('[data-panel="inventory"]').tap();
  await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();
  const description = await page.locator('.item-description').innerText();
  assert.match(description, /按 Q/);
  record('touch-bandage-description', { status: 'defect-reproduced', text: description });
  await page.locator('[data-action="clear-selection"]').tap();
  await page.locator('[data-action="close"]').tap();
  // Phaser text is drawn into the canvas, so DOM-only text checks miss it.
  await page.evaluate(() => { const r = __bincov.app.raid, e = r.config.exits[0]; r.player.setPosition(e.x, e.y); });
  await page.waitForTimeout(600);
  const canvasLabels = await page.evaluate(() => {
    const r = __bincov.app.raid, cam = r.cameras.main, view = cam.worldView;
    return r.children.list.filter(o => o.type === 'Text' && o.visible && /按住 E/.test(o.text)).map(o => {
      const b = o.getBounds();
      return { text: o.text, intersectsView: b.right > view.x && b.x < view.right && b.bottom > view.y && b.y < view.bottom };
    });
  });
  assert.ok(canvasLabels.some(label => label.intersectsView));
  record('touch-canvas-extraction-instruction', { status: 'scene-text-residue-confirmed', note: 'The old canvas text remains in the camera viewport; mobile DOM labels can visually cover it. This observation does not prove the E instruction is readable to the player.', labels: canvasLabels, domInstruction: await page.locator('#interaction').innerText() });
  await page.screenshot({ path: resolve(out, 'canvas-keyboard-932.png') });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requests, []);
  report.status = 'completed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
  await context.close(); await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
