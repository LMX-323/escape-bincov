import assert from 'node:assert/strict';
import test from 'node:test';
import { DOORWAYS, H, PROPS, ROOMS, STATIONS, T, W, roomAt } from '../src/station-view/layout';
import { Collision } from '../src/station-view/nav';

// Every prop visible at once: the most obstacles any save can show, so a way that is open here is open in every state.
const col = new Collision();
col.rebuild(() => true, false);
const STEP = 2, GW = Math.floor(W * T / STEP), GH = Math.floor(H * T / STEP);

/** Foot points a walker can reach from `start` (world px), on a 2 px grid, with the yard's own collision rules. */
function reach(start: { x: number; y: number }) {
  const seen = new Uint8Array(GW * GH), stack: number[] = [];
  const visit = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= GW || j >= GH) return;
    const k = j * GW + i;
    if (seen[k] || col.blocked(i * STEP, j * STEP)) return;
    seen[k] = 1; stack.push(k);
  };
  visit(Math.round(start.x / STEP), Math.round(start.y / STEP));
  while (stack.length) { const k = stack.pop()!, i = k % GW, j = (k / GW) | 0; visit(i + 1, j); visit(i - 1, j); visit(i, j + 1); visit(i, j - 1); }
  return seen;
}
const yard = reach({ x: 13.5 * T, y: 9.5 * T });
const reached = (x: number, y: number) => !!yard[Math.round(y / STEP) * GW + Math.round(x / STEP)];

test('every room of the station can be walked into from the yard, with every prop standing', () => {
  for (const r of ROOMS) {
    let inside = false;
    for (let y = r.y + 1; y < r.y + r.h - 1 && !inside; y++) for (let x = r.x + 1; x < r.x + r.w - 1 && !inside; x++) {
      if (roomAt[y][x] !== r.id) continue;
      for (let py = y * T; py < y * T + T && !inside; py += STEP) for (let px = x * T; px < x * T + T && !inside; px += STEP) inside = reached(px, py);
    }
    assert.ok(inside, `${r.name} (${r.id}) cannot be reached on foot`);
  }
});

test('every doorway can be walked through: both of its sides are reached', () => {
  for (const d of DOORWAYS) {
    const sides = d.side ? [[d.x - 1, d.y], [d.x + 1, d.y]] : [[d.x, d.y - 1], [d.x, d.y + 1]];
    for (const [x, y] of sides) {
      let any = false;
      for (let py = y * T; py < y * T + T && !any; py += STEP) for (let px = x * T; px < x * T + T && !any; px += STEP) any = reached(px, py);
      assert.ok(any, `doorway ${d.name.a} → ${d.name.b} at (${d.x},${d.y}): its side (${x},${y}) cannot be reached`);
    }
  }
});

test('every station can be used: a reachable foot point lies within its radius of the stand point', () => {
  for (const s of STATIONS) {
    let ok = false;
    const r = s.radius - 4;
    for (let py = s.stand.y - r; py <= s.stand.y + r && !ok; py += STEP) for (let px = s.stand.x - r; px <= s.stand.x + r && !ok; px += STEP)
      ok = Math.hypot(px - s.stand.x, py - s.stand.y) <= r && reached(px, py);
    assert.ok(ok, `${s.name} (${s.id}) cannot be reached on foot`);
  }
});

test('the canteen side of the dorm door is clear of props (the prep counter used to stand in it)', () => {
  const door = DOORWAYS.find(d => d.b === 'dorm' || d.a === 'dorm')!;
  const inside = [door.x - 1, door.y];
  const blocking = PROPS.filter(p => p.blocks !== false && inside[0] >= p.tx && inside[0] < p.tx + p.tw && inside[1] >= p.ty && inside[1] < p.ty + p.th);
  assert.deepEqual(blocking.map(p => p.id), []);
});
