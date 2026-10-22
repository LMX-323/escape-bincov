import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_LEAD, CAMERA_HOLD, PRECISE_LEAD, aimLead, pointerLead, snapAxis, stepLead, type AxisHold } from '../src/coast-view/camera';

// Playtest F-04: while walking, the player trembled 1 world px on screen (round(p) - round(camF) flips with the two
// fractions). The replay below is the host loop after the fix: frame i starts at its vsync plus U(0..J ms) of
// frame-start jitter, the Runtime moves the player on the deltas of those starts (ActiveClock), and the camera smooths on
// the same deltas (host.ts `follow`, scene.ts camera(): k = 1 - exp(-8 dt)). `clock: 'vsync'` smooths on the rAF
// timestamps instead (the old host's ticker.deltaMS), and `motion: false` drops the motion rule, for the controls.
const rng = (seed: number) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Steady follow lag of the smoothed camera behind a player walking at v (one frame per vsync). */
const lagOf = (v: number, hz: number) => { const dt = 1 / hz, k = 1 - Math.exp(-8 * dt); return v * dt * (1 - k) / k; };
interface Row { t: number; p: number; camF: number; motion: number; at: number; held: number; raw: number }
function replay(o: { hz: number; v: number; target: number; seed: number; seconds: number; stopAt?: number; jitter?: number; clock?: 'runtime' | 'vsync';
  lo?: number; hi?: number; p0?: number; flick?: { at: number; by: number }; motion?: boolean }) {
  const r = rng(o.seed), P = 1000 / o.hz, J = o.jitter ?? 3, lo = o.lo ?? -1e9, hi = o.hi ?? 1e9;
  let p = o.p0 ?? 1000.3, target = o.target, camF = p + target, hold: AxisHold | undefined, prev = r() * J;
  const rows: Row[] = [];
  for (let i = 1; i <= o.seconds * o.hz; i++) {
    const t0 = i * P + r() * J, dt = Math.min(.1, Math.max(0, (t0 - prev) / 1000)); prev = t0;
    const t = i * P / 1000;
    if (t < (o.stopAt ?? Infinity)) p += o.v * dt;
    if (o.flick && t >= o.flick.at) { target += o.flick.by; o = { ...o, flick: undefined }; }
    const motion = (p + target - camF) * (1 - Math.exp(-(o.clock === 'vsync' ? P / 1000 : dt) * 8)); camF += motion;
    const s = snapAxis(camF, p, lo, hi, hold, o.motion === false ? 0 : motion); hold = { held: s.held, raw: s.raw };
    rows.push({ t, p, camF, motion, ...s });
  }
  return rows;
}
/** Changes of a whole-pixel series, and reversals (a change against the direction of the previous one). */
const changes = (xs: number[]) => {
  let n = 0, reversals = 0, last = 0;
  for (let i = 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; if (!d) continue; n++; if (last && Math.sign(d) !== Math.sign(last)) reversals++; last = d; }
  return { n, reversals };
};
const HZ = [60, 144], SPEEDS = [78.4, 112, 190]; // precise walk, walk, sprint (balance.ts)
/** Steady offsets with every fraction 0..0.99: the lead puts the offset at `f` after the steady lag. */
const steady = (f: number, v: number, hz: number) => -360 + f + lagOf(v, hz);

test('a steady walk keeps the player still on screen for every offset fraction (3 and 8 ms frame-start jitter)', () => {
  for (const jitter of [3, 8]) for (const hz of HZ) for (const v of SPEEDS) {
    let worst = 0, reversals = 0, oldRuns = 0, oldReversals = 0, runs = 0;
    for (let f = 0; f < 100; f++) for (let seed = 1; seed <= 10; seed++) {
      const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed, seconds: 6, jitter }).filter(r => r.t >= 1);
      const now = changes(rows.map(r => Math.round(r.p) - r.at)), old = changes(rows.map(r => Math.round(r.p) - Math.round(r.camF)));
      worst = Math.max(worst, now.n); reversals += now.reversals; runs++;
      if (old.reversals) oldRuns++; oldReversals += old.reversals;
    }
    const label = `${hz} Hz, ${v} px/s, ${jitter} ms`;
    assert.ok(worst <= 1, `${label}: the player moved ${worst} times on screen in 5 s`);
    assert.equal(reversals, 0, `${label}: on-screen reversals`);
    // Control: today's Math.round(camF) on the same replay trembles in nearly every run, at 10+ reversals a second.
    assert.ok(oldRuns >= runs * .95, `${label}: old formula reversed in only ${oldRuns}/${runs} runs`);
    assert.ok(oldReversals / runs / 5 >= 10, `${label}: old formula ${(oldReversals / runs / 5).toFixed(1)} reversals/s`);
  }
});

