import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirOf, gait, walkFrame, type GaitSense } from '../src/gait';

// Issue #26 F08: body direction and walk-cycle sense when aim and movement differ.
const deg = Math.PI / 180;
const AIMS = [0, 45, 90, 135, 180, -135, -90, -45].map(a => a * deg);
const move = (aim: number, off: number, prev: GaitSense = 1) => gait(aim, Math.cos(aim + off * deg) * 112, Math.sin(aim + off * deg) * 112, true, prev);
const sectorDistance = (a: number, b: number) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

test('a still actor faces its aim with a forward cycle, exactly as before', () => {
  for (const aim of AIMS) for (const prev of [1, -1] as const) assert.deepEqual(gait(aim, 0, 0, false, prev), { dir: dirOf(aim), sense: 1 });
  // Velocity alone does not count as moving: the caller decides (speed > 5 in the view).
  assert.deepEqual(gait(0, -112, 0, false, 1), { dir: 0, sense: 1 });
});

test('walking forward keeps the aim direction and the forward cycle', () => {
  assert.deepEqual(gait(0, 112, 0, true, 1), { dir: 0, sense: 1 });
  for (const aim of AIMS) assert.deepEqual(move(aim, 0), { dir: dirOf(aim), sense: 1 });
});

test('backpedalling keeps the body on the aim and reverses the cycle, for every aim', () => {
  assert.deepEqual(gait(0, -112, 0, true, 1), { dir: 0, sense: -1 });
  for (const aim of AIMS) for (const prev of [1, -1] as const) assert.deepEqual(move(aim, 180, prev), { dir: dirOf(aim), sense: -1 });
});

test('strafing turns the body 45 degrees toward the movement axis with a forward cycle', () => {
  const N = Math.PI / 2;
  assert.deepEqual(gait(0, 0, 112, true, 1), { dir: 1, sense: 1 }, 'aim E, move S: SE');
  assert.deepEqual(gait(0, 0, -112, true, 1), { dir: 7, sense: 1 }, 'aim E, move N: NE');
  assert.deepEqual(gait(-N, 112, 0, true, 1), { dir: 7, sense: 1 }, 'aim N, move E: NE');
  assert.deepEqual(gait(N, -112, 0, true, 1), { dir: 3, sense: 1 }, 'aim S, move W: SW');
});

test('the body never leaves the aim\'s neighbouring sector (5-degree grid, both senses)', () => {
  let checked = 0;
  for (let a = -180; a < 180; a += 5) for (let m = -180; m < 180; m += 5) for (const prev of [1, -1] as const) {
    const aim = a * deg, g = gait(aim, Math.cos(m * deg), Math.sin(m * deg), true, prev);
    assert.ok(sectorDistance(g.dir, dirOf(aim)) <= 1, `aim ${a}, move ${m}, prev ${prev}: dir ${g.dir}`);
    checked++;
  }
  assert.equal(checked, 72 * 72 * 2);
});

test('the cycle direction has 15 degrees of hysteresis on either side of a pure strafe', () => {
  assert.equal(move(0, 95, 1).sense, 1); assert.equal(move(0, 110, 1).sense, -1);
  assert.equal(move(0, -95, 1).sense, 1); assert.equal(move(0, -110, 1).sense, -1);
  assert.equal(move(0, 80, -1).sense, -1); assert.equal(move(0, 70, -1).sense, 1);
  assert.equal(move(0, -80, -1).sense, -1); assert.equal(move(0, -70, -1).sense, 1);
  // Aim jittering +-6 degrees around a pure strafe (aim E, moving S), sense carried frame to frame like the view does.
  let prev: GaitSense = 1, last: number | null = null, changes = 0, flips = 0;
  for (let i = 0; i < 200; i++) {
    const aim = Math.sin(i * 1.7) * 6 * deg, g = gait(aim, 0, 112, true, prev);
    if (last !== null && g.dir !== last) changes++;
    if (g.sense !== prev) flips++;
    prev = g.sense; last = g.dir;
  }
  assert.equal(changes, 0, 'body direction changes'); assert.equal(flips, 0, 'cycle flips');
  // Control: the same jitter judged at a plain 90-degree threshold flips the cycle (and the body) many times.
  let plain = 0, lastPlain: boolean | null = null;
  for (let i = 0; i < 200; i++) {
    const aim = Math.sin(i * 1.7) * 6 * deg, back = Math.abs(Math.atan2(Math.sin(Math.PI / 2 - aim), Math.cos(Math.PI / 2 - aim))) > Math.PI / 2;
    if (lastPlain !== null && back !== lastPlain) plain++;
    lastPlain = back;
  }
  assert.ok(plain > 50, `plain threshold flips ${plain}`);
});

test('walkFrame: forward plays 1-4, reversed plays the short back steps 3, 0, 1, 0', () => {
  assert.deepEqual([0, 1, 2, 3].map(w => walkFrame(w + .5, 1)), [1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3].map(w => walkFrame(w + .5, -1)), [3, 0, 1, 0]);
  // Same frames as the old rule (1 + floor) for the forward cycle over the whole phase range.
  for (let w = 0; w < 4; w += .05) assert.equal(walkFrame(w, 1), 1 + Math.floor(w));
});
