import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture, type Sprite } from 'pixi.js';
import { Lighting, REVEAL_FADE, type Light } from '../src/coast-view/lighting';
import type { Textures } from '../src/coast-view/textures';

/** A Lighting with no map (ambient = the mood's outdoor colour, kept dark so `at` never saturates) and the given lights. */
const rig = (...lights: Light[]) => {
  const L = new Lighting({ ensure: () => Texture.EMPTY } as unknown as Textures);
  L.mood = { ...L.mood, outdoor: 0x101010 }; L.lights = lights;
  const pool = (L as unknown as { pool: Sprite[] }).pool;
  return { L, shown: () => pool.filter(s => s.visible), sprite: (l: Light) => pool.find(s => s.visible && s.x === Math.round(l.x) && s.y === Math.round(l.y)) };
};
/** The scene's predicate (scene.ts, present): no room, or the room and every overlapping room revealed. */
const gate = (rv: Record<string, boolean>) => (l: Light) => (l.region === undefined || l.region === null || rv[l.region] === true) && !l.regions?.some(r => rv[r] !== true);
const lampIn = (region: string | null, x = 100, y = 100): Light => ({ x, y, r: 110, color: 0xc3a26a, k: .55, region });
const AMBIENT = 0x101010, HIDDEN = { A: false }, SHOWN = { A: true }, FRAME = 1 / 60;

test('房间灯光：新建的灯按当前揭示状态直接到位，已揭示的房间第一帧就是满亮', () => {
  const lamp = lampIn('A'), { L, sprite } = rig(lamp);
  L.sync(FRAME, gate(SHOWN));
  assert.equal(lamp.lit, 1); assert.equal(sprite(lamp)?.alpha, .55);
  const dark = lampIn('A', 300), r2 = rig(dark);
  r2.L.sync(FRAME, gate(HIDDEN));
  assert.equal(dark.lit, 0, 'a fresh light in a hidden room starts dark'); assert.equal(r2.shown().length, 0);
});

test('房间灯光：揭示后 0.3 秒线性亮起，每帧 dt/0.3，满亮后不再变', () => {
  assert.equal(REVEAL_FADE, .3);
  const lamp = lampIn('A'), { L, shown, sprite } = rig(lamp);
  L.sync(FRAME, gate(HIDDEN));
  assert.equal(lamp.lit, 0); assert.equal(shown().length, 0, 'no sprite while the room is hidden');
  L.sync(FRAME, gate(SHOWN));
  assert.ok(Math.abs(lamp.lit! - 1 / 18) < 1e-12, `first frame ${lamp.lit}`);
  assert.ok(Math.abs(sprite(lamp)!.alpha - .55 / 18) < 1e-12, `first-frame alpha ${sprite(lamp)!.alpha}`);
  const mid = L.at({ x: 100, y: 100 }, null, SHOWN);
  assert.ok(mid > AMBIENT, 'the upright tint rises with the floor light');
  let prev = lamp.lit!;
  for (let n = 2; n <= 18; n++) { L.sync(FRAME, gate(SHOWN)); assert.ok(lamp.lit! > prev, `frame ${n} rises`); prev = lamp.lit!; }
  assert.equal(lamp.lit, 1, '18 frames of 1/60 s make 0.3 s'); assert.equal(sprite(lamp)!.alpha, .55);
  const full = L.at({ x: 100, y: 100 }, null, SHOWN);
  assert.ok(full > mid, 'the tint ends brighter than mid-ramp');
  L.sync(FRAME, gate(SHOWN)); assert.equal(lamp.lit, 1); assert.equal(L.at({ x: 100, y: 100 }, null, SHOWN), full, 'at rest the light holds');
  // A long frame (Pixi caps a hitch at 100 ms) advances the ramp by a third.
  const slow = lampIn('A', 400), r2 = rig(slow);
  r2.L.sync(FRAME, gate(HIDDEN));
  for (const want of [1 / 3, 2 / 3]) { r2.L.sync(.1, gate(SHOWN)); assert.ok(Math.abs(slow.lit! - want) < 1e-12, `${slow.lit} vs ${want}`); }
  r2.L.sync(.1, gate(SHOWN)); assert.equal(slow.lit, 1); assert.equal(r2.sprite(slow)!.alpha, .55);
});

