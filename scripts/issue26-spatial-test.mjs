// Real offline build and Runtime; ?test=1 only positions actors and freezes AI. Run this unchanged against
// --html=<baseline/index.html> for the old-build negative control. No screenshots or assertions are mocked.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/issue26-spatial'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), checks: [], errors: [] };
let context, page, size;
const frames = (n = 3) => page.evaluate(n => new Promise(resolve => { let count = 0; const tick = () => ++count >= n ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), n);
const place = (x, y, map = 'coast') => page.evaluate(([x, y, map]) => window.__bincovSample.driver.placePlayer({ x, y }, -Math.PI / 2, map), [x, y, map]);
const settle = async () => { await page.waitForTimeout(300); await frames(4); };
async function check(name, task) {
  const row = { name: `${size.join('x')} ${name}` }; report.checks.push(row);
  try { row.detail = await task(); assert.deepEqual(report.errors, []); row.status = 'passed'; }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; }
  await page.screenshot({ path: resolve(out, `${size.join('x')}-${name.split(' ')[0]}.png`) }).catch(() => {});
  console.log(row.status, row.name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
const guides = () => page.evaluate(() => {
  const h = window.__bincovSample.host, v = h.view, b = h.lastBatch;
  return { map: b.map.key.mapId, floor: b.map.floor, revealed: b.frame.revealed,
    doors: b.map.doors.map(d => ({ id: d.id, wall: d.wall, open: !!b.frame.doors[d.id], visible: !!v.doorGuides?.get(d.id)?.visible,
      x: v.doorGuides?.get(d.id)?.x, y: v.doorGuides?.get(d.id)?.y })),
    labels: b.map.entries.map(e => ({ label: e.label, visible: !!v.stairLabels?.get(e.id)?.visible })),
    structures: v.occluders.map(o => ({ kind: o.kind, x: o.rect.x, y: o.z - 16, region: o.region, level: o.level, target: o.target, visible: o.sprite.visible })) };
});

try {
  for (size of [[1280, 720], [1920, 1080]]) {
    context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] } });
    context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://spatial.test/')) report.errors.push(`external request ${r.url()}`); });
    await context.route('https://spatial.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(String(e.stack)));
    await page.goto('https://spatial.test/?test=1&entry=tabs&sample=village&weather=clear');
    await page.locator('[data-action="enter"]').click();
    await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42');
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
    await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));

    await check('S01 exterior-door', async () => {
      await place(464, 448); await settle(); const result = await guides();
      assert.deepEqual(result.doors.filter(d => d.visible).map(d => d.id), ['resident-front']);
      assert.ok(result.labels.every(e => !e.visible));
      assert.ok(Object.values(result.revealed).every(v => !v));
      return result;
    });
    await check('S02 real-open-and-passage', async () => {
      await place(464, 432); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await settle();
      await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.doors['resident-front']);
      await page.keyboard.down('w');
      try { await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.player.y < 370); }
      finally { await page.keyboard.up('w'); }
      await settle(); const result = await guides(), door = result.doors.find(d => d.id === 'resident-front');
      assert.ok(door.open && door.visible); assert.deepEqual([door.x, door.y], [14 * 32, 12 * 32 - 48]);
      assert.ok(result.labels.every(e => e.visible));
      return { door, labels: result.labels, player: await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.player) };
    });
    await check('S03 complete-ground-floor', async () => {
      await place(464, 336); await settle(); const result = await guides();
      assert.equal(result.doors.filter(d => d.wall === 'ns' && d.visible).length, 2);
      assert.deepEqual(result.labels.filter(e => e.visible).map(e => e.label).sort(), ['上楼 · 二楼', '下楼 · 地下'].sort());
      const walls = result.structures.filter(o => ['wall', 'door'].includes(o.kind) && o.x >= 320 && o.x < 608 && o.y >= 224 && o.y < 416);
      assert.ok(walls.length > 10 && walls.every(o => o.target === 3 && o.level === 3));
      const roof = result.structures.find(o => o.kind === 'roof' && o.region?.endsWith('/resident-ground'));
      assert.ok(roof && roof.level === 4 && !roof.visible);
      return { doors: result.doors, labels: result.labels, walls, roof };
    });
    await check('S04 real-stairs-and-whole-current-floor', async () => {
      await place(560, 272); await settle(); await page.keyboard.press('e');
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'resident-f2'); await settle();
      const upstairs = await guides();
      // Continue through both actual transitions even when an old build is missing the new cues.
      await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'coast');
      await place(496, 272); await settle(); await page.keyboard.press('e');
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'resident-b1'); await settle();
      const basement = await guides();
      for (const floor of [upstairs, basement]) {
        assert.ok(floor.structures.filter(o => o.kind === 'ceiling').length >= 3);
        assert.ok(floor.structures.filter(o => o.kind === 'ceiling').every(o => o.level === 4 && !o.visible));
        assert.ok(floor.structures.filter(o => o.kind === 'wall').every(o => o.level === 3));
        assert.ok(floor.doors.every(d => d.visible)); assert.ok(floor.labels.every(e => e.visible));
        assert.ok(Object.values(floor.revealed).some(v => !v), 'structural cutaway must not reveal closed rooms');
      }
      return { upstairs, basement };
    });
    await check('S05 hidden-room-zero-pixels-with-positive-control', async () => {
      await place(176, 176, 'resident-f2'); await settle();
      const living = await page.evaluate(() => {
        const h = window.__bincovSample.host, a = h.lastBatch.frame.actors.find(a => a.uid === 'enemy-0');
        return { alive: a.alive, revealed: h.lastBatch.frame.revealed[a.regionId], shown: h.view.actorShown(a.uid) };
      });
      assert.equal(living.alive, true); assert.equal(living.revealed, false); assert.equal(living.shown, false);
      await page.evaluate(() => { const d = window.__bincovSample.driver; d.placeEnemy('enemy-0', { x: 80, y: 208 }); d.kill('enemy-0'); }); await settle();
      const result = await page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, before = JSON.stringify(b.frame.revealed);
        h.app.ticker.stop();
        try {
          v.time = 1; v.shake = 0; v.present({ ...b, events: [] }, 0);
          // Remove ceilings as a diagnostic on both builds: a pass must come from permissions, never an opaque roof.
          for (const o of v.occluders) if (o.kind === 'roof' || o.kind === 'ceiling') o.sprite.visible = false;
          const hidden = r => r !== null && b.frame.revealed[r] !== true, sprites = [];
          const counts = { actors: 0, loot: 0, containers: 0, decals: 0 };
          for (const a of b.frame.actors) if (hidden(a.regionId)) {
            const g = v.actors.get(a.uid); counts.actors++;
            for (const s of [g.body, g.weapon, g.flash, g.shadow, ...g.arms, g.rim, g.wrim, g.corpse, g.wade]) if (s) sprites.push(s);
          }
          for (const l of b.frame.loot) if (hidden(l.regionId)) { const s = v.loot.get(l.uid); if (s) { sprites.push(s); counts.loot++; } }
          for (const c of b.frame.containers) if (hidden(c.regionId)) { const g = v.crates.get(c.id); if (g) { sprites.push(g.s, g.shadow); counts.containers++; } }
          for (const d of v.fx.decals) if (hidden(d.region)) { sprites.push(d.s); counts.decals++; }
          const original = sprites.map(s => s.visible), capture = () => { v.render(); return h.app.renderer.extract.pixels({ target: v.worldRT }).pixels.slice(); };
          const normal = capture(); sprites.forEach(s => { s.visible = false; }); const stripped = capture();
          sprites.forEach(s => { s.visible = true; }); const leaked = capture();
          sprites.forEach((s, i) => { s.visible = original[i]; }); v.render(); h.app.render();
          const changed = other => { let n = 0; for (let i = 0; i < normal.length; i += 4) if (normal[i] !== other[i] || normal[i + 1] !== other[i + 1] || normal[i + 2] !== other[i + 2]) n++; return n; };
          return { counts, shownHiddenSprites: original.filter(Boolean).length, changed: changed(stripped), positiveChanged: changed(leaked),
            unchangedPermissions: before === JSON.stringify(b.frame.revealed), revealed: b.frame.revealed };
        } finally { h.app.ticker.start(); }
      });
      assert.ok(result.counts.actors >= 1 && result.counts.loot >= 1 && result.counts.decals >= 14);
      assert.equal(result.shownHiddenSprites, 0); assert.equal(result.changed, 0); assert.ok(result.positiveChanged > 10); assert.ok(result.unchangedPermissions);
      await place(80, 176, 'resident-f2'); await settle();
      assert.equal(await page.evaluate(() => window.__bincovSample.host.view.actorShown('enemy-0')), true, 'entering the room must reveal the same corpse');
      return { living, ...result };
    });
    await check('S06 exterior-restores-cover', async () => {
      await place(464, 448); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await settle();
      const result = await guides(), roof = result.structures.find(o => o.kind === 'roof' && o.region?.endsWith('/resident-ground'));
      assert.ok(roof && roof.level === 0 && roof.visible); assert.ok(Object.values(result.revealed).every(v => !v));
      assert.deepEqual(result.doors.filter(d => d.visible).map(d => d.id), ['resident-front']);
      assert.ok(result.labels.every(e => !e.visible)); return { roof, doors: result.doors };
    });
    await context.close(); context = null;
  }
} finally { await context?.close(); await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
