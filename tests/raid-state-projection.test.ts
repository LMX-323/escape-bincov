import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { activeRaidCheckpoint, applyActiveRaidSnapshot } from '../src/raid-state-projection';
import { changeLayer } from '../src/layer-transition';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { createSessionState, SaveSession } from '../src/session';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

test('returning to a pursuit source projects visible enemies without giving the layer a second owner', () => {
    const world = prototypeWorld(), original = prototypeRaid(D.newSave(), world), raid = original.raid!;
    raid.maps.downstairs.bullets = [];
    assert.equal(changeLayer(original, world, 'up'), true);
    assert.equal(raid.pursuits.length, 2);
    assert.equal(activeRaidCheckpoint(original.body, raid, .2).enemies.length, 0, 'source-map enemies are not visible upstairs');
    raid.maps.upstairs.localTime = 17;
    raid.maps.upstairs.loot.push({ uid: 'upstairs-loot', id: 'water', qty: 1, x: 80, y: 80, relief: false });
    assert.equal(changeLayer(original, world, 'down'), true);

    const before = structuredClone(original), candidate = structuredClone(original);
    const live = structuredClone(activeRaidCheckpoint(original.body, raid, .2));
    live.enemies[0].hp = 3; live.enemies[0].x += 4;
    live.hp = 73; live.stamina = 61; live.pollution = 9; live.bleeding = 1; live.exhausted = true;
    live.elapsed = 3; live.loadout.ammo = 2;
    live.shotNoise = { x: 80, y: 48 }; live.noiseRadius = 123; live.noiseTime = .8;
    applyActiveRaidSnapshot(candidate.body, candidate.raid!, live);

    assert.deepEqual(original, before, 'only the detached candidate is writable');
    assert.deepEqual(candidate.raid!.maps.upstairs, before.raid!.maps.upstairs, 'inactive layer is frozen');
    assert.deepEqual(candidate.base, before.base, 'base production is not part of a live layer snapshot');
    assert.deepEqual(candidate.growth, before.growth);
    assert.equal(candidate.body.mental, before.body.mental);
    assert.deepEqual(candidate.body.effects, before.body.effects);
    assert.equal(candidate.body.hp, 73); assert.equal(candidate.body.bleeding, true);
    assert.equal(candidate.raid!.elapsed, 3); assert.equal(candidate.raid!.loadout.ammo, 2);
    assert.equal(candidate.raid!.maps.downstairs.enemies.length, 0);
    assert.equal(candidate.raid!.pursuits[0].enemy.hp, 3);
    const owners = Object.values(candidate.raid!.maps).flatMap(map => map.enemies).concat(candidate.raid!.pursuits.map(p => p.enemy));
    assert.deepEqual(owners.map(e => e.uid).sort(), raid.roster.map(e => e.uid).sort());
    assert.deepEqual(candidate.raid!.maps.downstairs.noise, { at: live.shotNoise, radius: 123, remaining: .8 });
    const restored = activeRaidCheckpoint(candidate.body, candidate.raid!, .2);
    assert.deepEqual(restored.enemies, live.enemies);
    assert.equal(restored.stepTime, .2);
    assert.equal(restored.rng, before.raid!.rng, 'projection does not consume randomness');
});

test('expired noise and coast-only presentation state do not survive the layered projection', () => {
    const state = prototypeRaid(D.newSave(), prototypeWorld()), raid = state.raid!;
    const live = structuredClone(activeRaidCheckpoint(state.body, raid, .4));
    live.shotNoise = { x: 48, y: 48 }; live.noiseRadius = 100; live.noiseTime = 0;
    live.noteSeen = ['coast note']; live.stepTime = 9;
    applyActiveRaidSnapshot(state.body, raid, live);
    const restored = activeRaidCheckpoint(state.body, raid, .7);
    assert.equal(raid.maps.downstairs.noise, null);
    assert.equal(restored.shotNoise, null); assert.equal(restored.noiseTime, 0); assert.equal(restored.noiseRadius, 510);
    assert.deepEqual(restored.noteSeen, []); assert.equal(restored.stepTime, .7);
});

