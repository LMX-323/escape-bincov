import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { initialCheckpoint, validateCheckpoint, WORLD_VERSION } from '../src/checkpoint';
import { generateRun, generateRunBase } from '../src/world';
import { createSessionState, SaveSession } from '../src/session';
import { RecoveryStore, SESSION_KEY, decodeSession } from '../src/recovery-store';
import { placementError } from '../src/loot';

function fixture() {
    const data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
    const state = createSessionState(), session = new SaveSession(state, () => storage);
    assert.ok(session.initialize()); state.state = 'hideout';
    assert.ok(session.beginRun(42)); state.state = 'run';
    return { data, storage, state, session };
}

test('legacy coast-v1 checkpoints keep their original loose loot without adding crates', () => {
    const f = fixture(), old: any = structuredClone(f.state.checkpoint!);
    old.worldVersion = 'coast-v1'; delete old.containers;
    old.loot = generateRunBase(42).loot.map((item, i) => ({ ...item, uid: `loot-${i}`, relief: false }));
    const record = JSON.parse(f.data.get(SESSION_KEY)!); record.raid = old;
    f.data.set(SESSION_KEY, JSON.stringify(record));
    const restored = new RecoveryStore(f.storage).load();
    assert.equal(restored.raid!.worldVersion, WORLD_VERSION);
    assert.deepEqual(restored.raid!.containers, []);
    assert.deepEqual(restored.raid!.loot, old.loot);
    assert.equal(restored.raid!.loot.length, 60);
});

test('container world format rejects missing, duplicate, mismatched or corrupt inventories', () => {
    const f = fixture(), checkpoint = f.state.checkpoint!;
    assert.notEqual(WORLD_VERSION, 'coast-v1', 'Older clients must reject this world rather than drop unknown container fields');
    for (const corrupt of [
        (c: any) => { delete c.containers; },
        (c: any) => { c.containers.push(c.containers[0]); },
        (c: any) => { c.containers[0].runId = 'wrong-run'; },
        (c: any) => { c.containers[0].inventory.w = 7; },
        (c: any) => { c.containers[0].inventory.items[0].qty = 1000; },
        (c: any) => { c.containers[0].inventory.items[0].x = -1; },
        (c: any) => { c.containers[0].inventory.items[0].uid = c.loadout.bag.items[0].uid; },
        (c: any) => { c.containers[0].kind = 'corpse'; c.containers[0].id = 'corpse-enemy-0'; },
        (c: any) => { c.worldVersion = 'coast-v1'; },
    ]) {
        const candidate = structuredClone(checkpoint); corrupt(candidate);
        assert.throws(() => validateCheckpoint(candidate, f.state.save));
    }
});

test('container transfers preserve already rotated footprints through recovery', () => {
    const f = fixture(), c = f.state.checkpoint!.containers![0];
    c.inventory.items = [{ uid: 'rotated-water', id: 'water', qty: 1, x: 0, y: 0, rotated: true, relief: true }];
    f.state.loadout!.safe.items = []; f.state.save.safe.items = [];
    assert.equal(placementError(c.inventory, f.state.loadout!.safe, 'rotated-water', 1, 0), '物品超出目标格子边界。');
    const request = { runId: c.runId, containerId: c.id, from: 'container' as const, to: 'safe' as const, uid: 'rotated-water', x: 0, y: 1 };
    assert.equal(f.session.transferLoot(c, request), 'committed', f.state.storageError);
    const restored = decodeSession(f.data.get(SESSION_KEY)!);
    assert.deepEqual(restored.raid!.loadout.safe.items, [{ uid: 'rotated-water', id: 'water', qty: 1, x: 0, y: 1, rotated: true, relief: true }]);
    assert.equal(restored.raid!.containers![0].inventory.items.length, 0);
    assert.equal(f.session.prepareSettlement('death', 0), true);
    assert.equal(f.session.retrySettlement(), true);
    assert.equal(new RecoveryStore(f.storage).load().save.safe.items[0].uid, 'rotated-water');
});

test('full containers refuse returned items and keep exact coordinates on both sides', () => {
    const f = fixture(), c = f.state.checkpoint!.containers![0];
    c.inventory.items = Array.from({ length: 30 }, (_, n) => ({ uid: `full-${n}`, id: 'fuse', qty: 4, x: n % 6, y: Math.floor(n / 6) }));
    f.state.loadout!.safe.items = [{ uid: 'return-watch', id: 'watch', qty: 1, x: 1, y: 1 }];
    const before = structuredClone({ c, loadout: f.state.loadout }), bytes = f.data.get(SESSION_KEY);
    assert.equal(f.session.transferLoot(c, { runId: c.runId, containerId: c.id, from: 'safe', to: 'container', uid: 'return-watch', x: 5, y: 4 }), 'rejected');
    assert.deepEqual({ c, loadout: f.state.loadout }, before);
    assert.equal(f.data.get(SESSION_KEY), bytes);
});

test('another writer fences a staged container transfer without changing the winning save', () => {
    const f = fixture(), c = f.state.checkpoint!.containers![0];
    c.inventory.items = [{ uid: 'fenced-pearl', id: 'pearl', qty: 1, x: 0, y: 0 }];
    const other = new RecoveryStore(f.storage), loaded = other.load();
    other.commit(loaded.save, loaded.raid);
    const bytes = f.data.get(SESSION_KEY), before = structuredClone({ c, loadout: f.state.loadout });
    assert.equal(f.session.transferLoot(c, { runId: c.runId, containerId: c.id, from: 'container', to: 'safe', uid: 'fenced-pearl', x: 0, y: 0 }), 'save-failed');
    assert.deepEqual({ c, loadout: f.state.loadout }, before);
    assert.equal(f.data.get(SESSION_KEY), bytes);
});
