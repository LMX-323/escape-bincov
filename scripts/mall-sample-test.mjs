// Mall sample (?sample=mall) on the real mall Runtime: the 2.5D view of layout revision 2 with Sol's samples (issue #47).
// Deploys through the ordinary tab page and the station yard, then checks the layout-2 world, the dressed scene, the
// cutaway from outside, overlap-safe visibility, the stairs between floors, exits per floor, weather, remounts, the
// placeholder fallback and screenshots at 1280x720 and 1920x1080. Fixtures use the explicit ?test=1 driver only to
// place the player and enemies.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deployFromYard } from './yard-entry.mjs';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_SAMPLE_OUT || 'test-results/mall-sample'); await mkdir(out, { recursive: true });
const htmlPath = resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html'), url = pathToFileURL(htmlPath).href;
const report = { startedAt: new Date().toISOString(), build: url, buildSHA256: createHash('sha256').update(await readFile(htmlPath)).digest('hex'), seed: '42', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function step(name, task) {
  const entry = { name, status: 'running' }; report.steps.push(entry);
  try { entry.detail = await task(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); entry.status = 'passed'; }
  catch (error) { entry.status = 'failed'; entry.error = String(error?.stack ?? error).slice(0, 1200); }
  console.log(`${entry.status === 'passed' ? 'PASS' : 'FAIL'}  ${name}${entry.error ? `\n      ${entry.error.split('\n')[0]}` : ''}`);
}
async function open(query, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport, offline: true });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await page.goto(url + query);
  return { context, page };
}
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const frames = (page, n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const now = page => page.evaluate(() => {
  const h = window.__bincovSample.host, b = h.lastBatch;
  return { map: b.stamp.world.mapId, worldVersion: b.stamp.world.worldVersion, player: b.frame.player, interaction: b.frame.interaction, revealed: b.frame.revealed, panel: h.panel };
});
/** Place the player on the nearest cell to (x, y) (cells) where the body fits. */
const place = (page, x, y, angle = 0, map) => page.evaluate(([x, y, a, m]) => {
  let last = '';
  for (let d = 0; d < 6; d++) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
    try { window.__bincovSample.driver.placePlayer({ x: (x + dx) * 32, y: (y + dy) * 32 }, a, m); return { x: x + dx, y: y + dy }; } catch (e) { last = String(e); }
  }
  throw new Error(last);
}, [x, y, angle, map]);
const shot = (page, name) => page.screenshot({ path: resolve(out, name) });
async function deployTabs(page) {
  await action(page, 'enter').click();
  assert.equal(await page.locator('#run-world').inputValue(), 'mall', 'the mall sample preselects the mall');
  await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  await frames(page, 5);
}