test('control: the same hold on the rAF clock (the old host) moves the player on screen, so the camera must follow the Runtime clock', () => {
  let worst = 0;
  for (let f = 0; f < 100; f++) for (let seed = 1; seed <= 10; seed++) {
    const rows = replay({ hz: 144, v: 190, target: steady(f / 100, 190, 144), seed, seconds: 6, clock: 'vsync' }).filter(r => r.t >= 1);
    worst = Math.max(worst, changes(rows.map(r => Math.round(r.p) - r.at)).n);
  }
  assert.ok(worst > 5, `sprint at 144 Hz on the vsync clock: worst ${worst} changes in 5 s`);
  // The browser check's `loaded` run (scripts/coast-sample-test.mjs V-CAM): a 60 Hz sprint whose frames start up to 12 ms
  // late, judged 0.7-1.5 s into the walk (more than 2 changes or any reversal fails). The rAF clock fails it for every
  // offset, the Runtime clock for none.
  for (const clock of ['vsync', 'runtime'] as const) {
    let failing = 0;
    for (let f = 0; f < 100; f++) {
      const xs = replay({ hz: 60, v: 190, target: steady(f / 100, 190, 60), seed: 26 + f, seconds: 1.5, jitter: 12, clock }).filter(r => r.t > .7).map(r => Math.round(r.p) - r.at);
      const c = changes(xs); if (c.n > 2 || c.reversals > 0) failing++;
    }
    assert.equal(failing, clock === 'vsync' ? 100 : 0, `${clock} clock, late frames: ${failing}/100 offsets fail`);
  }
});

test('trap: an offset taken from the rounded player is the old trembling camera again', () => {
  for (const hz of HZ) for (const v of SPEEDS) {
    const trembling: number[] = [];
    for (let f = 0; f < 100; f++) {
      const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed: f + 1, seconds: 3 });
      let hold: AxisHold | undefined; const trapped: number[] = [];
      for (const r of rows) {
        // Without the hold it is exactly Math.round(camF), every frame.
        assert.equal(snapAxis(r.camF, Math.round(r.p), -1e9, 1e9).at, Math.round(r.camF));
        const s = snapAxis(r.camF, Math.round(r.p), -1e9, 1e9, hold, r.motion); hold = s; trapped.push(Math.round(r.p) - s.at);
      }
      if (changes(trapped.slice(hz)).reversals > 0) trembling.push(f);
    }
    // With the hold the offset still swings +-0.5 px with the player's fraction: about half the offsets (those near .5)
    // keep reversing on screen, while the unrounded player gives none (first test).
    assert.ok(trembling.length >= 40 && trembling.includes(50), `${hz} Hz, ${v} px/s: ${trembling.length} trembling offsets`);
  }
});

test('the ground scrolls in the player\'s own steps and stays within 1 px of the old camera', () => {
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f += 3) for (const seed of [1, 2]) {
    // From a standstill through the walk and the stop: the held offset changes while the lag builds and decays.
    const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed, seconds: 4, stopAt: 2 });
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a.held === b.held) assert.equal(b.at - a.at, Math.round(b.p) - Math.round(a.p), `${hz} Hz, ${v} px/s, frame ${i}`);
      // The held offset changes only when the smoothed offset leaves the hold (by 2-3 px in the first frames of a walk:
      // the player starts at full speed, the camera eases in, as before), or when the camera waits (motion rule).
      else assert.ok(Math.abs(b.camF - b.p - a.held) > CAMERA_HOLD && b.held === Math.round(b.camF - b.p) || b.raw === a.raw, `${hz} Hz, ${v} px/s, frame ${i}`);
    }
    for (const r of rows) assert.ok(Math.abs(r.at - Math.round(r.camF)) <= 1, `at ${r.at}, old ${Math.round(r.camF)}`);
  }
});

