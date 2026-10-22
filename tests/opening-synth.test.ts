import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATE, bakeBed, bakeCue, normalise, type Bed } from '../src/opening/synth';
import { SHOTS, type Cue } from '../src/opening/timeline';

const stats = (x: Float32Array) => {
  let peak = 0, sum = 0;
  for (const v of x) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return { peak, rms: Math.sqrt(sum / x.length) };
};

test('every bed is a non-silent loop of a few seconds that never clips', () => {
  for (const bed of ['rain', 'roof', 'wind', 'sea'] as Bed[]) {
    const x = bakeBed(bed), s = stats(x);
    assert.ok(x.length >= 3 * RATE && x.length <= 10 * RATE, `${bed} length ${x.length}`);
    assert.ok(s.peak <= 0.61 && s.rms > 0.02, `${bed} peak ${s.peak} rms ${s.rms}`);
  }
});

test('every cue the timeline uses bakes to a short, non-silent sound under full scale', () => {
  const cues = new Set<Cue>(SHOTS.flatMap(s => (s.cues ?? []).map(c => c.cue)));
  assert.ok(cues.size >= 12);
  for (const cue of cues) {
    const x = bakeCue(cue), s = stats(x);
    assert.ok(x.length > 0.05 * RATE && x.length < 4 * RATE, `${cue} length`);
    assert.ok(s.peak <= 1 && s.peak > 0.2, `${cue} peak ${s.peak}`);
  }
});

test('baking is deterministic and roar voices differ', () => {
  assert.deepEqual(bakeCue('thunder'), bakeCue('thunder'));
  assert.deepEqual(bakeBed('rain').subarray(0, 4096), bakeBed('rain').subarray(0, 4096));
  assert.notDeepEqual(bakeCue('roar', 0).subarray(0, 4096), bakeCue('roar', 1).subarray(0, 4096));
  assert.deepEqual([...normalise(new Float32Array(3), 0.5)], [0, 0, 0], 'silence stays silence');
});