function runtimeFixture(route: 'buildings' | 1 | 2 | 3) {
    const state = createSessionState(), data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
    const saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.equal(saves.initialize(), true); state.state = 'hideout';
    assert.equal(saves.beginRun(42, route === 'buildings' ? true : 'mall', route === 'buildings' ? {} : { mallLayout: route }), true);
    state.state = 'run';
    return { state, saves, runtime: new CoastRaidRuntime(state, saves) };
}

for (const route of ['buildings', 1, 2, 3] as const) {
    test(`${route}: capture preserves clone order/ammo synchronization and restore isolates input`, t => {
        const { state, saves, runtime } = runtimeFixture(route), committed = saves.currentRecord();
        const storedExpansion = structuredClone(state.expansion), layered = structuredClone(runtime.layered);
        const staleAmmo = state.loadout!.ammo;
        runtime.hp = 73; runtime.stamina = 61; runtime.pollution = 9; runtime.bleeding = 1; runtime.exhausted = true;
        runtime.mag = staleAmmo - 1; runtime.magRelief = 1; runtime.elapsed = 2; runtime.stepTime = .3;
        runtime.player.rotation = 0; runtime.enemies[0].hp -= 2;
        const nativeClone = globalThis.structuredClone, observations: { value: unknown; ammo: number }[] = [];
        const clone = t.mock.method(globalThis, 'structuredClone', function<T>(value: T, options?: StructuredSerializeOptions): T {
            observations.push({ value, ammo: state.loadout!.ammo });
            return nativeClone(value, options);
        });
        const captured = runtime.snapshotExpansion();
        clone.mock.restore();
        assert.equal(observations.length, 2, 'one expansion clone and one live snapshot clone');
        assert.equal(observations[0].value, runtime.layered); assert.equal(observations[0].ammo, staleAmmo);
        assert.equal(observations[1].ammo, runtime.mag, 'snapshot synchronizes magazine after cloning layered');
        assert.equal(state.loadout!.ammoRelief, 1);
        assert.deepEqual(runtime.layered, layered, 'capture does not publish the projection');
        assert.deepEqual(state.expansion, storedExpansion); assert.deepEqual(saves.currentRecord(), committed);
        assert.equal(captured.body.hp, 73); assert.equal(captured.body.stamina, 61); assert.equal(captured.body.pollution, 9);
        assert.equal(captured.body.bleeding, true); assert.equal(captured.body.exhausted, true);
        assert.equal(captured.raid!.loadout.ammo, runtime.mag);

        const candidate = structuredClone(captured), liveEnemy = runtime.enemies[0];
        runtime.restoreExpansion(candidate);
        assert.equal(runtime.enemies[0], liveEnemy, 'restore preserves existing live entity identity');
        assert.equal(runtime.stepTime, .3);
        candidate.body.hp = 1; candidate.raid!.player.x += 100; candidate.raid!.loadout.bag.items.length = 0;
        candidate.raid!.maps[candidate.raid!.currentMap].enemies[0].hp = 1;
        assert.deepEqual(runtime.snapshotExpansion(), captured, 'caller changes cannot reach restored runtime');
        captured.body.hp = 2; captured.raid!.loadout.ammo = 0;
        assert.equal(runtime.hp, 73); assert.equal(state.loadout!.ammo, staleAmmo - 1);
    });
}

test('terminal expansion restore updates detached base state without rebuilding live entities', () => {
    const { runtime } = runtimeFixture('buildings'), terminal = runtime.snapshotExpansion(), enemy = runtime.enemies[0];
    terminal.raid = null; terminal.base.location = 'settlement'; terminal.body.hp = 12;
    runtime.restoreExpansion(terminal);
    assert.equal(runtime.layered!.raid, null); assert.equal(runtime.layered!.body.hp, 12);
    assert.equal(runtime.enemies[0], enemy);
    terminal.body.hp = 1; assert.equal(runtime.layered!.body.hp, 12);
    assert.throws(() => runtime.snapshotExpansion(), /没有多层行动/);
});
