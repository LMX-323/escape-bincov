import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR, Frame, H, Palette, W, bayer, flashLift, hash, mapped, rain, shade, type Indexed } from '../src/opening/pixel';

const palette = () => {
  const p = new Palette();
  for (const [r, g, b] of [[0, 0, 0], [30, 40, 50], [80, 90, 100], [140, 150, 160], [220, 225, 230], [120, 90, 60], [200, 160, 110]]) p.index(r, g, b);
  return p;
};
const layer = (w: number, h: number, fill: number): Indexed => ({ w, h, px: new Uint8Array(w * h).fill(fill) });

test('the palette keeps first-seen order, deduplicates and refuses a 256th colour', () => {
  const p = new Palette();
  assert.equal(p.index(1, 2, 3), 0);
  assert.equal(p.index(4, 5, 6), 1);
  assert.equal(p.index(1, 2, 3), 0);
  assert.equal(p.rgba[1], ((255 << 24) | (6 << 16) | (5 << 8) | 4) >>> 0);
  for (let i = 2; i < 255; i++) p.index(i, 0, 0);
  assert.throws(() => p.index(255, 255, 255), /255 colours/);
});

test('darkening never lightens and lightning never darkens; transparency survives every table', () => {
  const p = palette(), dark = p.lut(shade(0.5)), lift = p.lut(flashLift(0.2));
  for (let i = 0; i < p.size; i++) {
    assert.ok(p.lab[dark[i]][0] <= p.lab[i][0] + 1e-9, `dark ${i}`);
    assert.ok(p.lab[lift[i]][0] >= p.lab[i][0] - 1e-9, `lift ${i}`);
  }
  assert.equal(dark[CLEAR], CLEAR);
  assert.equal(mapped({ w: 2, h: 1, px: Uint8Array.from([CLEAR, 3]) }, dark).px[0], CLEAR);
});

test('ordered dithering: thresholds cover (0, 1) once per 4x4 cell, so a level of one half lights exactly half', () => {
  const values = new Set<number>();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) values.add(bayer(x, y));
  assert.equal(values.size, 16);
  assert.ok([...values].every(v => v > 0 && v < 1));
  const f = new Frame();
  f.light.fill(0.5);
  f.blitLit([layer(4, 4, 1), layer(4, 4, 2)], 0, 0);
  let lit = 0; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) lit += f.px[y * W + x] === 2 ? 1 : 0;
  assert.equal(lit, 8);
  f.light.fill(0); f.blitLit([layer(4, 4, 1), layer(4, 4, 2)], 0, 0); assert.equal(f.px[0], 1);
  f.light.fill(1); f.blitLit([layer(4, 4, 1), layer(4, 4, 2)], 0, 0); assert.equal(f.px[0], 2);
});

test('layers clip at every edge and keep transparent pixels out', () => {
  const f = new Frame();
  f.fill(7);
  const src: Indexed = { w: 3, h: 3, px: Uint8Array.from([1, CLEAR, 1, 1, 1, 1, 1, 1, 1]) };
  f.blit(src, -1, -1);
  assert.equal(f.px[0], 1);
  f.fill(7); f.blit(src, W - 2, H - 2);
  assert.equal(f.px[(H - 2) * W + W - 2], 1);
  assert.equal(f.px[(H - 2) * W + W - 1], 7, 'transparent pixel left the frame alone');
  f.fill(7); f.copy(layer(800, 400, 3), -100, -20);
  assert.equal(f.px[0], 3); assert.equal(f.px[W * H - 1], 3);
  assert.doesNotThrow(() => { f.blit(src, 5000, 5000); f.blit(src, -5000, -5000); f.line(-10, -10, W + 10, H + 10, 4); });
});

test('palette fades step per pixel: nothing at 0, everything at 1', () => {
  const p = palette(), dark = p.lut(shade(0.3)), f = new Frame();
  f.fill(4);
  f.mapDithered(null, dark, 0);
  assert.ok(f.px.every(v => v === 4));
  f.mapDithered(null, dark, 1);
  assert.ok(f.px.every(v => v === dark[4]));
});

test('rain is a function of time: the same moment draws the same drops; reduced motion freezes it', () => {
  const style = { far: 50, near: 20, farColour: 1, nearColour: 2, wind: 16, seed: 3 };
  const draw = (t: number, calm: boolean) => { const f = new Frame(); rain(f, t, style, calm); return f.px; };
  assert.deepEqual(draw(1234, false), draw(1234, false));
  assert.notDeepEqual(draw(1234, false), draw(1300, false));
  assert.deepEqual(draw(1234, true), draw(9999, true));
  assert.ok(hash(1, 2) >= 0 && hash(1, 2) < 1);
});
