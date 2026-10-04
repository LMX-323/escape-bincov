/** Offline title: viewport composition, keyboard/touch, motion, scene lifecycle and rendering cost. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results/title');
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [], externalRequests: [],
  methodology: 'Offline, fresh saves, real DOM input and unmodified screenshots. Phone sizes are Chromium viewport/touch emulation, not physical iOS/Android certification. Explicit ?test=1 is only used for motion/lifecycle/performance inspection. No gameplay or save fixtures.' };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
report.htmlBytes = (await stat('dist/index.html')).size;
const url = pathToFileURL(resolve('dist/index.html')).href;
const record = (name, data = {}) => { report.checks.push({ name, status: 'passed', ...data }); console.log(`PASS ${name}`); };
const viewports = [
  [1280, 720], [1920, 1080], [2560, 1080], [1024, 768], [768, 1024],
  [360, 800], [390, 844], [412, 915], [430, 932], [844, 390], [932, 430], [640, 360],
];
function observe(context) {
  context.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
  context.on('page', page => {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  });
}
try {
  for (const [width, height] of viewports) {
    const size = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, offline: true, hasTouch: width < 1000, reducedMotion: 'reduce' });
    observe(context);
    try {
      const page = await context.newPage();
      await page.goto(url);
      await page.locator('.title-enter').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => typeof window.__bincov), 'undefined', 'Ordinary entry exposes test API');
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('.title-screen');
        const elements = [...root.querySelectorAll('button, a, h1, .title-masthead, .title-footer')];
        const outside = elements.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && (r.left < 0 || r.right > innerWidth + 1);
        }).map(el => el.className);
        const primary = root.querySelector('.title-enter').getBoundingClientRect();
        const footer = root.querySelector('.title-footer').getBoundingClientRect();
        const smallTargets = [...root.querySelectorAll('button, a')].filter(el => {
          const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44;
        }).map(el => el.className);
        return { outside, smallTargets, noOverlap: primary.bottom < footer.top, fitsWidth: root.scrollWidth <= root.clientWidth, scrollable: root.scrollHeight > root.clientHeight };
      });
      assert.deepEqual(geometry.outside, [], `${size}: horizontal clipping`);
      assert.deepEqual(geometry.smallTargets, [], `${size}: target below 44 CSS px`);
      assert.equal(geometry.noOverlap, true, `${size}: footer overlaps primary action`);
      assert.equal(geometry.fitsWidth, true, `${size}: horizontal scrolling`);
      await page.screenshot({ path: resolve(out, `${size}.png`) });
      await page.locator('[data-action="help"]').click();
      const modal = page.getByRole('dialog', { name: '行动指南' });
      await modal.waitFor();
      const bounds = await modal.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, 'Help escapes viewport');
      assert.equal(await page.locator('.title-screen').getAttribute('inert'), '');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-action="close"]').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-action="help"]').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-action="title-motion"]').evaluate(el => el === document.activeElement), true, 'Native Tab navigation is blocked');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-action="title-motion"]').getAttribute('aria-pressed'), 'false', 'Reduced motion control misrepresents its effective state');
      const saved = await page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
      if (width < 600) await page.locator('.title-enter').tap();
      else { await page.locator('.title-enter').focus(); await page.keyboard.press('Enter'); }
      await page.locator('.hideout').waitFor();
      assert.equal(await page.evaluate(() => document.body.dataset.screen), 'hideout');
      assert.equal(await page.evaluate(() => localStorage.getItem('escape-bincov.session.v2')), saved, 'Title entry alters existing progress');
      await page.locator('[data-action="tab"][data-id="home"]').click();
      await page.locator('[data-action="menu"]').click();
      await page.locator('.title-enter').waitFor();
      assert.equal(await page.locator('#frame').evaluate(el => getComputedStyle(el).transform), 'none');
      record(`composition, help, input and round-trip ${size}`, geometry);
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
  observe(context);
  try {
    const page = await context.newPage();
    await page.goto(url + '?test=1');
    await page.locator('.title-enter').waitFor();
    const sceneState = () => page.evaluate(() => {
      const scene = window.__bincov.app.game.scene.getScene('Menu');
      return { children: scene.children.length, tweens: scene.tweens.getTweens().length, paused: scene.tweens.getTweens().every(t => t.isPaused()),
        textures: scene.textures.getTextureKeys().filter(k => k.startsWith('title-')).length,
        listeners: scene.events.listenerCount('title-motion'), properties: scene.children.list.map(o => [o.x, o.y, o.alpha]) };
    });
    await page.waitForTimeout(150);
    const initial = await sceneState();
    assert.equal(initial.children, 4); assert.equal(initial.textures, 4); assert.equal(initial.tweens, 3); assert.equal(initial.listeners, 1);
    assert.equal(initial.paused, false);
    await page.locator('[data-action="title-motion"]').click();
    const frozen = await sceneState();
    await page.waitForTimeout(250);
    assert.deepEqual((await sceneState()).properties, frozen.properties, 'Motion off still animates');
    assert.equal(frozen.paused, true);
    await page.locator('[data-action="title-motion"]').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    assert.equal((await sceneState()).paused, true, 'System reduced motion is ignored');
    assert.equal(await page.locator('[data-action="title-motion"]').getAttribute('aria-pressed'), 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(100);
    await page.locator('[data-action="title-motion"]').click();
    assert.equal((await sceneState()).paused, false);
    record('motion toggle and live reduced-motion preference');
    for (let i = 0; i < 5; i++) {
      await page.locator('.title-enter').click();
      await page.locator('[data-action="tab"][data-id="home"]').click();
      await page.locator('[data-action="menu"]').click();
      await page.locator('.title-enter').waitFor();
      await page.waitForTimeout(60);
    }
    const repeated = await sceneState();
    assert.equal(repeated.children, initial.children); assert.equal(repeated.textures, initial.textures);
    assert.equal(repeated.tweens, initial.tweens); assert.equal(repeated.listeners, 1);
    record('five scene round-trips without texture, tween or listener growth', repeated);
    report.frameSample = await page.evaluate(() => new Promise(resolveSample => {
      const times = []; let last = performance.now();
      function frame(now) {
        times.push(now - last); last = now;
        if (times.length < 120) requestAnimationFrame(frame);
        else { times.sort((a, b) => a - b); resolveSample({ frames: times.length, medianMs: times[60], p95Ms: times[114], actualFps: window.__bincov.app.game.loop.actualFps }); }
      }
      requestAnimationFrame(frame);
    }));
    record('120-frame desktop headless sample (measurement, not a device guarantee)', report.frameSample);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-action="help"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    const title = await page.locator('.title-screen').boundingBox();
    assert.equal(title.width, 390); assert.equal(title.height, 844);
    record('orientation changes, including an open help dialog');
  } finally { await context.close(); }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
