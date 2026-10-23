import assert from 'node:assert/strict';
import test from 'node:test';
import * as D from '../src/domain';
import { RealHideoutRuntime } from '../src/hideout-runtime/runtime';
import type { Result } from '../src/hideout-runtime/contract';
import { SESSION_KEY } from '../src/recovery-store';
import { createSessionState, SaveSession } from '../src/session';
import { UI } from '../src/station-view/ui';

function fixture(full = false) {
    const now = 1800000000000, data = new Map<string, string>();
    let failed = false, writes = 0;
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {
        if (failed) throw new Error('quota');
        data.set(key, value); writes++;
    } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => now);
    assert.equal(saves.initialize(), true);
    const runtime = new RealHideoutRuntime(state, saves, () => now);
    assert.equal(runtime.enter().ok, true);
    const ticket = saves.prepareExpansionMutation(draft => {
        draft.profile.bag = D.createInventory(6, 5);
        draft.profile.bag.items.push({ uid: 'partial', id: 'bandage', qty: 2, x: 0, y: 0 }, { uid: 'selected', id: 'bandage', qty: 2, x: 1, y: 0 });
        if (full) assert.equal(D.addItem(draft.profile.bag, 'watch', 56), 0);
    });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    const results: Result[] = [], messages: string[] = [];
    // Run the actual button handler and real Runtime/SaveSession, replacing only DOM rendering and feedback.
    const ui = Object.create(UI.prototype) as { split(): void };
    Object.assign(ui, { rt: runtime, selected: { src: 'bag', uid: 'selected' }, render: () => {},
        result: (result: Result) => { results.push(result); return result.ok; },
        toast: (message: string) => { messages.push(message); }, host: { sound: () => {} } });
    return { state, runtime, results, messages, split: () => ui.split(), fail: (value = true) => { failed = value; },
        get raw() { return data.get(SESSION_KEY); }, get writes() { return writes; } };
}

test('station split skips compatible partial stacks and creates its half in the first empty footprint', () => {
    const f = fixture(); f.split();
    const items = f.state.save.bag.items;
    assert.deepEqual(items.filter(item => ['partial', 'selected'].includes(item.uid)), [
        { uid: 'partial', id: 'bandage', qty: 2, x: 0, y: 0 }, { uid: 'selected', id: 'bandage', qty: 1, x: 1, y: 0 },
    ]);
    assert.equal(items.length, 3);
    assert.deepEqual({ ...items[2], uid: 'new' }, { uid: 'new', id: 'bandage', qty: 1, x: 2, y: 0 });
    assert.equal(new Set(items.map(item => item.uid)).size, 3);
    assert.equal(D.count(f.state.save.bag, 'bandage'), 4);
    assert.deepEqual(f.results, [{ ok: true }]);
});

test('station split refuses a full inventory instead of silently merging into an existing partial stack', () => {
    const f = fixture(true), before = structuredClone(f.state.save), raw = f.raw, writes = f.writes;
    f.split();
    assert.deepEqual(f.state.save, before); assert.equal(f.raw, raw); assert.equal(f.writes, writes);
    assert.deepEqual(f.results, []); assert.deepEqual(f.messages, ['没有空格放拆出来的那一份。']);
});

test('station split write failure preserves both stacks and a retry creates exactly one new stack', () => {
    const f = fixture(), before = structuredClone({ profile: f.state.save, expansion: f.state.expansion }), raw = f.raw;
    f.fail(); f.split();
    assert.deepEqual({ profile: f.state.save, expansion: f.state.expansion }, before); assert.equal(f.raw, raw);
    assert.equal(f.results.length, 1); assert.equal(f.results[0].ok, false);
    assert.ok(!f.results[0].ok && f.results[0].reason === 'storage');
    f.fail(false); assert.equal(f.runtime.retrySave().ok, true); f.split();
    assert.equal(f.state.save.bag.items.length, 3); assert.equal(D.count(f.state.save.bag, 'bandage'), 4);
    assert.equal(f.state.save.bag.items.find(item => item.uid === 'partial')!.qty, 2);
});

test('manual partial placement still merges into a compatible stack', () => {
    const f = fixture();
    assert.equal(f.runtime.move('bag', 'bag', 'selected', 0, 0, false, 1).ok, true);
    assert.deepEqual(f.state.save.bag.items.map(item => [item.uid, item.qty]), [['partial', 3], ['selected', 1]]);
});
