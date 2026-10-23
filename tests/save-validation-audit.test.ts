import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { decodeBackup, decodePortableBackup } from '../src/save-backup';

function fixture(kind: 'base' | 'classic' | 'layered') {
    const data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, text) => { data.set(key, text); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage);
    assert.equal(saves.initialize(), true);
    state.state = 'hideout';
    assert.equal(saves.enableRpg(), true);
    D.addItem(state.save.bag, 'bandage', 1);
    if (kind !== 'base') assert.equal(saves.beginRun(42, kind === 'layered'), true);
    else assert.equal(saves.persist(), true);
    const bytes = data.get(SESSION_KEY)!;
    return { data, storage, bytes };
}

// Exercise the public text decoders, not just the membership predicate: coercion can pass validation and then
// migrateSave drops the malformed item/weapon, or a live checkpoint retains the non-string until settlement.
for (const field of ['item', 'weapon'] as const) {
    test(`settled backup rejects an array masquerading as a known ${field} ID instead of losing it`, () => {
        const save: any = D.newSave();
        if (field === 'item') save.stash.items[0].id = [save.stash.items[0].id];
        else save.equipment.weapon = [save.equipment.weapon];
        const text = JSON.stringify(save);
        assert.throws(() => decodeBackup(text), /存档/);
        assert.throws(() => decodePortableBackup(text), /存档/);
    });
}

const cases: { name: string; kind: 'classic' | 'layered'; change(record: any): void }[] = [
    ...(['constructor', 'toString', 'hasOwnProperty', '__proto__'] as const).map(key => ({
        name: `layered weapon ${key}`, kind: 'layered' as const,
        change(r: any) { Object.assign(r.expansion.raid.loadout, { weapon: key, ammo: 0, ammoRelief: 0 }); },
    })),
    ...(['classic', 'layered'] as const).flatMap(kind => [
        { name: `${kind} carried item array`, kind, change(r: any) {
            const raid = kind === 'classic' ? r.raid : r.expansion.raid;
            raid.loadout.bag.items[0].id = [raid.loadout.bag.items[0].id];
        } },
        { name: `${kind} weapon array`, kind, change(r: any) {
            const raid = kind === 'classic' ? r.raid : r.expansion.raid;
            raid.loadout.weapon = [raid.loadout.weapon];
        } },
        { name: `${kind} ground item array`, kind, change(r: any) {
            const layer = kind === 'classic' ? r.raid : r.expansion.raid.maps[r.expansion.raid.currentMap];
            layer.loot[0].id = [layer.loot[0].id];
        } },
        { name: `${kind} container item array`, kind, change(r: any) {
            const layer = kind === 'classic' ? r.raid : r.expansion.raid.maps[r.expansion.raid.currentMap];
            const item = layer.containers.find((c: any) => c.inventory.items.length).inventory.items[0];
            item.id = [item.id];
        } },
    ]),
    { name: 'layered current map array', kind: 'layered', change(r: any) { r.expansion.raid.currentMap = [r.expansion.raid.currentMap]; } },
];
for (const c of cases) test(`strict session rejects ${c.name} and preserves the original bytes`, () => {
    const f = fixture(c.kind), record = JSON.parse(f.bytes);
    c.change(record);
    const corrupt = JSON.stringify(record);
    assert.throws(() => decodeSession(corrupt));
    assert.throws(() => decodePortableBackup(corrupt));
    f.data.set(SESSION_KEY, corrupt);
    assert.throws(() => new RecoveryStore(f.storage).load());
    assert.equal(f.data.get(SESSION_KEY), corrupt);
});

test('valid base, classic and layered records retain all content through strict decode and reload', () => {
    for (const kind of ['base', 'classic', 'layered'] as const) {
        const f = fixture(kind), record = decodeSession(f.bytes);
        assert.deepEqual(record, JSON.parse(f.bytes));
        const loaded = new RecoveryStore(f.storage).load();
        assert.deepEqual(loaded.save, record.profile);
        assert.deepEqual(loaded.raid, record.raid);
        assert.deepEqual(loaded.expansion, record.expansion);
    }
});