test('a camera held at a fractional map edge stays put; crossed bounds give one whole-pixel midpoint', () => {
  // Walking west into the west edge (lo = 10.4, e.g. a HUD-top bound): one value, today's Math.round(10.4).
  const edge = replay({ hz: 60, v: -112, target: -384 - 24, seed: 3, seconds: 3, lo: 10.4, hi: 5000, p0: 300.3 });
  assert.deepEqual([...new Set(edge.map(r => r.at))], [10]);
  // Control: clamping the float first and then snapping the offset wobbles between 10 and 11 with the player's fraction.
  const floatFirst = new Set(edge.map(r => Math.round(r.p) + Math.round(Math.max(10.4, r.camF) - r.p)));
  assert.deepEqual([...floatFirst].sort(), [10, 11]);
  // A view wider than the map (lo > hi): the midpoint, as today.
  const crossed = replay({ hz: 60, v: 112, target: -360, seed: 4, seconds: 2, lo: 30.7, hi: 20.2 });
  assert.deepEqual([...new Set(crossed.map(r => r.at))], [Math.round((30.7 + 20.2) / 2)]);
});

test('after stopping the camera settles monotonically within 1.2 s', () => {
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f++) for (const seed of [1, 2, 3]) {
    // Target fractions sit .005 off the hold's edge: an offset exactly on it converges arbitrarily late (as with round(camF)).
    const rows = replay({ hz, v, target: -360 + (f + .5) / 100, seed, seconds: 4, stopAt: 2 });
    const i0 = rows.findIndex(r => r.t >= 2); let last = rows[i0].t;
    for (let i = i0 + 1; i < rows.length; i++) {
      const d = rows[i].at - rows[i - 1].at;
      assert.ok(d >= 0, `${hz} Hz, ${v} px/s, fraction ${f / 100}: the camera stepped back after the stop`);
      if (d) last = rows[i].t;
    }
    assert.ok(last - 2 <= 1.2, `${hz} Hz, ${v} px/s, fraction ${f / 100}: last step ${(last - 2).toFixed(3)} s after the stop`);
    assert.ok(Math.abs(rows.at(-1)!.camF - rows.at(-1)!.p - rows.at(-1)!.held) <= CAMERA_HOLD);
  }
});

test('a walk start, an aim flick against the walk and a stop never step the camera against the smoothed camera', () => {
  let against = 0, without = 0, runs = 0, runsWithout = 0;
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f += 2) for (const seed of [1, 2, 3]) {
    // From a standstill; at 1 s the aim flicks behind the walk (the lead moves 48 px back); the player stops at 2 s.
    const run = { hz, v, target: -360 + f / 100, seed, seconds: 3.5, stopAt: 2, flick: { at: 1, by: -48 } };
    const count = (rows: Row[]) => rows.slice(1).filter((b, i) => b.at !== rows[i].at && Math.sign(b.at - rows[i].at) === -Math.sign(b.motion)).length;
    const rows = replay(run), n = count(rows);
    against += n; runs++;
    // Waiting never takes it further from the smoothed camera than the hold plus the player's half pixel.
    for (const r of rows) assert.ok(Math.abs(r.at - r.camF) <= CAMERA_HOLD + .5 + 1e-9, `${hz} Hz, ${v} px/s: at ${r.at}, smoothed ${r.camF.toFixed(2)}`);
    // Control: without the motion rule the held offset shrinks in whole px while the player advances in whole px, and
    // the ground steps back (Math.round(camF) never did).
    const m = count(replay({ ...run, motion: false })); without += m; if (m) runsWithout++;
  }
  assert.equal(against, 0, 'camera steps against the smoothed motion');
  assert.ok(runsWithout >= runs / 2 && without > runs, `control: ${without} back steps in ${runsWithout}/${runs} runs without the rule`);
});

test('snapAxis holds the whole-pixel offset within CAMERA_HOLD, rounds a fresh one and waits rather than step back', () => {
  const at = (r: ReturnType<typeof snapAxis>) => [r.at, r.held, r.raw];
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9)), [101, 50, 101], 'offset 49.6 rounds to 50 on the drawn player 51');
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9, { held: 49, raw: 100 })), [100, 49, 100], '0.6 from the held 49: kept');
  assert.deepEqual(at(snapAxis(100.4, 50.6, -1e9, 1e9, { held: 49, raw: 100 })), [101, 50, 101], '0.8 from the held 49: rounded again');
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9, { held: Number.NaN, raw: 0 })), [101, 50, 101], 'a non-finite hold is ignored');
  assert.deepEqual(at(snapAxis(100.2, 50.6, 120.4, 300)), [120, 50, 101], 'clamped to the rounded bound');
  // The player stepped from 50 to 51 while the offset fell from 50 to 48.4 (held 48): 51 + 48 = 99 would step back from
  // 100 while the smoothed camera moved forward, so the camera waits at 100 and the offset becomes 49.
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 }, .2)), [100, 49, 100]);
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 }, -.2)), [99, 48, 99], 'with the smoothed camera moving back it may step back');
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 })), [99, 48, 99], 'no motion given: no rule');
});

