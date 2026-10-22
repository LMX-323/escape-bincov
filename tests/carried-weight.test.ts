import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { wrapCoastRuntime } from '../src/raid-runtime/host';
import { InventoryPanel } from '../src/coast-view/inventory';
import type { CoastServices } from '../src/coast-view/host';

test('raid weight readouts show the Runtime carried weight with the charm worn and taken off', t => {
    for (const key of ['document', 'innerHeight']) {
        const before = Object.getOwnPropertyDescriptor(globalThis, key);
        t.after(() => { if (before) Object.defineProperty(globalThis, key, before); else delete (globalThis as Record<string, unknown>)[key]; });
    }
    // Item art paints into a canvas; without a 2D context the panel simply leaves it out.
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
    Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 720 });
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(42, true)); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves); runtime.freezeAI = true;
    // One shell (0.045 kg) puts the starting kit where the 0.05 kg charm changes the one-decimal readout.
    assert.equal(D.addItem(state.loadout!.bag, 'shell'), 0);
    const services = wrapCoastRuntime(runtime, state, saves).services as unknown as CoastServices;
    const el = { innerHTML: '', querySelectorAll: () => [] };
    const panel = new InventoryPanel(el as unknown as HTMLElement, {
        session: state, saves, services, lootRef: () => null, touch: () => false, toast() {}, saveFailed() {}, close() {},
        carryLimit: () => runtime.carryLimit(), magazine: () => runtime.mag,
    });
    const wear = (charm: D.Item | null) => { const s = runtime.snapshotExpansion(); s.charm = charm; runtime.restoreExpansion(s); };
    const shown = () => { panel.open('inventory'); return /data-weight>([^<]*)</.exec(el.innerHTML)?.[1]; };
    wear(null); const bare = runtime.carriedWeight();
    wear({ uid: 'charm-weight', id: 'luckyCharm', qty: 1, x: 0, y: 0 });
    const worn = runtime.carriedWeight();
    assert.ok(Math.abs(worn - bare - D.ITEMS.luckyCharm.weight) < 1e-9);
    assert.notEqual(worn.toFixed(1), bare.toFixed(1));
    assert.equal(services.carriedWeight(), worn); assert.equal(shown(), worn.toFixed(1));
    wear(null);
    assert.equal(services.carriedWeight(), bare); assert.equal(shown(), bare.toFixed(1));
});
