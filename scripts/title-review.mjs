/** Offline title: viewport composition, lettering, keyboard/touch, layered parallax, ambient motion, lifecycle and cost. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results/title');
const { frameWidth: markW, frameHeight: markH } = JSON.parse(await readFile('assets/title/manifest.json', 'utf8')).layers.wordmark;
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [], externalRequests: [],
  methodology: 'Offline file:// entry, fresh saves, real DOM input and unmodified screenshots. Phone sizes are Chromium viewport/touch emulation, not physical iOS/Android certification. Explicit ?test=1 is only used to read the title controller snapshot (motion, lifecycle, performance). No gameplay or save fixtures.' };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
report.htmlBytes = (await stat('dist/index.html')).size;
const url = pathToFileURL(resolve('dist/index.html')).href;
const record = (name, data = {}) => { report.checks.push({ name, status: 'passed', ...data }); console.log(`PASS ${name}`); };
const viewports = [
  [1280, 720], [1920, 1080], [2560, 1080], [1024, 768], [768, 1024],
  [360, 800], [390, 844], [412, 915], [430, 932], [844, 390], [932, 430], [640, 360], [740, 300],
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
      assert.equal(await page.evaluate(() => document.documentElement.dataset.titleArt), 'ready', `${size}: title artwork did not decode`);
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
      // One bitmap face at native or doubled size; the wordmark scales by whole pixels.
      const lettering = await page.evaluate(() => {
        const root = document.querySelector('.title-screen');
        const texts = [...root.querySelectorAll('*')].filter(el => el.offsetParent !== null && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
        const fonts = [...new Set(texts.map(el => getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g, '').trim()))];
        const sizes = [...new Set(texts.map(el => parseFloat(getComputedStyle(el).fontSize)))];
        const art = root.querySelector('.title-mark-art'), box = art.getBoundingClientRect();
        return { fonts, sizes, loaded: document.fonts.check('16px "Bincov Text"', '进入水产站行动指南'),
          mark: { heading: root.querySelector('h1').innerText, width: box.width, height: box.height, image: getComputedStyle(art).backgroundImage.slice(0, 26) } };
      });
      assert.deepEqual(lettering.fonts, ['Bincov Text'], `${size}: mixed menu fonts`);
      assert.ok(lettering.sizes.every(s => s === 16 || s === 32), `${size}: non-integer bitmap size ${lettering.sizes}`);
      assert.ok(lettering.loaded, 'Bincov Text not loaded');
      assert.match(lettering.mark.heading, /逃离\s*滨科夫/);
      assert.equal(lettering.mark.image, 'url("data:image/png;base64');
      assert.ok(lettering.mark.width > 0 && lettering.mark.width % markW === 0 && lettering.mark.height === lettering.mark.width / markW * markH, `${size}: wordmark scaled by a fraction`);
      await page.screenshot({ path: resolve(out, `${size}.png`) });
      await page.locator('[data-action="help"]').click();
      const modal = page.getByRole('dialog', { name: '行动指南' });
      await modal.waitFor();
      const bounds = await modal.boundingBox();
      if (width < 1000) {
        const targets = await modal.locator('button').evaluateAll(nodes => nodes.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
        assert.ok(targets.every(r => r.width >= 48 && r.height >= 48), 'Mobile dialog target below 48 CSS px');
      }
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
      record(`composition, lettering, help, input and round-trip ${size}`, { ...geometry, lettering });
    } finally { await context.close(); }
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, reducedMotion: 'no-preference' });
  observe(context);
  try {
    const page = await context.newPage();
    await page.goto(url + '?test=1');
    await page.locator('.title-enter').waitFor();
    const snap = () => page.evaluate(() => window.__bincov.app.game.scene.getScene('Menu').title.snapshot());
    const sceneCounts = () => page.evaluate(() => {
      const scene = window.__bincov.app.game.scene.getScene('Menu');
      return { children: scene.children.length, textures: scene.textures.getTextureKeys().filter(k => k.startsWith('title-')).length,
        motion: scene.events.listenerCount('title-motion'), overlay: scene.events.listenerCount('title-overlay'),
        destroy: scene.events.listenerCount('destroy'), shutdown: scene.events.listenerCount('shutdown') };
    });
    const cdp = await context.newCDPSession(page);
    const domListeners = async () => {
      const count = async expression => {
        const { result } = await cdp.send('Runtime.evaluate', { expression });
        const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
        return listeners.reduce((m, l) => ({ ...m, [l.type]: (m[l.type] || 0) + 1 }), {});
      };
      const w = await count('window'), d = await count('document'), root = await count('document.documentElement');
      return { pointermove: w.pointermove || 0, blur: w.blur || 0, focus: w.focus || 0, visibilitychange: d.visibilitychange || 0, mouseleave: root.mouseleave || 0 };
    };
    await page.waitForTimeout(300);
    const initial = await snap(), counts = await sceneCounts(), listeners = await domListeners();
    assert.equal(initial.art, true); assert.equal(initial.allowed, true); assert.equal(initial.live, 1);
    assert.equal(counts.motion, 1); assert.equal(counts.overlay, 1);
    record('layered scene mounted with one controller', { counts, listeners });

    // Parallax: near layers travel further than far ones; menu text and hit targets stay put.
    const menuRect = () => page.locator('.title-enter').evaluate(el => JSON.stringify(el.getBoundingClientRect()));
    const before = await menuRect();
    await page.mouse.move(1279, 719, { steps: 8 }); await page.waitForTimeout(1600);
    const corner = await snap();
    await page.mouse.move(0, 0, { steps: 8 }); await page.waitForTimeout(1600);
    const opposite = await snap();
    const maxima = { far: [1, 1], harbor: [3, 2], room: [5, 3], lamp: [6, 3], desk: [8, 4], chair: [16, 7], fore: [24, 10] };
    for (const [name, [x, y]] of Object.entries(maxima)) {
      assert.deepEqual(corner.groups[name], [-x, -y], `${name} at bottom-right corner`);
      assert.deepEqual(opposite.groups[name], [x, y], `${name} at top-left corner`);
    }
    assert.equal(await menuRect(), before, 'Menu moved with the scene');
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: null })));
    await page.waitForTimeout(4500);
    const settled = await snap();
    assert.ok(Math.abs(settled.camera[0]) < .15 && Math.abs(settled.camera[1]) < .15, 'Camera does not settle after the pointer leaves');
    record('pointer parallax by depth, fixed menu, settles after leaving', { corner: corner.groups, settled: settled.camera });

    // Ambient motion: light, objects, water and air all change, independent of the rain.
    const categories = async seconds => {
      const samples = [];
      for (let i = 0; i < seconds * 4; i++) { samples.push(await snap()); await page.waitForTimeout(250); }
      const changed = key => new Set(samples.map(s => JSON.stringify(key(s)))).size > 1;
      return { light: changed(s => [s.lamp, s.lightX, s.lightAlpha]), object: changed(s => [s.boatY, s.rope, s.needle, s.led]),
        water: changed(s => s.glints), air: changed(s => [s.fog, s.motes]), rain: changed(s => s.rain) };
    };
    const ambient = await categories(5);
    assert.deepEqual(ambient, { light: true, object: true, water: true, air: true, rain: true }, 'Ambient motion category missing');
    await page.evaluate(() => window.__bincov.app.game.scene.getScene('Menu').title.setRain(false));
    const dry = await categories(5);
    assert.deepEqual(dry, { light: true, object: true, water: true, air: true, rain: false }, 'Scene relies on rain for motion');
    await page.evaluate(() => window.__bincov.app.game.scene.getScene('Menu').title.setRain(true));
    record('at least four ambient motion kinds, with and without rain', { ambient, dry });

    // Rain is a continuous pool: drops only ever fall; a new life starts hidden above the openings.
    const rain = await page.evaluate(() => new Promise(done => {
      const title = window.__bincov.app.game.scene.getScene('Menu').title, frames = [];
      let fogLast = -1, fogBack = 0;
      const tick = () => {
        const s = title.snapshot(); frames.push(s.rain);
        if (s.fog[1] < fogLast) fogBack++; fogLast = s.fog[1];
        if (frames.length < 240) requestAnimationFrame(tick);
        else {
          let violations = 0, respawns = 0;
          for (let f = 1; f < frames.length; f++) frames[f].forEach(([x, y], i) => {
            const [px, py] = frames[f - 1][i] || [x, y];
            if (y >= py && px - x >= 0 && px - x <= 12) return;
            if (y <= 24) { respawns++; return; }
            violations++;
          });
          done({ frames: frames.length, drops: frames[0].length, respawns, violations, fogBack });
        }
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(rain.violations, 0, 'A raindrop jumped inside the visible openings');
    assert.equal(rain.fogBack, 0, 'Fog jumped back');
    assert.ok(rain.respawns > 0, 'Rain never recycled');
    record('rain recycles off-screen only; fog never jumps back', rain);

    // A dialog over the scene freezes pointer parallax.
    await page.mouse.move(640, 360); await page.waitForTimeout(1200);
    await page.locator('[data-action="help"]').click();
    await page.getByRole('dialog', { name: '行动指南' }).waitFor();
    const frozenCamera = (await snap()).camera;
    await page.mouse.move(1270, 700, { steps: 6 }); await page.waitForTimeout(700);
    const underDialog = await snap();
    assert.equal(underDialog.overlay, true);
    assert.deepEqual(underDialog.camera, frozenCamera, 'Pointer parallax moved under the guide');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal((await snap()).overlay, false);
    record('guide freezes pointer parallax and releases it on close');

    // The toggle stops everything at once and the composition is stable.
    const stoppedPose = await page.evaluate(() => {
      const title = window.__bincov.app.game.scene.getScene('Menu').title;
      const before = title.snapshot(); document.querySelector('[data-action="title-motion"]').click();
      const after = title.snapshot();
      return { before: [before.groups,before.boatY,before.lamp,before.waterFrame], after: [after.groups,after.boatY,after.lamp,after.waterFrame] };
    });
    assert.deepEqual(stoppedPose.after, stoppedPose.before, 'Disabling motion jumps the composition');
    const off = await snap(); await page.waitForTimeout(400); const offLater = await snap();
    assert.equal(off.allowed, false);
    assert.deepEqual({ ...offLater, clock: 0 }, { ...off, clock: 0 }, 'Motion off still animates');
    assert.equal(off.rain.length, 0); assert.equal(off.motes, '');
    assert.equal(await page.locator('[data-action="title-motion"]').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-action="title-motion"]').click();
    assert.equal((await snap()).allowed, true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    assert.equal((await snap()).allowed, false, 'System reduced motion is ignored');
    assert.equal(await page.locator('[data-action="title-motion"]').getAttribute('aria-pressed'), 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(150);
    assert.equal((await snap()).allowed, false, 'Motion restarted without the player');
    await page.locator('[data-action="title-motion"]').click();
    assert.equal((await snap()).allowed, true);
    record('motion toggle and live reduced-motion preference stop every system');

    // Page visibility: hidden time is not replayed on return.
    const setHidden = hidden => page.evaluate(h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
    await setHidden(true);
    const hiddenAt = await snap(); await page.waitForTimeout(1200); const stillHidden = await snap();
    assert.equal(hiddenAt.allowed, false); assert.equal(stillHidden.clock, hiddenAt.clock, 'Scene advanced while hidden');
    await setHidden(false);
    await page.waitForTimeout(120);
    const resumed = await snap();
    assert.equal(resumed.allowed, true);
    assert.ok(resumed.clock - hiddenAt.clock < 400, `Resumed with a time jump of ${resumed.clock - hiddenAt.clock} ms`);
    await page.evaluate(() => { delete document.hidden; });
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const blurred = await snap(); await page.waitForTimeout(500);
    assert.equal(blurred.allowed, false, 'Unfocused window keeps animating');
    assert.equal((await snap()).clock, blurred.clock);
    await page.evaluate(() => dispatchEvent(new Event('focus')));
    await page.waitForTimeout(120);
    assert.equal((await snap()).allowed, true);
    record('hidden or unfocused page pauses the scene and resumes without catch-up', { advancedAfterResumeMs: resumed.clock - hiddenAt.clock });

    // Twenty menu/station round-trips after one warm-up (the station backdrop is cached on first
    // visit): no controller, object, texture or listener growth.
    const roundTrip = async () => {
      await page.locator('.title-enter').click();
      await page.locator('[data-action="tab"][data-id="home"]').click();
      await page.locator('[data-action="menu"]').click();
      await page.locator('.title-enter').waitFor();
    };
    await roundTrip(); await page.waitForTimeout(200);
    const warmCounts = await sceneCounts(), warmListeners = await domListeners();
    assert.deepEqual({ ...warmCounts, textures: 0 }, { ...counts, textures: 0 }, 'Warm-up changed scene objects or listeners');
    assert.deepEqual(warmListeners, listeners, 'Warm-up added window/document listeners');
    for (let i = 0; i < 20; i++) await roundTrip();
    await page.waitForTimeout(200);
    const repeated = await snap(), repeatedCounts = await sceneCounts(), repeatedListeners = await domListeners();
    assert.equal(repeated.live, 1, 'Extra title controllers survived');
    assert.deepEqual(repeatedCounts, warmCounts, 'Scene objects, textures or scene listeners grew');
    assert.deepEqual(repeatedListeners, listeners, 'Window/document listeners grew');
    assert.equal(repeated.allowed, true);
    record('twenty scene round-trips without controller, object, texture or listener growth', { warm: warmCounts, after: repeatedCounts, listeners: repeatedListeners });

    report.frameSample = await page.evaluate(() => new Promise(resolveSample => {
      const times = []; let last = performance.now();
      function frame(now) {
        times.push(now - last); last = now;
        if (times.length < 600) requestAnimationFrame(frame);
        else {
          times.sort((a, b) => a - b);
          const q = p => +times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2);
          resolveSample({ frames: times.length, p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99), maxMs: q(1), over33ms: times.filter(t => t > 33.4).length, actualFps: window.__bincov.app.game.loop.actualFps });
        }
      }
      requestAnimationFrame(frame);
    }));
    record('600-frame desktop headless sample with motion on (measurement, not a device guarantee)', report.frameSample);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-action="help"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    const title = await page.locator('.title-screen').boundingBox();
    assert.equal(title.width, 390); assert.equal(title.height, 844);
    record('orientation changes, including an open help dialog');
  } finally { await context.close(); }

  // Touch never steers the camera and never blocks the menu.
  const touch = await browser.newContext({ viewport: { width: 844, height: 390 }, offline: true, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  observe(touch);
  try {
    const page = await touch.newPage();
    await page.goto(url + '?test=1');
    await page.locator('.title-enter').waitFor();
    const snap = () => page.evaluate(() => window.__bincov.app.game.scene.getScene('Menu').title.snapshot());
    for (const [x, y] of [[830, 380], [10, 10], [830, 10]]) { await page.touchscreen.tap(x, y); await page.waitForTimeout(300); }
    const after = await snap();
    assert.ok(Math.abs(after.camera[0]) < .2 && Math.abs(after.camera[1]) < .2, 'Touch moved the camera');
    assert.equal(after.allowed, true);
    record('touch taps do not drive parallax', { camera: after.camera });
  } finally { await touch.close(); }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