test('aim look-ahead: half the old 48 x 34 by default; the right button keeps the old 1.7 x reach', () => {
  assert.deepEqual(AIM_LEAD, { x: 24, y: 17 });
  assert.deepEqual(aimLead(0, false), { x: 24, y: 0 });
  assert.equal(aimLead(Math.PI / 2, false).y, 17);
  assert.equal(aimLead(Math.PI, true).x, -81.6);
  assert.equal(aimLead(Math.PI / 2, true).y, 57.8);
  assert.ok(Math.abs(PRECISE_LEAD.x - 1.7 * 48) < 1e-9 && Math.abs(PRECISE_LEAD.y - 1.7 * 34) < 1e-9, 'precise reach unchanged');
});

test('aim look-ahead points along the aim, so easing toward it never turns the aim under a still pointer (PR #39)', () => {
  for (const precise of [false, true]) for (let k = 0; k < 64; k++) {
    const aim = -Math.PI + k * Math.PI / 32, l = aimLead(aim, precise), e = precise ? PRECISE_LEAD : AIM_LEAD;
    // Parallel to the aim, and as long as the ellipse reaches in that direction.
    assert.ok(Math.abs(l.x * Math.sin(aim) - l.y * Math.cos(aim)) < 1e-9, `${aim} ${precise}`);
    assert.ok(Math.abs((l.x / e.x) ** 2 + (l.y / e.y) ** 2 - 1) < 1e-9, `${aim} ${precise}`);
    // A pointer anywhere on the aim's ray stays on it when the camera moves by the lead: the angle is unchanged.
    const p = { x: Math.cos(aim) * 90, y: Math.sin(aim) * 90 }, moved = { x: p.x + l.x, y: p.y + l.y };
    assert.ok(Math.abs(Math.atan2(Math.sin(Math.atan2(moved.y, moved.x) - aim), Math.cos(Math.atan2(moved.y, moved.x) - aim))) < 1e-9);
  }
});

test('mouse look-ahead follows the pointer on screen, never the aim, so a still pointer keeps its aim (PR #39)', () => {
  // Without the right button the camera stays on the player; with it, along the pointer's offset, a share of its
  // distance capped by the precise ellipse in that direction.
  assert.deepEqual(pointerLead(120, 0, false), { m: 0, ux: 1, uy: 0 });
  const near = pointerLead(30, 0, true), far = pointerLead(0, 400, true), aimed = pointerLead(-300, -300, true);
  assert.ok(Math.abs(near.m - 10.5) < 1e-9 && near.ux === 1);
  assert.ok(Math.abs(far.m - 57.8) < 1e-9 && far.uy === 1, 'capped by the 81.6 x 57.8 ellipse vertically');
  assert.ok(Math.abs(aimed.m - aimLead(Math.atan2(-1, -1), true).x / Math.cos(Math.atan2(-1, -1))) < 1e-9);
  assert.deepEqual(pointerLead(0, 0, true), { m: 0, ux: 1, uy: 0 });
  // A step turns at once and eases only the length; turning keeps the old length's part along the new direction.
  const turned = stepLead({ m: 20, ux: 1, uy: 0 }, { m: 24, ux: 0, uy: 1 }, .5);
  assert.deepEqual(turned, { m: 12, ux: 0, uy: 1 });
  assert.deepEqual(stepLead({ m: 20, ux: 1, uy: 0 }, { m: 24, ux: -1, uy: 0 }, 0), { m: 0, ux: -1, uy: 0 });
  // The player is drawn behind the centring point by the lead; the pointer sits q ahead of it. Whatever length the lead
  // eases to, the pointer stays on the player's line through it: the aim does not move.
  for (const [qx, qy] of [[90, 10], [-40, 120], [300, -260], [5, -3]]) {
    const want = pointerLead(qx, qy, true), aim = (m: number) => Math.atan2(qy + m * want.uy, qx + m * want.ux);
    for (const m of [0, want.m * .3, want.m, want.m * 2]) assert.ok(Math.abs(aim(m) - Math.atan2(qy, qx)) < 1e-12);
  }
});
