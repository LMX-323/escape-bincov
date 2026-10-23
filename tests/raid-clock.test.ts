import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { BUILDING_WORLD } from '../src/building-world';
import { changeLayer } from '../src/layer-transition';

function fixture() {
    const state = createSessionState(), data = new Map<string, string>();
    let fail = false;
    const saves = new SaveSession(state, () => ({
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { if (fail) throw Error('test quota'); data.set(key, value); },
    }));
    assert.ok(saves.initialize());
    state.state = 'hideout'; assert.ok(saves.beginRun(42, true)); state.state = 'run';
    return { state, saves, r: new CoastRaidRuntime(state, saves), fail(value: boolean) { fail = value; } };
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

function pursuing() {
    const f = fixture(), c = f.r.snapshotExpansion(), raid = c.raid!;
    raid.player = { x: 560, y: 272, rotation: 0 };
    const enemy = raid.maps.coast.enemies.find(e => e.id === 'scav')!;
    Object.assign(enemy, { x: 528, y: 272, home: { x: 528, y: 272 }, target: { x: 560, y: 272 },
        state: 'chase', alert: 5, cooldown: .8, path: [], repath: 0 });
    assert.ok(changeLayer(c, BUILDING_WORLD, 'resident-up'));
    const arrival = raid.pursuits.find(p => p.enemy.uid === enemy.uid)!;
    assert.ok(arrival.arrivalAt > 1.4 && arrival.arrivalAt < 1.5);
    f.r.restoreExpansion(c); assert.ok(f.r.checkpoint(), f.state.storageError);
    return { ...f, uid: enemy.uid };
}

test('a pursuit arriving late in a long frame only receives the remaining substeps of AI time', () => {
    const batched = pursuing(), split = pursuing();
    for (const f of [batched, split]) f.r.advance(0, emptyIntent());
    const batch = batched.r.advance(1920, emptyIntent());
    for (let now = 40; now <= 1920; now += 40) split.r.advance(now, emptyIntent());
    assert.equal(batch.events.filter(e => e.type === 'melee' && e.attacker === batched.uid).length, 0);
    assert.equal(batched.r.hp, 100); assert.equal(batched.r.hp, split.r.hp);
    assert.equal(batched.r.snapshotExpansion().raid!.pursuits.length, 0);
    const a = batched.r.enemies.find(e => e.uid === batched.uid)!, b = split.r.enemies.find(e => e.uid === split.uid)!;
    close(a.cooldown, b.cooldown); close(a.x, b.x); close(a.y, b.y);
    assert.ok(a.cooldown > 0, 'the original cooldown has not yet expired since arrival');
    assert.equal(batch.stamp.simulationTime, 1.92);
    assert.ok(batch.events.every(e => e.stamp.simulationTime === batch.stamp.simulationTime));
    const later = batched.r.advance(2400, emptyIntent());
    assert.ok(later.events.some(e => e.type === 'melee' && e.attacker === batched.uid), 'pursuit still attacks after its cooldown');
});

test('a tide boundary inside a long frame changes only the later substeps of environmental damage', () => {
    const f = fixture(), c = f.r.snapshotExpansion(), raid = c.raid!;
    const cells = BUILDING_WORLD.maps.coast.cells;
    const y = cells.findIndex(row => row.includes('tide')), x = cells[y].indexOf('tide');
    raid.player = { x: (x + .5) * 32, y: (y + .5) * 32, rotation: 0 };
    raid.elapsed = 299.9; raid.warned = true; raid.initialHigh = raid.highTide = false;
    c.body.pollution = 0;
    f.r.restoreExpansion(c); f.r.freezeAI = true; assert.ok(f.r.checkpoint(), f.state.storageError);
    f.r.advance(0, emptyIntent()); const batch = f.r.advance(200, emptyIntent());
    assert.equal(f.r.highTide, true); close(f.r.elapsed, 300.1);
    // Two dry-tide substeps precede the crossing, followed by three high-tide substeps.
    close(f.r.pollution, 2.5 * .08 + 7 * .12);
    assert.equal(batch.events.filter(e => e.type === 'notice' && e.text.startsWith('涨潮了')).length, 1);
    assert.ok(batch.events.every(e => e.stamp.simulationTime === batch.stamp.simulationTime));
});

test('a training window ending inside a frame does not credit movement from before the reset', () => {
    const f = fixture(), c = f.r.snapshotExpansion(), raid = c.raid!;
    raid.player = { x: 208, y: 80, rotation: 0 }; raid.elapsed = 59.9;
    raid.training.motion = { anchor: { x: 208, y: 80 }, windowStarted: 0, localSeconds: 15 };
    f.r.restoreExpansion(c); f.r.freezeAI = true; assert.ok(f.r.checkpoint(), f.state.storageError);
    f.r.advance(0, emptyIntent()); f.r.advance(200, { ...emptyIntent(), move: { x: 1, y: 0, sprint: true } });
    const training = f.r.snapshotExpansion().raid!.training;
    close(training.motion.windowStarted, 60.02); close(training.motion.localSeconds, .12);
    close(training.quantity.constitution, 24 * .12 / 600);
});

test('a failed mid-frame world commit retains only simulated time and resumes from that checkpoint', () => {
    const f = fixture(), c = f.r.snapshot(), opener = c.enemies[0];
    c.player = { x: 208, y: 80, rotation: 0 };
    Object.assign(opener, { x: 464, y: 430, state: 'investigate', target: { x: 464, y: 352 },
        alert: 5, path: [], repath: 0, timer: 5, cooldown: 1 });
    f.r.restore(c); f.r.advance(0, emptyIntent()); f.fail(true);
    const failed = f.r.advance(1000, emptyIntent());
    assert.equal(failed.frame.phase, 'paused'); assert.equal(f.r.elapsed, .04);
    close(f.r.snapshotExpansion().raid!.maps.coast.localTime, .04);
    assert.ok(failed.events.some(e => e.type === 'rejected' && e.action === 'door' && e.reason === 'save-failed'));
    assert.ok(failed.events.every(e => e.stamp.simulationTime === .04));
    f.fail(false); assert.ok(f.r.retrySave(), f.state.storageError);
    assert.equal(f.saves.currentRecord()!.expansion!.raid!.elapsed, .04);
    f.r.advance(5000, emptyIntent()); assert.equal(f.r.elapsed, .04);
    f.r.advance(5040, emptyIntent()); assert.equal(f.r.elapsed, .08);
});
