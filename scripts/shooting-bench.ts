/**
 * Shooting bench report (PR #39): prints cadence by input and display rate, the first-shot cone, the geometric hit
 * share at bench distances, accumulation under held fire and real hits on a dummy, all from the headless Runtime on
 * the deterministic lane of tests/fixtures/shooting-bench.ts. Measurement only; tests/shooting-bench.test.ts holds
 * the requirements.
 *
 *   node --import tsx scripts/shooting-bench.ts [--json path]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import * as D from '../src/domain';
import { benchRaid, arm, replay, mouse, touchHold, deviations, cadence, rayHits, dummy, GUNS } from '../tests/fixtures/shooting-bench';

const { values } = parseArgs({ options: { json: { type: 'string' } } });
const RATES = [20, 30, 60, 120, 144];
const deg = (r: number) => +(r * 180 / Math.PI).toFixed(3);
const report: Record<string, unknown> = {};

// Held touch fire for 6 s (reloads included) and desktop clicks at 10 Hz for 3 s, by display rate.
for (const gun of GUNS) {
    report[`touch hold 6 s: ${gun}`] = Object.fromEntries(RATES.map(fps => {
        const log = replay(arm(benchRaid(), gun, 120), touchHold(0, 6), 6, fps);
        return [fps, { shots: log.shots.length, interval: +cadence(log).toFixed(4) }];
    }));
    const times = Array.from({ length: 30 }, (_, i) => i * .1);
    report[`clicks at 10 Hz for 3 s: ${gun}`] = Object.fromEntries(RATES.map(fps => [fps, replay(arm(benchRaid(), gun, 120), mouse(times), 3, fps).shots.length]));
}
// First-shot cone (spaced clicks), hip and precise, and the share of its rays crossing a 14 px dummy.
for (const gun of GUNS) for (const precise of [false, true]) {
    const angles = deviations(replay(arm(benchRaid(), gun, 120), mouse(Array.from({ length: 24 }, (_, i) => i * 1.2), precise), 28.8, 20));
    const abs = angles.map(Math.abs);
    report[`cone ${gun} ${precise ? 'precise' : 'hip'}`] = { rays: angles.length, maxDeg: deg(Math.max(...abs)), meanDeg: deg(abs.reduce((s, a) => s + a, 0) / abs.length),
        hitShare: Object.fromEntries([160, 320, 480, 640].filter(d => d <= D.WEAPONS[gun].range).map(d => [d, +rayHits(angles, d).toFixed(3)])) };
}
// Held carbine fire: deviation of each shot from the aim (no accumulation today).
report['held carbine |deviation| deg by shot'] = deviations(replay(arm(benchRaid(), 'carbine', 120), touchHold(0, 3), 3, 60)).map(d => deg(Math.abs(d)));
// Real flight and damage: one pistol click every .4 s at a dummy 320 px away, health kept up.
{
    const b = arm(benchRaid(), 'pistol', 120), uid = dummy(b, 320);
    const log = replay(b, mouse(Array.from({ length: 20 }, (_, i) => i * .4)), 8.5, 60, uid);
    report['pistol at a dummy 320 px'] = { shots: log.shots.length, hits: log.hurt.filter(h => h.uid === uid).length,
        impacts: log.impacts.reduce((m, i) => (m[i.reason] = (m[i.reason] ?? 0) + 1, m), {} as Record<string, number>) };
}
console.log(JSON.stringify(report, null, 1));
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2) + '\n');
