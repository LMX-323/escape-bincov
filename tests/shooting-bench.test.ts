import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { benchRaid, arm, replay, mouse, touchHold, deviations, cadence, rayHits, dummy, GUNS } from './fixtures/shooting-bench';

// Stage S0 of PR #39 records the shooting the rework starts from. A check named GAP asserts today's behaviour that a
// later stage is meant to change; when that stage lands the check turns red and is replaced by the new requirement.
// 20 Hz frames take two Runtime substeps each; 144 Hz is a common fast display.
const RATES = [20, 60, 144];

test('shooting bench: the same seed and script replay to the same shots, hits and magazine', () => {
    const run = () => { const b = arm(benchRaid(), 'carbine'), uid = dummy(b, 320); return replay(b, mouse([0, .3, .6, .9, 1.2]), 1.8, 60, uid); };
    const first = run(), second = run();
    assert.deepEqual(second, first);
    assert.equal(first.shots.length, 5); assert.equal(first.hurt.length, 5); assert.equal(first.mag, D.WEAPONS.carbine.magazine - 5);
    assert.deepEqual(first.impacts.map(i => i.reason), Array(5).fill('hit-actor'));
});

test('shooting bench: spaced clicks fire the same pellets at every display rate', () => {
    for (const gun of GUNS) {
        const times = gun === 'shotgun' ? [0, .75] : [0, .35, .7];
        const logs = RATES.map(fps => replay(arm(benchRaid(), gun), mouse(times), .8, fps));
        assert.equal(logs[0].shots.length, times.length, gun);
        for (const log of logs) assert.deepEqual(log.shots.map(s => s.angles), logs[0].shots.map(s => s.angles), gun);
        // Shooting never turns the body: every shot leaves the published aim where the input put it.
        assert.ok(logs.every(log => log.shots.every(s => s.aim === 0)), gun);
    }
});

test('shooting bench: a held left button fires once and clicks inside the cooldown are dropped (all guns semi-automatic)', () => {
    const hold = replay(arm(benchRaid(), 'pistol'), t => ({ firePressed: t === 0, source: 'mouse-keyboard' }), 1.5, 60);
    assert.equal(hold.shots.length, 1);
    const spam = Array.from({ length: 10 }, (_, i) => i * .1);
    for (const fps of [30, 60, 120]) {
        // Cooldowns .29 s and .24 s: of ten clicks 100 ms apart only every third finds the gun ready.
        assert.equal(replay(arm(benchRaid(), 'pistol'), mouse(spam), 1, fps).shots.length, 4, `${fps} Hz`);
        assert.equal(replay(arm(benchRaid(), 'carbine'), mouse(spam), 1, fps).shots.length, 4, `${fps} Hz`);
    }
});

test('shooting bench GAP (S3): held touch fire runs at a frame-rate dependent cadence', t => {
    const carbine = Object.fromEntries([30, 60, 120].map(fps => [fps, cadence(replay(arm(benchRaid(), 'carbine'), touchHold(0, 1.5), 1.5, fps))]));
    t.diagnostic(`GAP touch-cadence: carbine cooldown ${D.WEAPONS.carbine.cooldown} s fires every ${JSON.stringify(carbine)} s by display rate`);
    // The cooldown ends between frames and held fire only reaches a frame's first substep, so a shot waits for the next frame.
    assert.ok(Math.abs(carbine[30] - 8 / 30) < 1e-9 && Math.abs(carbine[60] - 15 / 60) < 1e-9 && Math.abs(carbine[120] - 29 / 120) < 1e-9);
});

test('shooting bench GAP (S2): spread ignores movement, sustained fire and how long precise aim was held', t => {
    const times = [0, .8, 1.6];
    const still = replay(arm(benchRaid(), 'carbine'), mouse(times), 2, 60);
    const moving = replay(arm(benchRaid(), 'carbine'), (time, previous) => ({ ...mouse(times)(time, previous), move: { x: 0, y: time < 1 ? 1 : -1, sprint: true } }), 2, 60);
    assert.deepEqual(deviations(moving), deviations(still));
    // Precise aim scales the same random draw by .35 from its very first frame.
    const hip = deviations(replay(arm(benchRaid(), 'pistol'), mouse([0, .5, 1]), 1.2, 60));
    const precise = deviations(replay(arm(benchRaid(), 'pistol'), mouse([0, .5, 1], true), 1.2, 60));
    precise.forEach((d, i) => assert.ok(Math.abs(d - hip[i] * .35) < 1e-12));
    // Eight shots of held carbine fire stay inside the first shot's cone: nothing accumulates.
    const burst = deviations(replay(arm(benchRaid(), 'carbine'), touchHold(0, 2), 2, 60));
    assert.equal(burst.length, 8);
    assert.ok(burst.every(d => Math.abs(d) <= D.WEAPONS.carbine.spread / 2));
    t.diagnostic('GAP no-motion-penalty, no-aim-time, no-bloom, no-recoil: the cone is fixed per weapon and stance');
});

test('shooting bench: first-shot cone and its geometric hit share at bench distances', t => {
    for (const gun of GUNS) {
        const angles = deviations(replay(arm(benchRaid(), gun), mouse([0, 1, 2, 3, 4, 5]), 5.2, 20));
        const half = D.WEAPONS[gun].spread / 2;
        assert.ok(angles.every(a => Math.abs(a) <= half), gun);
        const share = Object.fromEntries([160, 320, 480, 640].filter(d => d <= D.WEAPONS[gun].range).map(d => [d, rayHits(angles, d)]));
        t.diagnostic(`${gun}: hip half-angle ${(half * 180 / Math.PI).toFixed(3)} deg, rays hitting a 14 px dummy ${JSON.stringify(share)}`);
    }
    // Aimed at the dummy's centre, every pistol ray within 320 px and every carbine ray within 640 px hits: at these
    // distances precise aim cannot improve a still shot (the 2026-10-12 diagnosis, now on the 2.5D Runtime).
    const half = (gun: 'pistol' | 'carbine') => D.WEAPONS[gun].spread / 2;
    assert.ok(Math.sin(half('pistol')) * 320 < 14 && Math.sin(half('carbine')) * 640 < 14);
});
