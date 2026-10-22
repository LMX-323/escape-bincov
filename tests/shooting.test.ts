import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { advanceAim, coneOf, drawAim, driftOf, handlingOf, playtestMarks, recoil, turnAim, unsteadyAim, SAMPLE_GUNS, SWAY, type AimState, type Motion } from '../src/shooting';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const aim = (patch: Partial<AimState> = {}): AimState => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0, ...patch });
const MOTIONS: Motion[] = [{ pace: 0, sprint: false, precise: true }, { pace: .7, sprint: false, precise: false }, { pace: 1.6, sprint: true, precise: true }];

test('aim rules are closed forms of time: splitting an interval changes nothing but rounding', () => {
    for (const id of ['pistol', 'carbine', 'shotgun', 'm4a1']) for (const motion of MOTIONS) {
        const h = handlingOf(id), rules = SWAY;
        const start = () => aim({ raise: .3, sway: .4, bloom: .8, drift: .6, settle: .07 });
        const whole = advanceAim(start(), h, rules, .23, motion);
        const split = start();
        for (const s of [.01, .04, .005, .095, .08]) advanceAim(split, h, rules, s, motion);
        for (const k of Object.keys(whole) as (keyof AimState)[]) assert.ok(Math.abs(whole[k] - split[k]) < 1e-12, `${id} ${k}`);
    }
});

test('a precise aim rises over its raise time and drops twice as fast; sprinting drops it', () => {
    const h = handlingOf('carbine'), rules = SWAY, a = aim();
    advanceAim(a, h, rules, h.raise / 2, { pace: 0, sprint: false, precise: true }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: true }); assert.equal(a.raise, 1);
    advanceAim(a, h, rules, h.raise / 4, { pace: 0, sprint: false, precise: false }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 1.7, sprint: true, precise: true }); assert.equal(a.raise, 0);
});

test('the cone: hip at rest is spread times hip, a raised aim narrows it, sway and bloom widen it, the body scales it', () => {
    for (const id of ['pistol', 'carbine', 'shotgun'] as const) {
        const w = D.WEAPONS[id], h = handlingOf(id);
        assert.ok(near(coneOf(aim(), w, h), w.spread * h.hip));
        assert.ok(near(coneOf(aim({ raise: 1 }), w, h), w.spread * h.hip * h.precise));
        assert.ok(near(coneOf(aim({ sway: 1 }), w, h), w.spread * h.hip * (1 + h.sway)));
        assert.ok(near(coneOf(aim({ bloom: 1 }), w, h), w.spread * h.hip + h.bloomMax));
        assert.ok(near(coneOf(aim({ bloom: .5, sway: .5 }), w, h, 1.1), coneOf(aim({ bloom: .5, sway: .5 }), w, h) * 1.1));
    }
    // The knife has no cone or recoil.
    const knife = handlingOf('knife'), a = aim();
    recoil(a, knife); assert.equal(a.bloom, 0); assert.equal(a.drift, 0); assert.equal(driftOf(a, knife), 0);
});

test('recoil adds bloom and drift up to their caps and restarts the settle delay; recovery waits for it', () => {
    const h = handlingOf('m4a1'), rules = SWAY, a = aim();
    recoil(a, h);
    assert.ok(near(a.bloom, h.bloom / h.bloomMax) && near(a.drift, h.kick / h.kickMax) && a.settle === h.settle);
    for (let i = 0; i < 40; i++) recoil(a, h);
    assert.equal(a.bloom, 1); assert.equal(a.drift, 1); assert.ok(near(driftOf(a, h), h.kickMax));
    advanceAim(a, h, rules, h.settle, { pace: 0, sprint: false, precise: false });
    assert.equal(a.bloom, 1);
    advanceAim(a, h, rules, .25, { pace: 0, sprint: false, precise: false });
    assert.ok(near(a.bloom, Math.exp(-h.recover * .25)) && near(a.drift, a.bloom));
});

test('turns and draws shake the aim; the worst state is fully unsteady and bloomed', () => {
    const rules = SWAY, a = aim({ raise: 1, bloom: .4 });
    turnAim(a, rules, -Math.PI / 4); assert.ok(near(a.sway, rules.turn * Math.PI / 4));
    turnAim(a, rules, Math.PI * 2); assert.equal(a.sway, 1);
    const b = aim({ raise: 1, sway: .1, bloom: .4, drift: .3 });
    drawAim(b, rules); assert.deepEqual(b, { raise: 0, sway: rules.draw, bloom: .4, drift: .3, settle: 0 });
    assert.deepEqual(unsteadyAim(), { raise: 0, sway: 1, bloom: 1, drift: 0, settle: 0 });
});

test('playtest marks: the sample rifle only beside an explicit sample mark; the retired feel mark is ignored', () => {
    assert.deepEqual(playtestMarks(''), { gun: null });
    assert.deepEqual(playtestMarks('?feel=brisk&gun=m4a1'), { gun: null });
    assert.deepEqual(playtestMarks('?sample=village&gun=m4a1&feel=brisk'), { gun: 'm4a1' });
    assert.deepEqual(playtestMarks('?sample=mall&gun=ak'), { gun: null });
});
test('the sample rifle is automatic and kept out of the item and weapon tables a save can hold', () => {
    assert.equal(handlingOf('m4a1').mode, 'auto');
    assert.ok(['pistol', 'carbine', 'shotgun', 'knife'].every(id => handlingOf(id).mode === 'semi'));
    assert.equal(Object.hasOwn(D.ITEMS, SAMPLE_GUNS.m4a1.id), false);
    assert.equal(Object.hasOwn(D.WEAPONS, SAMPLE_GUNS.m4a1.id), false);
});

test('touch: standing with the aim stick inside the fire ring raises the aim, firing past it holds, walking lowers it', () => {
    const h = handlingOf('pistol'), rules = SWAY, a = aim();
    advanceAim(a, h, rules, h.raise / 2, { pace: 0, sprint: false, precise: false, hold: 'aim' }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: false, hold: 'fire' }); assert.ok(near(a.raise, .5), 'firing holds the raise');
    advanceAim(a, h, rules, h.raise / 8, { pace: .8, sprint: false, precise: false, hold: 'aim' }); assert.ok(near(a.raise, .25), 'walking lowers it');
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: false, hold: 'aim' }); assert.equal(a.raise, 1);
    advanceAim(a, h, rules, h.raise / 4, { pace: .8, sprint: false, precise: false, hold: 'fire' }); assert.ok(near(a.raise, .5), 'firing on the move does not hold it');
});
