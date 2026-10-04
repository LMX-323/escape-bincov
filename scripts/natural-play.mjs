/** Real-time automated play: read game state, act only through keyboard/mouse. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { findPath, lineOfSight } from '../src/world.ts';
import { browserOptions } from './browser-options.mjs';

const minutes = Number(process.env.BINCOV_PLAY_MINUTES || 10);
assert.ok(minutes >= 1 && minutes <= 60);
const report = { startedAt: new Date().toISOString(), minutes, methodology: 'Automated real-time session. Test hook is read-only: no teleports, no clock changes, no changes to health, enemies, inventory or RNG. All actions use visible buttons and real keyboard/mouse. This is not a human fun/balance evaluation.', samples: [], outcomes: [], errors: [], externalRequests: [] };
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
context.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let held = new Set(), runNumber = 0, goal = null, path = [], repathAt = 0, lastSample = 0;
let visited = new Set(), lastPosition, stuckAt = Date.now(), lastHeal = 0;
async function keys(next) {
  for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
  for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
  held = next;
}
async function snapshot() {
  return page.evaluate(() => {
    const a = window.__bincov.app, r = a.raid;
    if (a.state !== 'run' || !r?.player?.active) return { state: a.state, result: a.save.lastResult, stats: a.save.stats };
    const box = a.game.canvas.getBoundingClientRect(), c = r.cameras.main;
    return { state: a.state, hp: r.hp, bleeding: r.bleeding, elapsed: r.elapsed, high: r.highTide, kills: r.kills, mag: r.mag, reload: r.reloadLeft, cooldown: r.fireCooldown, x: r.player.x, y: r.player.y,
      exits: r.config.exits, loot: r.loot.map(l => ({ x: l.sprite.x, y: l.sprite.y, id: l.id })),
      enemies: r.enemies.filter(e => e.hp > 0).map(e => ({ x: e.sprite.x, y: e.sprite.y, id: e.id })),
      ammo: a.loadout.bag.items.filter(i => i.id === 'ammo9').reduce((sum, i) => sum + i.qty, 0),
      medical: a.loadout.bag.items.filter(i => ['medkit', 'bandage'].includes(i.id)).reduce((sum, i) => sum + i.qty, 0),
      camera: { x: box.x, y: box.y, scale: box.width / 960, scrollX: c.scrollX, scrollY: c.scrollY }, pending: !!a.pendingSettlement };
  });
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
  await action('enter').click();
  const start = Date.now(), deadline = start + minutes * 60000;
  while (Date.now() < deadline || (await snapshot()).state === 'run') {
    const s = await snapshot(), now = Date.now();
    assert.equal(s.pending, s.state === 'run' ? false : undefined, 'Storage must stay available');
    if (s.state === 'result') {
      await keys(new Set()); report.outcomes.push(s.result);
      console.log('Run completed', s.result.outcome, 'kills', s.result.kills);
      await action('return').click(); continue;
    }
    if (s.state === 'hideout') {
      if (now >= deadline) break;
      await action('tab', 'arms').click();
      for (let i = 0; i < 2; i++) if (await action('buy', 'ammo9').isEnabled()) await action('buy', 'ammo9').click();
      await action('tab', 'med').click();
      if (await action('buy', 'medkit').isEnabled()) await action('buy', 'medkit').click();
      await action('tab', 'gear').click();
      for (let i = 0; i < 12; i++) {
        const items = page.locator('[data-source="stash"][data-uid]'); const count = await items.count();
        if (!count) break;
        await items.first().dblclick(); if (await items.count() >= count) break;
      }
      await page.locator('#seed').fill(String(42 + runNumber++)); await action('deploy').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      goal = null; path = []; visited = new Set(); lastPosition = null; stuckAt = now;
      continue;
    }
    if (s.state !== 'run') throw new Error('Unexpected state ' + s.state);
    if (now - lastSample > 30000) {
      const sample = { realSeconds: Math.round((now - start) / 1000), run: runNumber, elapsed: Math.round(s.elapsed), hp: Math.round(s.hp), kills: s.kills, highTide: s.high, x: Math.round(s.x), y: Math.round(s.y) };
      report.samples.push(sample); console.log('PLAY', JSON.stringify(sample)); lastSample = now;
      await writeFile(resolve(out, 'natural-play-progress.json'), JSON.stringify(report, null, 2));
    }
    if (now - lastHeal > 1500 && s.medical && (s.hp < 70 || s.bleeding)) { await page.keyboard.press('q'); lastHeal = now; }
    if (s.mag === 0 && s.ammo && !s.reload) await page.keyboard.press('r');
    const target = s.enemies.filter(e => dist(e, s) < 430 && lineOfSight(s, e)).sort((a, b) => dist(a, s) - dist(b, s))[0];
    if (target && s.mag && !s.reload && s.cooldown <= 0) {
      const x = s.camera.x + (target.x - s.camera.scrollX) * s.camera.scale, y = s.camera.y + (target.y - s.camera.scrollY) * s.camera.scale;
      if (x > 0 && x < 1280 && y > 0 && y < 720) await page.mouse.click(x, y, { delay: 40 });
    }
    const evacuate = now >= deadline || s.elapsed >= 550 || (s.hp < 35 && !s.medical) || (!s.mag && !s.ammo);
    if (evacuate) {
      goal = [...s.exits].sort((a, b) => dist(a, s) - dist(b, s))[0];
      if (dist(goal, s) < 43) {
        await keys(new Set()); await page.keyboard.down('e'); await page.waitForTimeout(3300); await page.keyboard.up('e'); continue;
      }
    } else if (!goal || dist(goal, s) < 35) {
      if (goal) { await page.keyboard.press('e', { delay: 70 }); visited.add(`${goal.x},${goal.y}`); }
      const choices = s.loot.filter(l => !visited.has(`${l.x},${l.y}`) && !s.enemies.some(e => dist(e, l) < 100));
      goal = choices.sort((a, b) => dist(a, s) - dist(b, s))[0] ?? s.exits[0];
    }
    if (!lastPosition || dist(lastPosition, s) > 10) { lastPosition = { x: s.x, y: s.y }; stuckAt = now; }
    if (now - stuckAt > 7000) { visited.add(`${goal.x},${goal.y}`); goal = null; stuckAt = now; await keys(new Set()); continue; }
    if (now >= repathAt || !path.length) { path = findPath(s, goal, s.high); repathAt = now + 750; }
    while (path.length && dist(path[0], s) < 12) path.shift();
    const point = path[0] ?? goal, next = new Set();
    if (point.x - s.x > 6) next.add('d'); if (point.x - s.x < -6) next.add('a');
    if (point.y - s.y > 6) next.add('s'); if (point.y - s.y < -6) next.add('w');
    await keys(next); await page.waitForTimeout(120);
    if (now > deadline + 150000) throw new Error('Could not finish the final run within the session limit');
  }
  await keys(new Set());
  const final = await snapshot();
  if (final.state === 'result') report.outcomes.push(final.result);
  await page.screenshot({ path: resolve(out, 'natural-play-end.png') });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed'; report.finalStats = final.stats;
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally {
  await keys(new Set()).catch(() => {}); await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'natural-play-report.json'), JSON.stringify(report, null, 2));
}
