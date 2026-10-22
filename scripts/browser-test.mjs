/** Offline acceptance. Fixtures accelerate travel/time; input and settlement stay real. */
import { placeAt } from './inventory-actions.mjs';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { executablePath, browserOptions } from './browser-options.mjs';
import { raidReady, frames, drive, panel, waitPanel, screenOf } from './raid-view.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-results');
const smoke = process.argv.includes('--smoke');
const entry = join(root, 'dist', 'index.html');
const url = pathToFileURL(entry).href + '?test=1&entry=tabs';
const SAVE_KEY = 'escape-bincov.session.v2';
const report = {
  startedAt: new Date().toISOString(), mode: smoke ? 'smoke' : 'full', entry: url,
  browser: executablePath, offline: true, viewports: [], screenshots: [],
  methodology: [
    'Each viewport uses a fresh isolated browser context and the single file:// HTML; no development server.',
    'HTTP(S) access is blocked and attempted requests fail acceptance.',
    'Raids deploy to the default area (沿海街区, three maps) and run on the 2.5D view. Travel, enemy positions, health and elapsed time use the explicit ?test=1 driver. Movement, aiming, firing, looting, dragging and extraction use browser input.',
    'Success, combat death and timeout are three consecutive runs per context, followed by reload and a fourth interrupted run.',
    'FPS is sampled from requestAnimationFrame and the raid renderer\'s ticker in headless Chrome; this is not a claim about every physical GPU.',
    'The test does not establish 30–60 minutes of subjective replay value or natural ten-minute difficulty balance.',
  ],
};
await access(entry);
await access(executablePath);
await mkdir(out, { recursive: true });

const browser = await chromium.launch(browserOptions);
report.browserVersion = browser.version();
let activePage;

function rounded(value) { return Math.round(value * 100) / 100; }
async function saveReport() { await writeFile(join(out, smoke ? 'browser-smoke.json' : 'browser-report.json'), JSON.stringify(report, null, 2)); }
/**
 * The seed's original records for the default area, from the game's own generator (tsx in a child process): the
 * deployed three-map world must hold exactly these item amounts. Crates merge repeated stacks, so stacks are not records.
 */
function seedLoot(seed) {
  const code = `import('./src/building-world.ts').then(m => { const c = m.buildingRunConfig(${Number(seed)}), all = [...c.loot, ...c.containers.flatMap(x => x.items)], amounts = {};
    for (const i of all) amounts[i.id] = (amounts[i.id] ?? 0) + i.qty;
    console.log(JSON.stringify({ records: all.length, crates: c.containers.length, amounts })); })`;
  return JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8' }));
}
const sorted = amounts => Object.fromEntries(Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b)));