test('房间灯光：房间一隐藏就在同一帧熄灭，dt 为 0 也一样；at() 回到只有环境光', () => {
  const lamp = lampIn('A'), { L, shown } = rig(lamp);
  L.sync(FRAME, gate(SHOWN)); assert.equal(lamp.lit, 1);
  assert.notEqual(L.at({ x: 100, y: 100 }, null, SHOWN), AMBIENT);
  L.sync(0, gate(HIDDEN));
  assert.equal(lamp.lit, 0); assert.equal(shown().length, 0, 'no sprite in the frame the room is hidden');
  assert.equal(L.at({ x: 100, y: 100 }, null, HIDDEN), AMBIENT);
  // A room missing from `revealed`: sync hides the lamp, and at() agrees instead of lighting the uprights.
  const other = lampIn('B', 100, 100), r2 = rig(other);
  r2.L.sync(FRAME, gate({}));
  assert.equal(r2.shown().length, 0); assert.equal(r2.L.at({ x: 100, y: 100 }, null, {}), AMBIENT);
});

test('房间灯光：渐亮途中 dt 为 0 的重绘完全相同；dt 为 0 时揭示不会让灯亮起', () => {
  const lamp = lampIn('A'), { L, shown, sprite } = rig(lamp);
  L.sync(FRAME, gate(HIDDEN));
  L.sync(0, gate(SHOWN));
  assert.equal(lamp.lit, 0, 'a reveal during a dt-0 present leaves the light where it was'); assert.equal(shown().length, 0);
  for (let n = 0; n < 7; n++) L.sync(FRAME, gate(SHOWN));
  const a = sprite(lamp)!.alpha, tint = L.at({ x: 100, y: 100 }, null, SHOWN);
  L.sync(0, gate(SHOWN)); const b = sprite(lamp)!.alpha;
  L.sync(0, gate(SHOWN)); const c = sprite(lamp)!.alpha;
  assert.ok(a > 0 && a < .55, `mid-ramp ${a}`); assert.equal(b, a); assert.equal(c, a);
  assert.equal(L.at({ x: 100, y: 100 }, null, SHOWN), tint);
});

test('房间灯光：枪口火光、火花不做渐亮；不属于任何房间的灯始终满亮', () => {
  const flash: Light = { x: 10, y: 10, r: 80, color: 0xe0b878, k: .9, ttl: .07, region: 'A' };
  const street = lampIn(null, 500, 500), open: Light = { ...lampIn('A', 700, 700), region: null, regions: [] }, { L, sprite } = rig(street, open);
  L.sync(FRAME, gate(HIDDEN));
  assert.equal(street.lit, 1); assert.equal(open.lit, 1); assert.equal(sprite(street)?.alpha, .55); assert.equal(sprite(open)?.alpha, .55);
  // A flash in a hidden room never shows.
  L.lights.push({ ...flash }); L.sync(FRAME, gate(HIDDEN));
  assert.equal(sprite(flash), undefined);
  // In a revealed room a flash shows at its own ttl fade with no ramp on top: a fresh one, and one that was hidden a frame ago.
  const lit: Light = { ...flash, x: 40 }; L.lights.push(lit); L.sync(FRAME, gate(SHOWN));
  assert.equal(lit.lit, 1); assert.ok(Math.abs(sprite(lit)!.alpha - .9 * (1 - FRAME / .07)) < 1e-12, `flash alpha ${sprite(lit)!.alpha}`);
  const was = L.lights.find(l => l.ttl !== undefined && l.x === 10)!;
  assert.equal(was.lit, 1); assert.ok(Math.abs(sprite(was)!.alpha - .9 * (1 - 2 * FRAME / .07)) < 1e-12, `revealed flash alpha ${sprite(was)!.alpha}`);
  assert.equal(sprite(street)?.alpha, .55);
});

test('房间灯光：重叠房间的灯要等每个房间都揭示后才开始亮起', () => {
  const lamp: Light = { ...lampIn('A'), regions: ['A', 'B'] }, { L, shown } = rig(lamp);
  L.sync(FRAME, gate({ A: true, B: true })); assert.equal(lamp.lit, 1);
  for (let n = 0; n < 5; n++) { L.sync(FRAME, gate({ A: true, B: false })); assert.equal(lamp.lit, 0); assert.equal(shown().length, 0); }
  assert.equal(L.at({ x: 100, y: 100 }, null, { A: true, B: false }), AMBIENT);
  L.sync(FRAME, gate({ A: true, B: true }));
  assert.ok(Math.abs(lamp.lit! - 1 / 18) < 1e-12, `ramps once both are revealed: ${lamp.lit}`);
  assert.equal(shown().length, 1);
});
