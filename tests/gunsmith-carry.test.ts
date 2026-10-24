import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodeStoredProfile } from '../src/profile-codec';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { gunSize, type GunState, type PartNode } from '../src/gunsmith/instance';

// Gunsmith M1-03 (docs/gunsmith/CONTRACTS.md): equipping, unequipping and swapping guns in a raid move one gun instance:
// its uid, its installed parts and its switches go with it, and the magazine's rounds go back as they do today,
// ordinary and relief apart. Parts are installed by hand here (the workbench is M2) to show they travel.
const NOW = 1800000000000;
const part = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
/** A carbine with a rifle flash hider and the carbine top base holding an open red dot: three parts, two levels. */
const fitted = (): GunState => ({ parts: [part('p-muzzle', 'M05', 'muzzle'), part('p-base', 'A07', 'base', [part('p-dot', 'O03', 'top')])], devices: { laser: false, light: false } });
/** The same carbine with the compact suppressor instead: one cell longer (4x1). */
const suppressed = (): GunState => ({ parts: [part('p-can', 'M07', 'muzzle')], devices: { laser: false, light: false } });
const gunItem = (uid: string, id: string, x: number, y: number, gun: GunState = { parts: [], devices: { laser: false, light: false } }, extra: Partial<D.Item> = {}): D.Item =>
    ({ uid, id, qty: 1, x, y, ...extra, gun });
/** Rounds of `id` by origin across inventories and an equipped magazine of that ammunition. */
function rounds(id: string, inventories: D.Inventory[], slot?: D.Equipment) {
    const sum = (relief: boolean) => inventories.flatMap(inv => inv.items).filter(i => i.id === id && !!i.relief === relief).reduce((n, i) => n + i.qty, 0);
    const loaded = slot?.weapon && D.WEAPONS[slot.weapon].ammo === id ? slot : null;
    return { ordinary: sum(false) + (loaded ? loaded.ammo - loaded.ammoRelief : 0), relief: sum(true) + (loaded?.ammoRelief ?? 0) };
}
function origin() {
    const data = new Map<string, string>(), failing = new Set<string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); } };
    return { data, failing, storage };
}
/** A deployed building raid on a fresh save whose loadout is `arm`ed through a committed candidate, and its Runtime. */
function raid(arm: (loadout: D.RunLoadout) => void) {
    const o = origin(), state = createSessionState(), saves = new SaveSession(state, () => o.storage, undefined, () => NOW);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(4242, true)); state.state = 'run';
    const ticket = saves.prepareExpansionMutation(d => { arm(d.expansion.raid!.loadout); });
    assert.ok(ticket, state.storageError); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    const runtime = new CoastRaidRuntime(state, saves); runtime.freezeAI = true;
    return { o, state, saves, runtime, get record() { return decodeSession(o.data.get(SESSION_KEY)!); } };
}

test('a hideout swap moves both guns as themselves: the uid, the parts and the switches go along, the rounds go back apart', () => {
    const save = D.newSave();
    save.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 9, ammoRelief: 4 };
    save.bag.items = [gunItem('bag-pistol', 'pistol', 0, 0, undefined, { relief: true })];
    const before = rounds('ammoR', [save.stash, save.bag, save.safe], save.equipment);
    assert.ok(D.equip(save, 'bag-pistol'));
    assert.deepEqual([save.equipment.weapon, save.equipment.weaponUid, save.equipment.relief, save.equipment.ammo], ['pistol', 'bag-pistol', true, 0]);
    const back = save.bag.items.find(i => i.uid === 'eq-carbine')!;
    assert.deepEqual([back.id, back.gun, back.relief], ['carbine', fitted(), undefined], 'the carbine is the same instance, parts and all');
    assert.deepEqual(rounds('ammoR', [save.stash, save.bag, save.safe], save.equipment), before, 'ordinary and relief rounds both kept');
    assert.ok(save.bag.items.some(i => i.id === 'ammoR' && i.relief && i.qty === 4) && save.bag.items.some(i => i.id === 'ammoR' && !i.relief && i.qty === 5));
    // Equipping it again from the bag gives the slot the very same instance; unequipping takes the pistol to the stash as itself.
    assert.ok(D.equip(save, 'eq-carbine'));
    assert.deepEqual([save.equipment.weaponUid, save.equipment.gun], ['eq-carbine', fitted()]);
    assert.ok(save.bag.items.some(i => i.uid === 'bag-pistol' && i.relief));
    D.removeItem(save.bag, 'ammoR', D.count(save.bag, 'ammoR'));
    assert.ok(D.unequip(save)); assert.equal(save.equipment.weapon, null);
    assert.deepEqual(save.stash.items.filter(i => i.uid === 'eq-carbine').map(i => i.gun), [fitted()]);
    // The result is a valid stored profile: one uid space, every gun valid, nothing lost or invented.
    const decoded = decodeStoredProfile({ ...save, activeRun: null });
    assert.deepEqual(decoded.stash.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
});