async function suite(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, offline: true });
  const record = { viewport, steps: [], errors: [], externalRequests: [], screenshots: [], fps: null };
  report.viewports.push(record);
  context.on('request', request => { if (/^https?:/i.test(request.url())) record.externalRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => { window.__longTasks = []; new PerformanceObserver(list => { window.__longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))); }).observe({ entryTypes: ['longtask'] }); });
  page.on('pageerror', error => record.errors.push({ type: 'pageerror', message: error.stack || error.message }));
  page.on('console', message => { if (message.type() === 'error') record.errors.push({ type: 'console', message: message.text() }); });
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
  const waitState = (state, timeout = 30000) => page.waitForFunction(expected => window.__bincov?.app.state === expected, state, { timeout });
  const screenshot = async name => {
    const path = join(out, `${label}-${name}.png`);
    await page.screenshot({ path });
    record.screenshots.push(path); report.screenshots.push(path);
  };
  const state = () => page.evaluate(() => {
    const { app } = window.__bincov;
    return { state: app.state, cash: app.save.cash, stats: app.save.stats, safe: app.save.safe, bag: app.save.bag, stash: app.save.stash, equipment: app.save.equipment, quests: app.save.quests, activeRun: app.save.activeRun, result: app.save.lastResult, volume: app.save.settings.volume };
  });
  // Live raid state: the published frame for the player and HUD, the live expansion capture for every map's population.
  const run = () => page.evaluate(() => {
    const b = window.__bincovSample.host.lastBatch, f = b.frame, raid = window.__bincov.saveSession.captureExpansion().raid, maps = Object.values(raid.maps);
    const enemies = maps.flatMap(m => m.enemies), crates = maps.flatMap(m => m.containers).filter(c => c.kind === 'crate');
    const amounts = {};
    for (const i of [...maps.flatMap(m => m.loot), ...crates.flatMap(c => c.inventory.items)]) amounts[i.id] = (amounts[i.id] ?? 0) + i.qty;
    return { x: f.player.x, y: f.player.y, rotation: f.player.aim, elapsed: b.stamp.simulationTime, hp: f.hud.hp, mag: f.hud.weapon.mag, high: f.hud.highTide,
      enemies: raid.roster.length, alive: enemies.filter(e => e.hp > 0).length, loot: maps.reduce((n, m) => n + m.loot.length, 0), crates: crates.length,
      amounts, seed: raid.seed, map: b.stamp.world.mapId };
  });
  async function step(name, task) {
    const start = performance.now();
    const item = { name, status: 'running' };
    record.steps.push(item);
    try {
      const result = await task();
      assert.deepEqual(record.errors, [], 'Browser console/page errors');
      assert.deepEqual(record.externalRequests, [], 'The standalone build attempted external network access');
      item.status = 'passed';
      if (result !== undefined) item.detail = result;
      console.log(`PASS ${label} · ${name}`);
    } catch (error) {
      item.status = 'failed'; item.error = error.stack || String(error);
      record.failureState = await page.evaluate(() => ({ state: __bincov.app.state, panel: window.__bincovSample?.host?.panel ?? null, error: __bincov.app.storageError,
        elapsed: window.__bincovSample?.host?.lastBatch?.stamp.simulationTime ?? null, phase: window.__bincovSample?.host?.lastBatch?.frame.phase ?? null, now: performance.now(), longTasks: window.__longTasks.slice(-15) })).catch(() => null);
      console.log(JSON.stringify(record.failureState));
      throw error;
    } finally { item.durationMs = rounded(performance.now() - start); await saveReport(); }
  }
  /**
   * On a slow runner (CI's software GL) the first frames after a mount can be more than 2 s apart, and the Runtime then
   * stall-pauses the raid ("画面暂时停顿…"), as it would for a player. Resume it through the pause panel, as a player
   * would, and wait until it has stayed running for a few frames.
   */
  async function running() {
    for (let i = 0; i < 5; i++) {
      const now = await page.evaluate(() => ({ panel: window.__bincovSample.host.panel, phase: window.__bincovSample.host.lastBatch.frame.phase }));
      if (now.phase === 'running' && now.panel === null) {
        await frames(page, 3);
        if (await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.phase === 'running')) return;
        continue;
      }
      assert.equal(now.panel, 'pause', `the raid waits on ${now.panel}`);
      // Only the Runtime's own stall pause is resumed here; any other pause is a failure of the step.
      assert.ok(await page.evaluate(() => { const h = window.__bincovSample.host, seen = h.__stallSeen ?? 0, stalls = h.eventLog.filter(e => e.type === 'notice' && /^画面暂时停顿/.test(e.detail?.text ?? '') && e.seq > seen); if (!stalls.length) return false; h.__stallSeen = Math.max(...stalls.map(e => e.seq)); return true; }), 'the raid paused without the Runtime\'s stall notice');
      record.stallResumes = (record.stallResumes ?? 0) + 1; console.log(`STALL ${label}: resumed a stall pause`);
      await page.locator('.coast-sample [data-do="resume"]').click();
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'running', null, { timeout: 30000 });
    }
    throw new Error('the raid did not stay running');
  }
  /**
   * Fixture: a rested body before a deployment. After a death the 2.5D body keeps 1 health (the base heals it over real
   * minutes); on a slow runner the AI acts for a second or two before the test can freeze it, so one blow would end the
   * run. One validated session transaction, as the base's own recovery would write it.
   */
  async function rest() {
    const ok = await page.evaluate(() => {
      const s = window.__bincov.saveSession;
      if (!window.__bincov.app.expansion) return true;
      const ticket = s.prepareExpansionMutation(d => { Object.assign(d.expansion.body, { hp: 100, stamina: 100, pollution: 0, bleeding: false }); });
      return !!ticket && s.commitExpansionMutation(ticket) === 'committed';
    });
    assert.ok(ok, 'rested body fixture committed');
  }
  /**
   * Hold a movement key until the published player position passes `bound` on `axis` (direction 1: above, -1: below).
   * Movement keys are read once per frame, so a fixed-length hold can miss every frame on a slow runner. On a timeout
   * the caller's own assertion reports the failure.
   */
  async function holdUntil(key, axis, bound, direction) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(([axis, bound, direction]) => { const v = window.__bincovSample.host.lastBatch.frame.player[axis]; return direction > 0 ? v > bound : v < bound; },
        [axis, bound, direction], { timeout: 20000 }).catch(() => {});
    } finally { await page.keyboard.up(key); }
  }
  async function deploy(seed) {
    await rest();
    await page.locator('#seed').fill(String(seed));
    await action('deploy').click();
    await waitState('run');
    await raidReady(page);
    await drive(page, 'freezeAI', true);
    await running();
    const current = await run();
    assert.equal(current.seed, seed);
    // One raid view owns the page: the Pixi raid canvas fills the window and no title or station canvas remains.
    const canvas = await page.locator('.coast-sample canvas').boundingBox();
    assert.equal(Math.round(canvas.width), viewport.width); assert.equal(Math.round(canvas.height), viewport.height);
    const owners = await page.evaluate(() => ({ views: window.__bincovSample.counts().liveViews, roots: window.__bincovSample.counts().sampleRoots, pageCanvases: document.querySelectorAll('#game canvas').length }));
    assert.deepEqual(owners, { views: 1, roots: 1, pageCanvases: 0 }, 'Only the raid view may continue running');
  }
  /**
   * The client point of a world point once the camera has settled: it follows the player over about a second, which on a
   * slow runner is only a few frames, and a pointer placed earlier would aim where the target was on screen.
   */
  async function settledScreen(point) {
    let last = await screenOf(page, point);
    for (let i = 0; i < 40; i++) {
      await frames(page, 2);
      const now = await screenOf(page, point);
      if (Math.hypot(now.x - last.x, now.y - last.y) < .5) return now;
      last = now;
    }
    return last;
  }
  async function aimAt(point) {
    const screen = await settledScreen(point);
    assert.ok(screen.x >= 0 && screen.x < viewport.width && screen.y >= 0 && screen.y < viewport.height, 'Fixture target must be visible');
    await page.mouse.move(screen.x, screen.y);
    await frames(page, 4);
    return screen;
  }
  /** Stand, with the camera settled on the new position (it follows over about a second). */
  async function standAt(point) {
    await drive(page, 'placePlayer', point, 0, 'coast');
    await page.waitForFunction(p => { const f = window.__bincovSample.host.lastBatch.frame.player; return Math.hypot(f.x - p.x, f.y - p.y) < 1; }, point);
    await page.waitForTimeout(1200);
    await running();
  }
  /** Pick up the run's street sample with E from a spot where no container is in reach (E would open it instead). */
  async function collectSample() {
    const spot = await page.evaluate(() => {
      const f = window.__bincovSample.host.lastBatch.frame, sample = f.loot.find(l => l.item === 'sample');
      if (!sample) throw new Error('Guaranteed sample missing');
      for (const r of [0, 12, 20, 28]) for (let a = 0; a < 8; a++) {
        const p = { x: sample.x + Math.round(Math.cos(a * Math.PI / 4) * r), y: sample.y + Math.round(Math.sin(a * Math.PI / 4) * r) };
        if (f.containers.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 48)) continue;
        try { window.__bincovSample.driver.placePlayer(p, 0, 'coast'); return p; } catch { /* body does not fit here */ }
        if (r === 0) break;
      }
      throw new Error('No clear spot beside the sample');
    });
    await drive(page, 'vitals', { hp: 100, bleeding: false });
    await standAt(spot);
    await page.keyboard.press('e', { delay: 110 });
    await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(item => item.id === 'sample'));
  }
  const resultShown = (timeout = 30000) => page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout });

  try {
    await step('offline viewport title and fixed logical canvas', async () => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__bincov?.title && document.body.dataset.screen === 'menu');
      await action('enter').waitFor();
      assert.match(await page.locator('h1').innerText(), /逃离[\s\S]*滨科夫/);
      const bounds = await page.evaluate(() => {
        const canvas = document.querySelector('#game canvas'), rect = canvas.getBoundingClientRect(), r = window.__bincov.title.renderInfo();
        return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, renderWidth: canvas.width, renderHeight: canvas.height,
          logicalWidth: r.surface[0] / r.scale, logicalHeight: r.surface[1] / r.scale, renderer: r.renderer };
      });
      assert.equal(bounds.logicalWidth, 960); assert.equal(bounds.logicalHeight, 540);
      assert.equal(bounds.renderWidth, viewport.width); assert.equal(bounds.renderHeight, viewport.height);
      assert.equal(bounds.width, viewport.width); assert.equal(bounds.height, viewport.height);
      assert.equal(bounds.x, 0); assert.equal(bounds.y, 0);
      await screenshot('menu');
      return bounds;
    });
    await step('hideout, merchant price and pointer inventory drag', async () => {
      await action('enter').click(); await waitState('hideout');
      assert.deepEqual(await page.locator('#game canvas').evaluate(c => [c.width, c.height]), [960, 540], 'Menu render density must not leak into the station page');
      // Hideout panels use the viewport over the station painting.
      const bounds = await page.locator('#game canvas').boundingBox();
      assert.equal(bounds.width, Math.min(viewport.width, 1808)); assert.equal(bounds.height, viewport.height);
      assert.equal(bounds.x, (viewport.width - bounds.width) / 2);
      assert.equal(bounds.y, (viewport.height - bounds.height) / 2);
      const initial = await state();
      assert.equal(initial.bag.w, 6); assert.equal(initial.bag.h, 5);
      assert.equal(initial.safe.w, 2); assert.equal(initial.safe.h, 2);
      await action('tab', 'arms').click();
      await placeAt(page, 'merchant', 'ammo9', 'buy');
      assert.match(await page.locator('.shop-checkout').innerText(), /需付 ¥ 84/);
      assert.equal((await state()).cash, initial.cash);
      await action('checkout').click();
      const purchased = await state();
      assert.equal(purchased.cash, initial.cash - 84);
      const count = inv => inv.items.filter(item => item.id === 'ammo9').reduce((sum, item) => sum + item.qty, 0);
      assert.equal(count(purchased.stash), count(initial.stash) + 12);
      await action('tab', 'gear').click();
      const bandage = purchased.bag.items.find(item => item.id === 'bandage');
      assert.ok(bandage, 'Starter bandage is available for drag test');
      const grid = page.locator('[data-grid="bag"]');
      const geometry = await grid.evaluate(element => ({ width: element.getBoundingClientRect().width, cell: Number(element.dataset.cell), baseWidth: element.offsetWidth }));
      const scale = geometry.width / geometry.baseWidth;
      await page.locator(`[data-uid="${bandage.uid}"]`).dragTo(grid, { targetPosition: { x: 5.4 * geometry.cell * scale, y: 4.4 * geometry.cell * scale } });
      const moved = (await state()).bag.items.find(item => item.uid === bandage.uid);
      assert.equal(moved.x, 5); assert.equal(moved.y, 4);
      await page.locator(`[data-uid="${bandage.uid}"]`).click();
      await action('secure').click();
      assert.equal((await state()).safe.items.filter(item => item.id === 'bandage').reduce((sum,item)=>sum+item.qty,0),bandage.qty);
      assert.equal((await state()).bag.items.filter(item=>item.id==='bandage').length,0);
      await screenshot('hideout');
      return { purchasedRounds: 12, charged: 84, nativeDragCell: [5, 4], safeBandages: bandage.qty };
    });
    await step('seeded deployment: 25 enemies and 60 original loot entries across ground and crates', async () => {
      await deploy(42);
      const current = await run(), expected = seedLoot(42);
      assert.equal(current.enemies, 25); assert.equal(current.alive, 25); assert.equal(expected.records, 60);
      assert.deepEqual(sorted(current.amounts), sorted(expected.amounts), 'every original record is on the ground or in a crate, across the three maps');
      assert.equal(current.crates, expected.crates); assert.ok(current.crates > 0 && current.crates <= 10);
      const committed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, SAVE_KEY);
      assert.ok(committed.activeRun); assert.equal(committed.bag.items.length, 0);
      await screenshot('raid');
      return current;
    });
    if (smoke) return;

    await step('real WASD movement and pointer mapping', async () => {
      await standAt({ x: 208, y: 784 });
      const before = await run();
      await holdUntil('d', 'x', before.x + 15, 1); const right = await run();
      assert.ok(right.x > before.x + 15, 'D moves the actor right');
      await holdUntil('w', 'y', right.y - 15, -1); const up = await run();
      assert.ok(up.y < right.y - 15, 'W moves the actor up');
      await page.waitForTimeout(1200);
      const target = { x: up.x + 140, y: up.y + 20 };
      await aimAt(target);
      const aimed = await run(), expected = Math.atan2(target.y - aimed.y, target.x - aimed.x);
      const error = Math.abs(Math.atan2(Math.sin(aimed.rotation - expected), Math.cos(aimed.rotation - expected)));
      assert.ok(error < 0.12, `Pointer direction mismatch at ${label}: ${error}`);
      return { movementX: rounded(right.x - before.x), movementY: rounded(up.y - right.y), aimErrorRadians: rounded(error) };
    });
    await step('25-enemy, 60-original-loot battle performance sample', async () => {
      await drive(page, 'vitals', { hp: 100, bleeding: false });
      await standAt({ x: 700, y: 784 });
      // One rifle enemy engages at 200 px; everyone else waits far down the quay road, so the five seconds stay a duel.
      const salt = await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, actors = host.lastBatch.frame.actors.filter(a => a.alive), rifle = actors.find(a => a.kind === 'salt');
        if (!rifle) return null;
        for (const other of actors) if (other.uid !== rifle.uid) driver.placeEnemy(other.uid, { x: 208, y: 1456 });
        driver.placeEnemy(rifle.uid, { x: 900, y: 784 });
        return rifle.uid;
      });
      assert.ok(salt, 'a rifle enemy on the street');
      // The world check first: seedLoot runs a tsx child process, which takes seconds on a slow runner, and the duel
      // (AI unfrozen) must last only the sampled five seconds.
      const before = await run(), stocked = seedLoot(42).amounts;
      assert.equal(before.alive, 25); assert.deepEqual(sorted(before.amounts), sorted(stocked), 'the world is still fully stocked');
      await drive(page, 'freezeAI', false);
      record.fps = await page.evaluate(() => new Promise(resolveSample => {
        const start = performance.now(), values = [], intervals = [];
        let previous = start, frames = 0, stayedInRun = true, sampledAt = start;
        let done = false;
        function finish(now) {
          if (done) return; done = true;
          values.sort((a, b) => a - b); intervals.sort((a, b) => a - b);
          const average = values.reduce((a, b) => a + b, 0) / values.length;
          resolveSample({ measuredMs: now - start, frames, samples: values.length, average, minimum: values[0], median: values[Math.floor(values.length / 2)], frameIntervalP95Ms: intervals[Math.floor(intervals.length * .95)], stayedInRun, target60ApproxMet: average >= 55 });
        }
        function sample(now) {
          if (done) return;
          const { app } = window.__bincov;
          stayedInRun &&= app.state === 'run';
          if (frames++) intervals.push(now - previous);
          previous = now;
          const fps = window.__bincovSample.host.app.ticker.FPS;
          if ((frames % 10 === 0 || now - sampledAt >= 500) && Number.isFinite(fps) && fps > 0) { values.push(fps); sampledAt = now; }
          if (now - start < 5000) { requestAnimationFrame(sample); return; }
          finish(now);
        }
        requestAnimationFrame(sample);
        // If frames stop altogether the sample ends anyway, and the check below reports it instead of hanging the suite.
        setTimeout(() => finish(performance.now()), 20000);
      }));
      await drive(page, 'freezeAI', true);
      assert.ok(record.fps.samples >= 2 && record.fps.average > 0, 'FPS sampler produced measurements');
      assert.equal(record.fps.stayedInRun, true);
      await drive(page, 'vitals', { hp: 100, bleeding: false });
      return record.fps;
    });
    await step('actual aimed pistol shot consumes ammunition and hits an enemy', async () => {
      await standAt({ x: 700, y: 784 });
      const fixture = await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, actors = host.lastBatch.frame.actors.filter(a => a.alive);
        const enemy = actors.find(a => a.kind === 'scav');
        // Everyone else waits far down the quay road, out of the line of fire.
        for (const other of actors) if (other.uid !== enemy.uid) driver.placeEnemy(other.uid, { x: 208, y: 1456 });
        driver.placeEnemy(enemy.uid, { x: 820, y: 784 }, 56);
        return { uid: enemy.uid, hp: 56, mag: host.lastBatch.frame.hud.weapon.mag };
      });
      await page.keyboard.press('1');
      await frames(page, 3);
      const target = await page.evaluate(uid => { const e = window.__bincovSample.host.lastBatch.frame.actors.find(a => a.uid === uid); return { x: e.x, y: e.y }; }, fixture.uid);
      await aimAt(target);
      const mag = (await run()).mag;
      await page.mouse.down({ button: 'right' });
      try {
        await page.mouse.down({ button: 'left' }); await page.waitForTimeout(90); await page.mouse.up({ button: 'left' });
        await page.waitForFunction(({ uid, hp }) => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.uid === uid).hp < hp, fixture)
          .catch(async error => {
            // Intermittent on CI since 2026-10-22 (#61): the round leaves (7/8) yet misses a frozen enemy. Record where the
            // shot started and went, what it struck, and where the player and the enemy stood.
            const seen = await page.evaluate(uid => {
              const h = window.__bincovSample.host, f = h.lastBatch.frame, e = f.actors.find(a => a.uid === uid);
              return { player: f.player, enemy: e && { x: e.x, y: e.y, hp: e.hp }, mag: f.hud.weapon.mag,
                events: h.eventLog.filter(v => v.type === 'shot' || v.type === 'impact').slice(-4) };
            }, fixture.uid).catch(() => null);
            throw new Error(`${error.message}\n${JSON.stringify(seen)}`);
          });
      } finally { await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' }); }
      const result = await run();
      assert.equal(result.mag, mag - 1);
      return { beforeAmmo: mag, afterAmmo: result.mag, damagedEnemy: fixture.uid };
    });
    await step('real E pickup, pause, map and persisted volume controls', async () => {
      await collectSample();
      await page.keyboard.press('Escape');
      await waitPanel(page, 'pause');
      const paused = await run();
      await page.waitForTimeout(500);
      assert.equal((await run()).elapsed, paused.elapsed, 'Pause must stop the action clock');
      const volume = page.locator('.coast-sample [data-volume]');
      await volume.focus(); await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      assert.equal(Number(await volume.inputValue()), 0.2);
      assert.equal((await state()).volume, 0.2);
      await page.locator('.coast-sample [data-do="resume"]').click(); await waitPanel(page, null);
      await page.keyboard.press('m');
      await page.locator('.coast-sample [data-panel].map [data-map]').waitFor();
      const mapTime = (await run()).elapsed;
      // The world keeps running behind the map: the published clock moves on (frames may be far apart on a slow runner).
      await page.waitForFunction(t => window.__bincovSample.host.lastBatch.stamp.simulationTime > t, mapTime, { timeout: 15000 }).catch(() => {});
      assert.ok((await run()).elapsed > mapTime, 'Map is not a pause');
      await screenshot('map');
      await page.keyboard.press('m'); await waitPanel(page, null);
      return { volume: 0.2, sampleLootedByKeyboard: true };
    });
    await step('tide warning, high-tide transition and real movement out of flood', async () => {
      assert.equal((await run()).high, false, 'seed 42 starts at low tide');
      await drive(page, 'vitals', { hp: 100, bleeding: false });
      await drive(page, 'clock', 269.9);
      await standAt({ x: 63 * 32 + 16, y: 10 * 32 + 16 });
      await page.waitForFunction(() => document.querySelector('.coast-sample [data-tide]')?.textContent.includes('潮汐预警'));
      await drive(page, 'clock', 299.9);
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.hud.highTide === true);
      const afterFlip = await run();
      await holdUntil('a', 'x', 63 * 32 - 10, -1);
      const escaped = await run();
      assert.ok(escaped.x < 63 * 32 - 10, 'Player can leave the high-tide strip');
      // Regression: actor center is dry but the collision radius still overlaps water.
      await drive(page, 'placePlayer', { x: 63 * 32 - 1, y: 10 * 32 + 16 }, 0, 'coast'); await frames(page, 2); await running();
      await holdUntil('a', 'x', 63 * 32 - 20, -1);
      assert.ok((await run()).x < 63 * 32 - 20, 'Half-overlapping flood boundary must not trap the actor');
      await screenshot('high-tide');
      return { warningAt: 270, tideAt: 300, xAfterFlip: rounded(afterFlip.x), xAfterMovement: rounded(escaped.x) };
    });

    const beforeResults = await state();
    await step('first run: actual three-second extraction retains loot and gear', async () => {
      await drive(page, 'vitals', { hp: 100, bleeding: false, pollution: 0 });
      const exit = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits[0].at);
      await standAt(exit);
      const start = performance.now();
      await page.keyboard.down('e');
      try { await resultShown(); }
      finally { await page.keyboard.up('e'); }
      const elapsed = performance.now() - start, saved = await state();
      assert.ok(elapsed >= 2500, 'Extraction must perform a real three-second progress bar');
      assert.equal(saved.result.outcome, 'extract'); assert.equal(saved.activeRun, null);
      assert.equal(saved.stats.runs, 1); assert.equal(saved.stats.extracts, 1);
      assert.ok(saved.bag.items.some(item => item.id === 'sample'));
      assert.equal(saved.equipment.weapon, 'pistol');
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      await screenshot('result-extract');
      return { actualHoldMs: rounded(elapsed), savedRuns: saved.stats.runs };
    });
    await step('second run: actual enemy attack causes death and protects the safe', async () => {
      await action('return').click(); await waitState('hideout'); await deploy(43);
      await standAt({ x: 700, y: 784 });
      const scav = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.kind === 'scav' && a.alive)?.uid);
      assert.ok(scav, 'a club enemy on the street');
      await drive(page, 'vitals', { hp: 1, bleeding: false, pollution: 0 });
      await drive(page, 'placeEnemy', scav, { x: 720, y: 784 });
      await drive(page, 'freezeAI', false);
      await resultShown(60000);
      const saved = await state();
      assert.equal(saved.result.outcome, 'death'); assert.equal(saved.stats.runs, 2);
      assert.equal(saved.bag.items.length, 0); assert.equal(saved.equipment.weapon, null);
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      assert.deepEqual(saved.quests, beforeResults.quests);
      await screenshot('result-death');
    });
    await step('third run: timeout and three-run persistence after reload', async () => {
      await action('return').click(); await waitState('hideout'); await deploy(44);
      await drive(page, 'clock', 599.99);
      await resultShown();
      const saved = await state();
      assert.equal(saved.result.outcome, 'timeout'); assert.equal(saved.stats.runs, 3);
      assert.equal(saved.stats.extracts, 1); assert.equal(saved.bag.items.length, 0);
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      await screenshot('result-timeout');
      await page.reload({ waitUntil: 'load' }); await waitState('menu'); await action('enter').waitFor();
      assert.deepEqual(await state(), { ...saved, state: 'menu' });
      return { completedRuns: 3, outcomes: ['extract', 'death', 'timeout'], volumeAfterReload: (await state()).volume };
    });
    await step('fourth run: midrun reload restores carried items and the matching world checkpoint', async () => {
      await action('enter').click(); await waitState('hideout');
      const medkit = (await state()).stash.items.find(item => item.id === 'medkit');
      assert.ok(medkit, 'An untouched warehouse medkit can test carried-item recovery');
      await page.locator(`[data-uid="${medkit.uid}"]`).click(); await action('transfer').click();
      assert.ok((await state()).bag.items.some(item => item.id === 'medkit'));
      const stashBefore = (await state()).stash;
      await deploy(45);
      await collectSample();
      await page.keyboard.press('Tab');
      await waitPanel(page, 'inventory');
      const sampleUid = await page.evaluate(() => window.__bincov.app.loadout.bag.items.find(item => item.id === 'sample').uid);
      await page.locator(`.coast-sample [data-panel] [data-source="bag"][data-uid="${sampleUid}"]`).click();
      await page.locator('.coast-sample [data-do="inv-quick"]').click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).profile.safe.items.some(item => item.id === 'sample'), SAVE_KEY);
      const checkpoint = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, SAVE_KEY);
      assert.ok(checkpoint.activeRun); assert.ok(checkpoint.safe.items.some(item => item.id === 'sample'));
      await page.reload({ waitUntil: 'load' }); await waitState('menu'); await action('enter').waitFor();
      const recovered = await state();
      assert.ok(recovered.activeRun); assert.equal(recovered.stats.runs, 4);
      assert.equal(recovered.result.outcome, 'timeout', 'Reload must not settle the new run');
      assert.ok(await page.evaluate(() => __bincov.app.expansion.raid.loadout.bag.items.some(i => i.id === 'medkit')));
      assert.equal(recovered.bag.items.length, 0); assert.equal(recovered.equipment.weapon, null);
      assert.deepEqual(recovered.stash, stashBefore); assert.deepEqual(recovered.safe, checkpoint.safe);
      assert.equal(recovered.cash, beforeResults.cash); assert.deepEqual(recovered.quests, beforeResults.quests);
      await action('enter').click(); await waitState('run'); await raidReady(page);
      await waitPanel(page, 'pause'); assert.equal(await panel(page), 'pause'); await screenshot('recovered-raid');
      return { carriedMedkitRestored: true, safeSamplePreserved: true, noExtraSettlement: recovered.stats.runs === 4 };
    });
  } finally {
    if (record.steps.some(item => item.status === 'failed')) {
      try { await screenshot('failure'); } catch { /* Preserve original failure. */ }
    }
    await context.close(); activePage = undefined;
  }
}

try {
  await suite({ width: 1280, height: 720 });
  await suite({ width: 1920, height: 1080 });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error);
  console.error(report.failure); process.exitCode = 1;
  if (activePage) { try { await activePage.screenshot({ path: join(out, 'unexpected-failure.png') }); } catch {} }
} finally {
  report.finishedAt = new Date().toISOString();
  await saveReport();
  await browser.close();
  console.log(`Browser acceptance ${report.status}: ${join(out, smoke ? 'browser-smoke.json' : 'browser-report.json')}`);
}
