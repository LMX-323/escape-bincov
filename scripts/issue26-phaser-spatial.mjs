// Ordinary Phaser raid view (no sample flag): door and stair guides above an opaque roof, and the
// hidden-room pixel rule. Real offline build, real keyboard E/W; ?test=1 only positions the player,
// pauses the scene while pixels are compared, and stages entities and probe bullets through the
// expansion snapshot for the doorway and stair-label layer checks and the critical-hit check.
// Run unchanged with --html=<old dist/index.html> for the old-build negative control.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = resolve(option('html', 'dist/index.html')), out = resolve(option('out', 'test-results/issue26-phaser-spatial'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { html: basename(htmlPath), sha256: createHash('sha256').update(await readFile(htmlPath)).digest('hex'), browser: browser.version(), checks: [], errors: [] };
let page, size, scale;

const frames = (n = 4) => page.evaluate(n => new Promise(done => { let count = 0; const tick = () => ++count >= n ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), n);
const settle = async () => { await page.waitForTimeout(250); await frames(4); };
const stand = async (x, y) => {
  await page.evaluate(([x, y]) => { const r = window.__bincov.app.raid; r.player.setPosition(x, y); r.cameras.main.centerOn(x, y); if (!r.checkpoint()) throw new Error('Fixture checkpoint failed'); }, [x, y]);
  await settle();
};
/** World rectangle to a page clip, using the camera's rendered view. */
const clipOf = (x, y, w, h) => page.evaluate(([x, y, w, h]) => {
  const r = window.__bincov.app.raid, c = r.game.canvas.getBoundingClientRect(), s = c.width / 960, v = r.cameras.main.worldView;
  const left = Math.max(c.left, c.left + (x - v.x) * s), top = Math.max(c.top, c.top + (y - v.y) * s);
  const right = Math.min(c.right, c.left + (x + w - v.x) * s), bottom = Math.min(c.bottom, c.top + (y + h - v.y) * s);
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
}, [x, y, w, h]);
const grab = async clip => (await page.screenshot({ clip })).toString('base64');
const decode = src => `new Promise(done => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const g = c.getContext('2d'); g.drawImage(i, 0, 0); done(g.getImageData(0, 0, i.width, i.height).data); }; i.src = 'data:image/png;base64,' + ${JSON.stringify(src)}; })`;
/** Warm = sand brackets or wooden leaf; mint = open-door brackets and passage arrow. The roof is dark green. */
const classify = async b64 => page.evaluate(`(async () => { const d = await ${decode(b64)}; let warm = 0, mint = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 110 && r - b > 40) warm++; if (g > 150 && b > 130 && g > r + 15) mint++; }
  return { pixels: d.length / 4, warm, mint }; })()`);
const diff = async (a, b) => page.evaluate(`(async () => { const x = await ${decode(a)}, y = await ${decode(b)}; let changed = 0, max = 0;
  for (let i = 0; i < x.length; i += 4) { const m = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); if (m) changed++; if (m > max) max = m; }
  return { changed, max }; })()`);
/**
 * Occlusion of entities by the door guide, from four shots: A entities + guides, B guides only, C entities only, D neither.
 * body = pixels the entities change (C vs D); guide = pixels the guides draw (B vs D). An entity pixel with alpha a drawn
 * over the guide gives A - C = (1 - a)(B - D) on every channel, so the guide shows only through translucent entity pixels
 * (blended). covered = body pixels where A differs from C in any other way, i.e. the guide is drawn on top of the entity.
 * overlap = pixels both the entities and the guides change (C vs D and B vs D): the control that an entity really sits on
 * the guide, so covered === 0 cannot pass only because the two never meet.
 */
const occlusion = async ({ a, b, c, d }) => page.evaluate(`(async () => { const A = await ${decode(a)}, B = await ${decode(b)}, C = await ${decode(c)}, D = await ${decode(d)};
  let body = 0, covered = 0, blended = 0, guide = 0, overlap = 0; const differs = (x, y, i) => x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2];
  for (let i = 0; i < A.length; i += 4) {
    if (differs(C, D, i)) { body++;
      if (differs(A, C, i)) {
        const u = [0, 1, 2].map(j => A[i + j] - C[i + j]), v = [0, 1, 2].map(j => B[i + j] - D[i + j]), vv = v.reduce((s, x) => s + x * x, 0);
        const k = vv ? u.reduce((s, x, j) => s + x * v[j], 0) / vv : NaN;
        if (k >= -.02 && k <= 1.02 && u.every((x, j) => Math.abs(x - k * v[j]) <= 3)) blended++; else covered++;
      }
    }
    if (differs(B, D, i)) { guide++; if (differs(C, D, i)) overlap++; }
  }
  return { pixels: A.length / 4, body, covered, blended, guide, overlap }; })()`);
/** A pixel-count threshold for one screen pixel per world pixel (the 1280x720 canvas), scaled by area to the drawn canvas. */
const scaled = n => Math.round(n * scale ** 2);
/** Minimum entity-on-guide overlap at 1280x720 for the occlusion checks (P08, P09). */
const OVERLAP_MIN = 20;
/** Full viewport plus a crop of the world area under review. */
const shot = async (name, rect) => {
  const clip = await clipOf(...rect);
  await page.screenshot({ path: resolve(out, `${name}-${size.join('x')}.png`) });
  await page.screenshot({ path: resolve(out, `${name}-${size.join('x')}-crop.png`), clip });
  return clip;
};
const scene = () => page.evaluate(() => {
  const r = window.__bincov.app.raid, box = t => ({ x: t.x - t.displayOriginX, y: t.y - t.displayOriginY, w: t.displayWidth, h: t.displayHeight });
  // Stair labels are found by their destination text, so the same checks read the old and new builds.
  const stairs = new Set(r.space.definition.entries.map(e => e.label));
  const texts = r.children.list.filter(c => c.type === 'Text' && c.visible).map(t => ({ text: t.text, depth: t.depth, stair: stairs.has(t.text), ...box(t) }));
  return { map: r.space.definition.id, player: { at: { x: r.player.x, y: r.player.y }, depth: r.player.depth, box: box(r.player) }, doors: { ...r.space.doors },
    guides: r.doorGuides ? JSON.parse(JSON.stringify(r.doorGuides)) : null, texts, interaction: document.getElementById('interaction')?.textContent ?? '' };
});
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function check(name, task) {
  const row = { name: `${size.join('x')} ${name}` }; report.checks.push(row);
  try { row.detail = await task(row); assert.deepEqual(report.errors, []); row.status = 'passed'; }
  catch (e) {
    row.status = 'failed'; row.error = String(e.stack ?? e); process.exitCode = 1;
    await page.screenshot({ path: resolve(out, `failed-${size.join('x')}-${name.split(' ')[0]}.png`) }).catch(() => {});
  }
  console.log(row.status, row.name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}

try {
  for (size of [[1280, 720], [1920, 1080]]) {
    const context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] } });
    context.on('request', r => { if (/^https?:/.test(r.url())) report.errors.push(`external request ${r.url()}`); });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(String(e.stack ?? e)));
    try {
      await page.goto(pathToFileURL(htmlPath).href + '?test=1&entry=tabs');
      await page.locator('[data-action="enter"]').click();
      await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42');
      await page.locator('[data-action="deploy"]').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      // Phaser.AUTO falls back to the canvas renderer when WebGL is unavailable; record which one ran.
      report.renderer = await page.evaluate(() => ({ 1: 'canvas', 2: 'webgl' })[window.__bincov.app.raid.game.renderer.type] ?? 'unknown');
      scale = await page.evaluate(() => window.__bincov.app.raid.game.canvas.getBoundingClientRect().width / 960);

      await check('P01 exterior-door-guide-above-roof', async () => {
        await stand(464, 448); const s = await scene();
        assert.equal(s.doors['resident-front'], false);
        const cell = await classify(await grab(await clipOf(448, 384, 32, 32)));
        await shot('p01-exterior-front-door-closed', [304, 192, 352, 320]);
        assert.ok(cell.warm >= 40, `door cell shows the closed guide above the roof, warm pixels ${cell.warm}/${cell.pixels}`);
        assert.ok(s.guides, 'door guides are tracked');
        assert.deepEqual(s.guides, { 'resident-front': { wall: 'ew', state: 'closed' }, 'resident-west': null, 'resident-east': null });
        assert.deepEqual(s.texts.filter(t => t.stair && t.depth > 11).map(t => t.text), [], 'stairs inside the covered building are not drawn above the roof');
        assert.ok(s.player.depth > 11, 'player draws above the roof');
        return { cell, guides: s.guides, stairs: s.texts.filter(t => t.stair), interaction: s.interaction };
      });
      await check('P02 real-E-opens-front-door-and-W-walks-through', async () => {
        await stand(464, 432); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.doors['resident-front'] === true);
        await page.keyboard.down('w');
        try { await page.waitForFunction(() => window.__bincov.app.raid.player.y < 400, null, { timeout: 5000 }); }
        finally { await page.keyboard.up('w'); }
        await settle(); const s = await scene();
        assert.ok(s.guides, 'door guides are tracked');
        assert.deepEqual(s.guides['resident-front'], { wall: 'ew', state: 'open' });
        return { player: s.player, guide: s.guides['resident-front'] };
      });
      await check('P03 inside-E-opens-ns-door-with-passage-arrow', async () => {
        await stand(464, 336); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.doors['resident-west'] === true);
        await settle(); const s = await scene();
        // Left arrow head, outside the door cell (416..448) and away from the player at the east anchor.
        const arrow = await classify(await grab(await clipOf(403, 328, 13, 16)));
        await shot('p03-open-ns-door-arrow', [320, 224, 288, 192]);
        assert.ok(arrow.mint >= 10, `east-west passage arrow crosses the wall, mint pixels ${arrow.mint}/${arrow.pixels}`);
        assert.ok(s.guides, 'door guides are tracked');
        assert.deepEqual(s.guides['resident-west'], { wall: 'ns', state: 'open' });
        assert.deepEqual(s.guides['resident-east'], { wall: 'ns', state: 'closed' });
        return { guides: s.guides, arrow };
      });
      await check('P08 enemy-and-bullet-in-a-visible-open-doorway-draw-over-the-guide', async row => {
        // Same state as P03: the west door is open and nothing is roofed. A live enemy stands in the door cell
        // and an enemy bullet sits on the passage arrow; the scene is paused while pixels are compared.
        await page.evaluate(() => { const r = window.__bincov.app.raid; if (!r.checkpoint()) throw new Error('Fixture checkpoint failed'); r.scene.pause(); });
        try {
          const stage = async (entities, guides) => {
            const info = await page.evaluate(([entities, guides]) => {
              const r = window.__bincov.app.raid, base = window.__doorwayBase ??= r.snapshotExpansion(), s = structuredClone(base), layer = s.raid.maps[s.raid.currentMap];
              const e = layer.enemies.find(e => e.hp > 0 && Math.hypot(e.x - 432, e.y - 336) > 120);
              if (!e) throw new Error('no live enemy away from the doorway');
              if (entities) {
                Object.assign(e, { x: 432, y: 336, rotation: 0 });
                layer.bullets = [{ uid: 'probe-doorway', x: 410, y: 336, rotation: 0, vx: 0, vy: 0, left: 50, damage: 0, enemy: true }];
              }
              r.restoreExpansion(s);
              // The old build has no separate guide layer; its door is part of the depth-3 floor marks.
              const layers = [r.guide, r.guideAbove].filter(Boolean); layers.forEach(g => g.setVisible(guides));
              return { layers: layers.map(g => g.depth), enemy: e.uid, enemyDepth: r.enemies.find(x => x.uid === e.uid).sprite.depth, doors: { ...r.space.doors } };
            }, [entities, guides]);
            await frames(3); return info;
          };
          const clip = await clipOf(400, 316, 64, 40), shots = {};
          for (const [key, entities, guides] of [['a', true, true], ['b', false, true], ['c', true, false], ['d', false, false]]) {
            const info = await stage(entities, guides); shots[key] = await grab(clip); shots.info ??= info;
            if (key === 'a') await page.screenshot({ path: resolve(out, `p08-doorway-enemy-over-guide-${size.join('x')}-crop.png`), clip });
          }
          const result = await occlusion(shots);
          // Kept on failure too, for the negative-control report.
          row.detail = { clip, ...result, info: shots.info };
          assert.equal(shots.info.doors['resident-west'], true, 'the west door is open');
          assert.ok(result.body > 100, `positive control: the enemy and bullet are in the clip (${result.body} px)`);
          if (shots.info.layers.length) assert.ok(result.guide > 50, `positive control: the guide is drawn in the doorway (${result.guide} px)`);
          // Without this the check could pass because nothing sits on the guide (or no guide layer could be toggled).
          assert.ok(result.overlap > scaled(OVERLAP_MIN), `positive control: the enemy and bullet sit on the guide (${result.overlap} px, need > ${scaled(OVERLAP_MIN)})`);
          assert.equal(result.covered, 0, `the guide is drawn over ${result.covered} enemy or bullet pixels in a visible doorway`);
          return row.detail;
        } finally {
          await page.evaluate(() => {
            const r = window.__bincov.app.raid; [r.guide, r.guideAbove].filter(Boolean).forEach(g => g.setVisible(true));
            if (window.__doorwayBase) r.restoreExpansion(window.__doorwayBase); delete window.__doorwayBase;
            r.releaseInput(); r.scene.resume();
          }).catch(() => {});
          await settle();
        }
      });
      await check('P06 ground-floor-stair-labels-clear-room-name', async () => {
        const s = await scene(), shown = s.texts.filter(t => t.stair);
        await shot('p06-ground-floor-stair-labels', [384, 208, 224, 128]);
        assert.deepEqual(shown.map(l => l.text).sort(), ['上楼 · 二楼', '下楼 · 地下'].sort());
        const room = s.texts.find(t => t.text === '褪色居民楼 · 一楼'); assert.ok(room, 'region name is drawn');
        for (const l of shown) {
          assert.ok(!overlaps(l, room), `${l.text} must not cover the room name`);
          assert.ok(shown.every(o => o === l || !overlaps(l, o)), `${l.text} must not cover another stair label`);
        }
        return { labels: shown, room };
      });
      await check('P04 f2-landing-storage-door-and-label', async () => {
        await stand(560, 272); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'resident-f2');
        await settle(); const s = await scene();
        const cell = await classify(await grab(await clipOf(288, 96, 32, 32)));
        await shot('p04-f2-landing-storage-door', [0, 0, 384, 320]);
        assert.equal(s.map, 'resident-f2'); assert.deepEqual(s.player.at, { x: 304, y: 80 });
        assert.ok(cell.warm >= 40, `storage door guide is visible at the landing, warm pixels ${cell.warm}/${cell.pixels}`);
        const label = s.texts.find(t => t.text === '下楼 · 一楼');
        assert.ok(label, 'landing stair label is shown');
        assert.ok(!overlaps(label, s.player.box), 'stair label clears the player on the platform');
        const others = s.texts.filter(t => t !== label);
        assert.deepEqual(others.filter(t => overlaps(label, t)).map(t => t.text), [], 'stair label clears every other label');
        assert.ok(s.guides, 'door guides are tracked');
        assert.deepEqual(s.guides['resident-storage'], { wall: 'ew', state: 'closed' });
        return { guides: s.guides, cell, label, player: s.player };
      });
      // Pixels are compared with the Raid scene paused: it still renders, but AI and timers stop.
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.checkpoint(); r.scene.pause(); });
      try {
        await check('P05 covered-room-zero-pixel-change-with-positive-control', async () => {
          await frames(3);
          const fixture = await page.evaluate(() => {
            const r = window.__bincov.app.raid, e = r.enemies.find(e => e.uid === 'enemy-0');
            return { alive: e?.hp > 0, at: e && { x: e.sprite.x, y: e.sprite.y } };
          });
          assert.ok(fixture.alive && fixture.at.x > 32 && fixture.at.x < 128 && fixture.at.y > 96 && fixture.at.y < 256, `enemy-0 is alive in the covered west room ${JSON.stringify(fixture)}`);
          const clip = await clipOf(40, 104, 80, 144), to = { x: 80, y: fixture.at.y > 176 ? 136 : 216 };
          const move = async p => { await page.evaluate(p => window.__bincov.app.raid.enemies.find(e => e.uid === 'enemy-0').sprite.setPosition(p.x, p.y), p); await frames(3); };
          const a = await grab(clip), repeat = await diff(a, await grab(clip));
          await move(to); const moved = await diff(a, await grab(clip));
          await move(fixture.at);
          await page.evaluate(() => window.__bincov.app.raid.roof.setAlpha(.5)); await frames(3);
          const c = await grab(clip); await move(to); const control = await diff(c, await grab(clip));
          await move(fixture.at); await page.evaluate(() => window.__bincov.app.raid.roof.setAlpha(1)); await frames(3);
          assert.equal(repeat.changed, 0, 'static repeat must be stable');
          assert.ok(control.changed > 50, `positive control: a half-alpha roof shows the move (${control.changed} px)`);
          assert.equal(moved.changed, 0, `moving a hidden enemy under the roof changed ${moved.changed} px (max delta ${moved.max})`);
          return { clip, from: fixture.at, to, repeat, moved, control };
        });
        await check('P07 critical-text-follows-the-drawn-roof', async row => {
          const result = await page.evaluate(() => {
            const r = window.__bincov.app.raid, base = r.snapshotExpansion();
            const texts = () => r.children.list.filter(c => c.type === 'Text' && c.text === '爆头');
            // Restore a staged state, then run the roof pass that ends every update step.
            const put = (state, player) => { const s = structuredClone(state); if (player) s.raid.player = { ...s.raid.player, ...player }; r.restoreExpansion(s); r.drawRoofs(); };
            const reset = () => { texts().forEach(t => t.destroy()); put(base); };
            const crit = ({ player, enemy, keep = false }) => {
              for (let seed = 1; seed < 2000; seed++) {
                const s = structuredClone(base), raid = s.raid, layer = raid.maps[raid.currentMap], e = layer.enemies.find(e => e.uid === 'enemy-0');
                if (enemy) Object.assign(e, enemy);
                // Spread candidate stream states: consecutive small states give nearly equal first draws.
                e.hp = 999; raid.rng = Math.imul(seed, 0x9e3779b1) >>> 0;
                layer.bullets = [{ uid: 'probe-critical', x: e.x - 40, y: e.y, rotation: 0, vx: 760, vy: 0, left: 200, damage: 10, enemy: false }];
                put(s, player); r.updateBullets(.1);
                // A critical hit deals 1.5x: 999 - 15 = 984 (an ordinary hit leaves 989).
                if (r.enemies.find(e => e.uid === 'enemy-0').hp === 984) {
                  const shown = texts(), out = { seed, count: shown.length, visible: shown.filter(t => t.visible).length };
                  if (!keep) shown.forEach(t => t.destroy());
                  return out;
                }
              }
              return { seed: null, count: null };
            };
            const storage = { x: 310, y: 64 }, west = { x: 80, y: 150 }, out = {};
            out.hidden = crit({}); reset();
            out.visible = crit({ player: west }); reset();
            // Same 16px roof cell: roofs drawn at (209,43) keep the storage room covered while the player stands
            // at (223,43), where a fresh roof computation would uncover it.
            put(base, { x: 209, y: 43 });
            const drawn = { signature: r.roofSignature, storageCovered: r.drawnRoofs ? r.drawnRoofs.some(x => x.name === '储藏室') : null };
            out.sameCell = { drawn, ...crit({ player: { x: 223, y: 43 }, enemy: storage }), signatureAtHit: r.roofSignature }; reset();
            // A text shown for a visible enemy hides when the roof closes over that spot before the text expires.
            out.closing = crit({ player: { x: 223, y: 43 }, enemy: storage, keep: true });
            put(r.snapshotExpansion(), west); out.closing.visibleAfterCover = texts().filter(t => t.visible).length; reset();
            // A same-map layer mutation (a door elsewhere opening, as when a hidden enemy opens one) redraws the environment.
            // A visible text survives it for its 500 ms, and a later redraw still hides it once the roof covers its enemy.
            // The paused scene's clock is stepped by hand so the 500 ms timer runs deterministically.
            const door = 'resident-f2-east', was = r.space.doors[door], step = ms => { r.time.preUpdate(); r.time.update(r.time.now + ms, ms); };
            const toggle = open => r.layerMutation(state => { state.raid.maps[state.raid.currentMap].doors[door] = open; });
            // The mutation is validated like a save: the player stands on plain floor in the west room (west is on a
            // low-furniture cell), and the probe's 999 hp is put back to the enemy's real hp before the first mutation.
            out.mutation = crit({ player: { x: 48, y: 176 }, keep: true });
            r.enemies.find(e => e.uid === 'enemy-0').hp = base.raid.maps[base.raid.currentMap].enemies.find(e => e.uid === 'enemy-0').hp;
            const text = texts()[0], seen = () => ({ same: !!text && texts()[0] === text, count: texts().length, visible: texts().filter(t => t.visible).length, door: r.space.doors[door] });
            out.mutation.opened = toggle(!was); out.mutation.afterMutation = seen();
            step(450); out.mutation.at450 = seen();
            // From the landing the west room is roofed; the next same-map mutation redraws the roofs there.
            r.player.setPosition(304, 80);
            out.mutation.closed = toggle(was); out.mutation.afterCover = seen();
            step(100); out.mutation.afterExpiry = texts().length; reset();
            out.player = { x: r.player.x, y: r.player.y };
            return out;
          });
          row.detail = result;
          assert.ok(['hidden', 'visible', 'sameCell', 'closing', 'mutation'].every(k => result[k].seed), 'a critical hit was produced in every case');
          assert.equal(result.hidden.count, 0, 'critical text must not reveal an enemy in a covered room');
          assert.equal(result.visible.count, 1, 'critical text still shows for a visible enemy');
          assert.equal(result.sameCell.drawn.signature, result.sameCell.signatureAtHit, 'the hit happens in the same roof cell');
          assert.notEqual(result.sameCell.drawn.storageCovered, false, 'the storage room is drawn covered');
          assert.equal(result.sameCell.count, 0, 'critical text follows the roof on screen, not a fresh computation from the exact position');
          assert.deepEqual([result.closing.count, result.closing.visible], [1, 1], 'critical text shows while the storage room is uncovered');
          assert.equal(result.closing.visibleAfterCover, 0, 'critical text hides once the roof covers its enemy position');
          const m = result.mutation;
          assert.deepEqual([m.count, m.visible], [1, 1], 'critical text shows for the visible enemy in the west room');
          assert.deepEqual([m.opened, m.closed, m.afterMutation.door !== m.afterCover.door], [true, true, true], 'both same-map door mutations committed');
          assert.deepEqual([m.afterMutation.same, m.afterMutation.count, m.afterMutation.visible], [true, 1, 1], 'a visible critical text survives a same-map layer mutation');
          assert.deepEqual([m.at450.same, m.at450.count, m.at450.visible], [true, 1, 1], 'it stays for its 500 ms');
          assert.deepEqual([m.afterCover.same, m.afterCover.count, m.afterCover.visible], [true, 1, 0], 'a same-map redraw still hides it once the roof covers its enemy');
          assert.equal(m.afterExpiry, 0, 'it expires on its own 500 ms timer');
          assert.deepEqual(result.player, { x: 304, y: 80 });
          return result;
        });
        await check('P09 stair-label-under-an-enemy-on-uncovered-floor-and-readable-over-the-roof', async row => {
          // Player in the upper hallway with the storage room roofed: the landing label crosses the roof's west edge
          // (x=256). A live enemy on the uncovered strip at (240,80) must draw over the label, and the label part over
          // the roof must stay readable above the roof. Same four shots as P08, toggling every drawn copy of the label.
          const name = '下楼 · 一楼';
          const stage = async (enemy, label) => {
            const info = await page.evaluate(([enemy, label, name]) => {
              const r = window.__bincov.app.raid, base = window.__stairBase ??= r.snapshotExpansion(), s = structuredClone(base), raid = s.raid;
              const e = raid.maps[raid.currentMap].enemies.find(e => e.uid === 'enemy-0');
              if (!e || e.hp <= 0) throw new Error('enemy-0 is not alive');
              raid.player = { ...raid.player, x: 200, y: 64 };
              if (enemy) Object.assign(e, { x: 240, y: 80, rotation: 0 });
              // Run the end-of-step roof pass for the staged position, then hide the drawn label copies when asked.
              r.restoreExpansion(s); r.roofSignature = ''; r.drawRoofs();
              const texts = r.children.list.filter(t => t.type === 'Text' && t.text === name && t.visible);
              texts.forEach(t => t.setVisible(label));
              return { map: r.space.definition.id, player: { x: r.player.x, y: r.player.y }, roofs: r.drawnRoofs ? r.drawnRoofs.map(x => x.name) : null,
                labels: texts.map(t => ({ depth: t.depth, masked: !!t.mask, x: t.x - t.displayOriginX, y: t.y - t.displayOriginY, w: t.displayWidth, h: t.displayHeight })) };
            }, [enemy, label, name]);
            await frames(3); return info;
          };
          try {
            // Main clip: the label and the enemy; roof clip: inside both the label and the storage roof.
            const clip = await clipOf(218, 60, 80, 40), roofClip = await clipOf(258, 74, 24, 12), shots = {}, roof = {};
            for (const [key, enemy, label] of [['a', true, true], ['b', false, true], ['c', true, false], ['d', false, false]]) {
              const info = await stage(enemy, label); shots[key] = await grab(clip); roof[key] = await grab(roofClip); shots.info ??= info;
              if (key === 'a') await page.screenshot({ path: resolve(out, `p09-stair-label-under-enemy-${size.join('x')}-crop.png`), clip });
            }
            const result = await occlusion(shots), above = await diff(roof.b, roof.d), label = shots.info.labels[0];
            // Kept on failure too, for the negative-control reports.
            row.detail = { clip, roofClip, ...result, above, info: shots.info };
            assert.equal(shots.info.map, 'resident-f2'); assert.deepEqual(shots.info.player, { x: 200, y: 64 });
            if (shots.info.roofs) assert.ok(shots.info.roofs.includes('储藏室'), `the storage room is roofed (${shots.info.roofs})`);
            assert.ok(label && label.x < 240 && label.x + label.w > 256 && label.y < 80 && label.y + label.h > 80, `the label crosses the roof edge over the enemy ${JSON.stringify(label)}`);
            assert.ok(result.body > 100, `positive control: the enemy is in the clip (${result.body} px)`);
            assert.ok(result.guide > 50, `positive control: the label is drawn in the clip (${result.guide} px)`);
            assert.ok(result.overlap > scaled(OVERLAP_MIN), `positive control: the enemy sits on the label (${result.overlap} px, need > ${scaled(OVERLAP_MIN)})`);
            assert.ok(above.changed > roofClip.width * roofClip.height / 2, `the label part over the roof is drawn above the roof (${above.changed}/${roofClip.width * roofClip.height} px)`);
            assert.equal(result.covered, 0, `the stair label is drawn over ${result.covered} enemy pixels on uncovered floor`);
            return row.detail;
          } finally {
            await page.evaluate(() => {
              const r = window.__bincov.app.raid; if (window.__stairBase) r.restoreExpansion(window.__stairBase); delete window.__stairBase;
              r.roofSignature = ''; r.drawRoofs();
            }).catch(() => {});
            await frames(3);
          }
        });
      } finally { await page.evaluate(() => { const r = window.__bincov.app.raid; r.releaseInput(); r.scene.resume(); }).catch(() => {}); }
    } finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
const failed = report.checks.filter(c => c.status !== 'passed');
console.log(`${report.checks.length - failed.length}/${report.checks.length} checks passed`);