{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall');
  await step('M00 the mall sample deploys layout revision 2 on the Pixi host with both art sets', async () => {
    await deployTabs(page);
    const s = await page.evaluate(() => {
      const h = window.__bincovSample.host, c = window.__bincovSample.counts();
      return { state: window.__bincov.app.state, phaser: !!window.__bincov.app.raid, worldVersion: h.session.expansion.raid.worldVersion, map: h.lastBatch.stamp.world.mapId,
        art: c.art, mallArt: c.mallArt, occluders: h.view.stats.occluders, flights: [...h.view.mall.flights], roots: c.sampleRoots };
    });
    assert.equal(s.state, 'run'); assert.equal(s.phaser, false); assert.equal(s.worldVersion, 'mall-v2'); assert.equal(s.map, 'mall-f1');
    assert.equal(s.art, 'sol'); assert.equal(s.mallArt, 'sol'); assert.equal(s.roots, 1);
    assert.ok(s.occluders > 800, `dressed walls and furniture: ${s.occluders}`);
    assert.deepEqual(s.flights, ['S-N-up'], 'the S-N flight replaces its generic stair marker; other stairs keep theirs');
    return s;
  });
  await step('M01 dressed route: furniture, signs and glows are placed; a fading piece takes its links along', async () => {
    await place(page, 35.5, 23.6, 0, 'mall-f1'); await frames(page, 20);
    const s = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, props = v.occluders.filter(o => o.kind === 'prop');
      const linked = props.filter(o => o.links?.length), glows = v.occluders.flatMap(o => o.links ?? []).filter(l => l.emit);
      // The gondola segment in front of the player fades, and its aisle sign or glow (if any) shares the level.
      const faded = props.filter(o => o.level > 0 && o.sprite.renderable);
      return { props: props.length, linked: linked.length, glows: glows.length, faded: faded.length, gondolas: props.filter(o => o.key.includes('gondola')).length,
        linkVisible: linked.every(o => o.links.every(l => l.sprite.visible === o.sprite.visible)) };
    });
    assert.ok(s.props >= 80 && s.gondolas >= 40, JSON.stringify(s)); assert.ok(s.linked >= 9 && s.glows >= 8, JSON.stringify(s));
    assert.ok(s.faded >= 1, 'the shelf in front of the player fades'); assert.ok(s.linkVisible);
    await shot(page, 'm01-f1-supermarket-1280.png');
    return s;
  });
  await step('M02 from the plaza the facade stays solid; inside the lobby the walls in front are cut away', async () => {
    const facade = () => page.evaluate(() => {
      const v = window.__bincovSample.host.view, curtain = v.occluders.filter(o => o.kind === 'wall' && o.key.includes('curtain'));
      return { curtain: curtain.length, levels: [...new Set(curtain.map(o => o.level))], mist: v.weather.shelter };
    });
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await wait(1500); await frames(page, 10);
    const outside = await facade(); await shot(page, 'm02-f1-entrance-outside-1280.png');
    await place(page, 59.5, 15.5, Math.PI / 2, 'mall-f1'); await wait(1500); await frames(page, 10);
    const lobby = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, p = window.__bincovSample.host.lastBatch.frame.player;
      // Walls whose cell centre lies up to four rows in front of the player and six cells to either side.
      const ahead = v.occluders.filter(o => o.kind === 'wall' && o.z > p.y + 8 && o.z < p.y + 128 && Math.abs(o.rect.x + 16 - p.x) < 180);
      return { ahead: ahead.length, cut: ahead.filter(o => o.level === 3).length, mist: v.weather.shelter };
    });
    await shot(page, 'm02-f1-lobby-1280.png');
    // Only the player's own focus fade (levels 1-2 next to the body) may touch it; the structural cutaway (3) must not.
    assert.ok(outside.curtain >= 6, 'glass curtain cells'); assert.ok(outside.levels.every(l => l < 3) && outside.levels.includes(0), `curtain wall solid from outside: ${outside.levels}`);
    assert.ok(outside.mist < .2, `mist outdoors: ${outside.mist}`);
    assert.ok(lobby.ahead > 0 && lobby.cut === lobby.ahead, JSON.stringify(lobby)); assert.ok(lobby.mist > .8, `mist thins indoors: ${lobby.mist}`);
    return { outside, lobby };
  });
  await step('M03 overlapping rooms fail closed: an enemy in an unrevealed room inside a revealed one stays hidden', async () => {
    // Find two overlapping inside regions on F2 and a fitting point inside both whose inner room is not revealed.
    await place(page, 61.5, 14.6, Math.PI / 2, 'mall-f2'); await frames(page, 10);
    const pair = await page.evaluate(() => {
      const m = window.__bincovSample.host.view.mapDef, R = m.regions.filter(r => r.inside);
      const hit = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      for (const a of R) for (const b of R) {
        if (a === b || !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)) continue;
        const both = [], onlyA = [];
        for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
          if (m.cells[y][x] !== 'floor') continue; const px = x * 32 + 16, py = y * 32 + 16;
          if (hit(a, px, py) && hit(b, px, py)) both.push([x + .5, y + .5]); else if (hit(a, px, py) && !hit(b, px, py)) onlyA.push([x + .5, y + .5]);
        }
        if (both.length && onlyA.length) return { a: a.id, b: b.id, both, onlyA };
      }
      return null;
    });
    assert.ok(pair, 'F2 has overlapping rooms');
    let probe = null;
    for (const [x, y] of pair.onlyA.slice(0, 40)) {
      try { await place(page, x, y, 0, 'mall-f2'); } catch { continue; }
      await frames(page, 4); const f = await now(page);
      if (f.revealed[pair.a] && !f.revealed[pair.b]) { probe = { player: [x, y] }; break; }
    }
    if (!probe) { for (const [x, y] of pair.onlyA.slice(0, 40)) { try { await place(page, x, y, 0, 'mall-f2'); } catch { continue; } await frames(page, 4); const f = await now(page); if (f.revealed[pair.b] && !f.revealed[pair.a]) { probe = { player: [x, y], swapped: true }; break; } } }
    assert.ok(probe, `a spot with exactly one of ${pair.a} / ${pair.b} revealed`);
    const r = await page.evaluate(([both]) => {
      const h = window.__bincovSample.host, v = h.view, f = h.lastBatch.frame, d = window.__bincovSample.driver;
      const enemy = f.actors.find(a => a.alive); if (!enemy) return { error: 'no enemy on F2' };
      for (const [x, y] of both) { try { d.placeEnemy(enemy.uid, { x: x * 32, y: y * 32 }); return { uid: enemy.uid, at: [x, y] }; } catch {} }
      return { error: 'no fitting point in the overlap' };
    }, [pair.both]);
    assert.ok(!r.error, r.error); await frames(page, 6);
    const seen = await page.evaluate(([uid, at]) => {
      const h = window.__bincovSample.host, v = h.view, f = h.lastBatch.frame, a = f.actors.find(x => x.uid === uid), p = { x: at[0] * 32, y: at[1] * 32 };
      return { runtimeRegion: a.regionId, revealed: f.revealed[a.regionId] === true, shown: v.actorShown(uid), viewRegion: v.regionAt(p), shownAt: v.shownAt(p, f.revealed) };
    }, [r.uid, r.at]);
    assert.equal(seen.revealed, false); assert.equal(seen.shown, false); assert.equal(seen.shownAt, false); assert.equal(seen.viewRegion, seen.runtimeRegion);
    // Positive control: standing next to it reveals the inner room, and the enemy shows.
    await place(page, r.at[0], r.at[1] + 1, 0, 'mall-f2').catch(() => place(page, r.at[0] + 1, r.at[1], 0, 'mall-f2')); await frames(page, 8);
    const control = await page.evaluate(uid => { const h = window.__bincovSample.host; return { shown: h.view.actorShown(uid), revealed: Object.entries(h.lastBatch.frame.revealed).filter(([, v]) => v).map(([k]) => k) }; }, r.uid);
    return { pair: { a: pair.a, b: pair.b }, probe, enemy: r, seen, control };
  });
  await step('M04 the S-N stairs take the player up and back down; each floor keeps its own dressing', async () => {
    const rides = [];
    for (const [from, to, map] of [['mall-f1', 'mall-f2', 'mall-f1'], ['mall-f2', 'mall-f1', 'mall-f2']]) {
      await place(page, 62.5, 13.6, -Math.PI / 2, map); await frames(page, 6);
      const before = await now(page); assert.equal(before.map, from); assert.equal(before.interaction?.kind, 'entry', JSON.stringify(before.interaction));
      const t0 = Date.now(); await page.keyboard.press('e');
      await page.waitForFunction(m => window.__bincovSample.host.lastBatch.stamp.world.mapId === m, to, { timeout: 10000 });
      await frames(page, 6);
      const after = await page.evaluate(() => { const v = window.__bincovSample.host.view; return { map: v.mapDef.key.mapId, rebuildMs: v.stats.rebuildMs, occluders: v.stats.occluders, flights: [...v.mall.flights], pages: window.__bincovSample.counts().atlasPages, bytes: v.textureBytes() }; });
      rides.push({ from, to, ms: Date.now() - t0, ...after });
      assert.equal(after.map, to); assert.ok(after.rebuildMs < 1500, `rebuild ${after.rebuildMs} ms`);
    }
    assert.deepEqual(rides.map(r => r.flights[0]), ['S-N-down', 'S-N-up']);
    return rides;
  });
  await step('M05 exits are listed and pointed at on the ground floor only', async () => {
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await frames(page, 6);
    await page.keyboard.press('m'); await frames(page, 4);
    const f1 = await page.locator('[data-exit] option').count(), first = await page.locator('[data-exit] option').nth(1).getAttribute('value');
    await page.locator('[data-exit]').selectOption(first); await frames(page, 2);
    await page.locator('[data-panel] [data-do="close"]').click(); await frames(page, 6);
    // Away from the exit (its ring off screen) the pointer is an arrow on the screen edge.
    await place(page, 35.5, 23.6, 0, 'mall-f1'); await frames(page, 20);
    const state = await page.evaluate(() => { const h = window.__bincovSample.host, el = h.q('[data-exitptr]'); return { selected: h.selectedExit, panel: h.panel, hidden: el.hidden, cls: el.className, exits: h.lastBatch.map.exits.map(e => e.name), box: el.getBoundingClientRect().toJSON() }; });
    await place(page, 61.5, 14.6, Math.PI / 2, 'mall-f2'); await frames(page, 6);
    await page.keyboard.press('m'); await frames(page, 4);
    const f2 = await page.locator('[data-exit] option').count(), disabled = await page.locator('[data-exit]').isDisabled();
    await page.locator('[data-panel] [data-do="close"]').click(); await frames(page, 4);
    const pointerF2 = await page.evaluate(() => !window.__bincovSample.host.q('[data-exitptr]').hidden);
    assert.ok(f1 >= 3, `F1 exits ${f1 - 1}`); assert.ok(!state.hidden && state.cls.includes('edge'), JSON.stringify(state)); assert.equal(f2, 1); assert.ok(disabled); assert.equal(pointerF2, false);
    return { f1: f1 - 1, first, f2: f2 - 1, pointer: state, pointerF2 };
  });
  await step('M06 rain falls on the plaza and the terrace, never inside the footprint', async () => {
    const drops = async (x, y, map) => { await place(page, x, y, Math.PI / 2, map); await frames(page, 40); return page.evaluate(() => {
      const w = window.__bincovSample.host.view.weather, inside = s => s.visible && s.x >= 8 * 32 && s.x < 65 * 32 && s.y >= 6 * 32 && s.y < 49 * 32;
      return { front: w.front.visible, drops: w.stats.drops, splashesInside: w.back.children.filter(inside).length };
    }); };
    const plaza = await drops(59.5, 4.5, 'mall-f1'), terrace = await drops(68.5, 33.6, 'mall-f2');
    await shot(page, 'm06-f2-terrace-1280.png');
    assert.ok(plaza.front && plaza.drops > 0, JSON.stringify(plaza)); assert.ok(terrace.drops > 0, JSON.stringify(terrace));
    assert.equal(plaza.splashesInside, 0); assert.equal(terrace.splashesInside, 0);
    return { plaza, terrace };
  });
  await step('M07 five view remounts on the live Runtime keep listeners, render targets, canvases and textures flat', async () => {
    await place(page, 47.5, 34.6, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const first = await page.evaluate(() => window.__bincovSample.counts());
    await page.evaluate(() => window.__bincovSample.remount(5)); await frames(page, 10);
    const last = await page.evaluate(() => window.__bincovSample.counts());
    for (const k of ['listeners', 'tickers', 'observers', 'apps', 'parked', 'views', 'renderTextures', 'liveViews', 'canvases', 'sampleRoots']) assert.equal(last[k], first[k], k);
    assert.ok(last.gpuTextures <= first.gpuTextures + 2, `GPU textures ${first.gpuTextures} -> ${last.gpuTextures}`);
    await shot(page, 'm07-f1-fresh-cold-1280.png');
    return { first, last };
  });
  await step('M08 1920x1080: the lobby and the home store', async () => {
    await page.setViewportSize({ width: 1920, height: 1080 }); await frames(page, 6);
    await place(page, 59.5, 13.6, Math.PI / 2, 'mall-f1'); await frames(page, 30); await shot(page, 'm08-f1-lobby-1920.png');
    await place(page, 62, 27.6, 0, 'mall-f2'); await frames(page, 30); await shot(page, 'm08-f2-home-1920.png');
    const s = await page.evaluate(() => ({ view: window.__bincovSample.host.view.view, frameMs: window.__bincovSample.host.view.stats.frameMs }));
    assert.ok(s.view.W >= 1900); return s;
  });
  await context.close();
}
const savedWorld = page => page.evaluate(() => /"worldVersion":"([^"]+)"/.exec(localStorage.getItem('escape-bincov.session.v2') ?? '')?.[1] ?? null);
{
  const { context, page } = await open('?sample=mall');
  await step('M09 without ?test=1 the station yard deploys the mall sample on layout 2 and exposes no test interface', async () => {
    await action(page, 'enter').click(); await deployFromYard(page, { world: 'mall', seed: 43 });
    await page.waitForSelector('.coast-sample canvas', { timeout: 60000 }); await wait(600);
    const s = await page.evaluate(() => ({ test: typeof window.__bincovSample, bincov: typeof window.__bincov, roots: document.querySelectorAll('.coast-sample').length }));
    s.worldVersion = await savedWorld(page);
    assert.deepEqual(s, { test: 'undefined', bincov: 'undefined', roots: 1, worldVersion: 'mall-v2' });
    await shot(page, 'm09-yard-deploy-1280.png');
    return s;
  });
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true }), page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await step('M13 the playtest launcher 商场试玩.html opens the offline game with the mall sample on', async () => {
    await page.goto(pathToFileURL(resolve('商场试玩.html')).href + '?weather=clear');
    await page.waitForURL(/start%20the%20game\.html\?sample=mall&weather=clear/);
    return { url: page.url().replace(/^.*\//, '') };
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs');
  await step('M10 the ordinary entry is unchanged: a mall raid is layout 1 on the Phaser RaidScene', async () => {
    await action(page, 'enter').click(); await page.locator('#run-world').selectOption('mall'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincov.app.raid?.player?.active, null, { timeout: 60000 });
    const s = await page.evaluate(() => ({ sample: document.querySelectorAll('.coast-sample').length, coastSample: !!window.__bincov.app.coastSample }));
    s.worldVersion = await savedWorld(page);
    assert.deepEqual(s, { sample: 0, coastSample: false, worldVersion: 'mall-v1' });
    return s;
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall&art=placeholder');
  await step('M11 without art the mall floors keep the generic placeholder pipeline', async () => {
    await deployTabs(page);
    const s = await page.evaluate(() => { const c = window.__bincovSample.counts(), v = window.__bincovSample.host.view; return { art: c.art, mallArt: c.mallArt, mall: !!v.mall, occluders: v.stats.occluders }; });
    assert.deepEqual({ art: s.art, mallArt: s.mallArt, mall: s.mall }, { art: 'placeholder', mallArt: 'placeholder', mall: false });
    await shot(page, 'm11-placeholder-1280.png');
    return s;
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await step('M12 the village sample is unchanged: buildings preselected, the mall is not drawn by it', async () => {
    await action(page, 'enter').click();
    const world = await page.locator('#run-world').inputValue();
    assert.equal(world, 'buildings');
    return { world };
  });
  await context.close();
}
await browser.close();
report.finishedAt = new Date().toISOString();
report.passed = report.steps.filter(s => s.status === 'passed').length; report.failed = report.steps.length - report.passed;
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.steps.length} passed; errors ${report.errors.length}; external requests ${report.requests.length}`);
if (report.failed) process.exitCode = 1;