test('a swap or unequip that cannot place the old gun or its rounds changes nothing; a longer gun needs its longer gap', () => {
    const save = D.newSave();
    save.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: suppressed(), relief: false, ammo: 12, ammoRelief: 0 };
    assert.deepEqual(gunSize({ id: 'carbine', parts: suppressed().parts }), { w: 4, h: 1 });
    // A stash full but for one 3x1 gap: the factory carbine would fit, the suppressed one (4x1) does not, in either orientation.
    save.stash.items = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if (!(y === 0 && x < 3)) save.stash.items.push({ uid: `fill-${x}-${y}`, id: 'watch', qty: 1, x, y });
    const before = structuredClone(save);
    assert.equal(D.unequip(save), false); assert.deepEqual(save, before);
    // Open a 4x1 gap: it goes there, as itself; the rounds then need room of their own (none left), so still nothing moves.
    save.stash.items = save.stash.items.filter(i => !(i.y === 0 && i.x === 3)); const opened = structuredClone(save);
    assert.equal(D.unequip(save), false, 'twelve rounds have nowhere to go'); assert.deepEqual(save, opened);
    save.equipment.ammo = 0; assert.ok(D.unequip(save));
    const placed = save.stash.items.find(i => i.uid === 'eq-carbine')!;
    assert.deepEqual([placed.x, placed.y, placed.rotated, placed.gun], [0, 0, undefined, suppressed()]);
    // The swap in the bag is just as strict: a full bag keeps the loaded gun and both ammo origins.
    const full = D.newSave(); full.bag.items = [gunItem('bag-shotgun', 'shotgun', 0, 0)];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (y > 0 || x > 2) full.bag.items.push({ uid: `b-${x}-${y}`, id: 'watch', qty: 1, x, y });
    full.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 3, ammoRelief: 1 };
    const kept = structuredClone(full);
    assert.equal(D.equip(full, 'bag-shotgun'), false, 'the carbine fits where the shotgun was, its rounds do not'); assert.deepEqual(full, kept);
    full.equipment.ammo = 0; full.equipment.ammoRelief = 0; assert.ok(D.equip(full, 'bag-shotgun'));
    assert.deepEqual(full.bag.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
});

test('a raid swap through the Runtime moves both instances, unloads apart, checkpoints and reloads the same', () => {
    const r = raid(l => {
        Object.assign(l, { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 7, ammoRelief: 2 });
        l.bag.items = l.bag.items.filter(i => i.id !== 'ammoR'); assert.equal(D.addItem(l.bag, 'shotgun'), 0);
    });
    const shotgun = r.state.loadout!.bag.items.find(i => i.id === 'shotgun')!, before = rounds('ammoR', [r.state.loadout!.bag], r.state.loadout!);
    assert.equal(r.runtime.equipItem(shotgun.uid), 'committed');
    const loadout = r.state.loadout!;
    assert.deepEqual([loadout.weapon, loadout.weaponUid, loadout.gun], ['shotgun', shotgun.uid, shotgun.gun]);
    assert.deepEqual(loadout.bag.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
    assert.deepEqual(rounds('ammoR', [loadout.bag], loadout), before);
    // The committed record holds exactly that; a reopened page resumes it.
    const stored = r.record.expansion!.raid!.loadout;
    assert.deepEqual([stored.weaponUid, stored.bag.items.find(i => i.uid === 'eq-carbine')!.gun], [shotgun.uid, fitted()]);
    // Swapping back restores the carbine slot with its parts; the shotgun returns to the bag as itself.
    assert.equal(r.runtime.equipItem('eq-carbine'), 'committed');
    assert.deepEqual([r.state.loadout!.weaponUid, r.state.loadout!.gun], ['eq-carbine', fitted()]);
    assert.ok(r.state.loadout!.bag.items.some(i => i.uid === shotgun.uid));
});

test('extraction brings the equipped instance home; death loses it and keeps the safe\'s gun as itself', () => {
    for (const outcome of ['extract', 'death'] as const) {
        const r = raid(l => {
            Object.assign(l, { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 5, ammoRelief: 0 });
            l.safe.items = [gunItem('safe-pistol', 'pistol', 0, 0)];
        });
        r.runtime.finish(outcome); assert.equal(r.runtime.settlement.committed, true, outcome); r.runtime.dispose();
        const home = r.record.profile;
        assert.deepEqual(home.safe.items.map(i => [i.uid, i.gun]), [['safe-pistol', { parts: [], devices: { laser: false, light: false } }]], outcome);
        if (outcome === 'extract') assert.deepEqual([home.equipment.weaponUid, home.equipment.gun, home.equipment.ammo], ['eq-carbine', fitted(), 5]);
        else assert.deepEqual([home.equipment.weapon, home.equipment.weaponUid, home.equipment.gun], [null, null, null]);
    }
});
