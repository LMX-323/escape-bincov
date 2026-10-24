import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { coneOf, driftOf, handlingOf, SAMPLE_GUNS } from '../src/shooting';
import { perkEffects, rpgMultipliers } from '../src/rpg';
import type { PerkId } from '../src/perks';
import { createRangeRaid, ShootingRange } from '../src/range/raid';
import { SaveSession, createSessionState } from '../src/session';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { arm, benchRaid, perkBench, type Bench } from './fixtures/shooting-bench';

// #28 M1-05: every reader of the equipped gun's numbers goes through the gunsmith entry (D.equippedGun and the
// effective stats). Nothing can modify the old three guns yet, so each reader must give exactly what it gave when it
// looked WEAPONS, handlingOf and ITEMS up by id. The oracles below are those old readers, copied from before M1-05.

const FACTORY = ['pistol', 'shotgun', 'carbine'] as const;
const integer = (value: unknown, fallback = 0, max = 1e9) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
const isGun = (id: unknown): id is string => typeof id === 'string' && id !== 'knife' && Object.hasOwn(D.WEAPONS, id);
/** The old domain cleanMagazine: the stored magazine clamped to WEAPONS[id].magazine. */
function oldClean(weaponId: unknown, current: unknown, relief: unknown): D.Magazine {
    const ammo = isGun(weaponId) ? integer(current, 0, D.WEAPONS[weaponId].magazine) : 0;
    return { ammo, ammoRelief: integer(relief, 0, ammo) };
}
/** The old domain reloadMagazine, by weapon id. */
function oldReload(weaponId: string, current: number, currentRelief: number, bag: D.Inventory): D.Magazine {
    const magazine = oldClean(weaponId, current, currentRelief);
    if (!isGun(weaponId)) return magazine;
    const weapon = D.WEAPONS[weaponId];
    for (const relief of [true, false]) for (const entry of bag.items) {
        if (entry.id !== weapon.ammo || !!entry.relief !== relief) continue;
        const take = Math.min(entry.qty, weapon.magazine - magazine.ammo);
        entry.qty -= take;
        magazine.ammo += take;
        if (relief) magazine.ammoRelief += take;
    }
    bag.items = bag.items.filter(entry => entry.qty > 0);
    return magazine;
}
/** The old CoastRaidRuntime.carriedWeight (no sample gun in hand), by the loadout's weapon id. */
function oldCarried(r: Bench['runtime']): number {
    const l = r.session.loadout!, w = D.WEAPONS[l.weapon || 'knife'];
    return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight
        + (w.ammo ? D.ITEMS[w.ammo].weight * r.mag : 0) + (r.layered?.charm ? D.ITEMS[r.layered.charm.id].weight : 0);
}

test('the equipped gun\'s build, weapon and weight: the old three read as from WEAPONS and ITEMS, through the gunsmith', () => {
    for (const id of FACTORY) {
        const slot = { weapon: id }, w = D.equippedWeapon(slot);
        assert.deepEqual(D.equippedGun(slot), { id, parts: [] });
        assert.deepEqual(w, D.WEAPONS[id]);
        assert.notEqual(w, D.WEAPONS[id], 'the effective stats, worked out fresh, not the table row');
        assert.equal(D.equippedWeight(slot), D.ITEMS[id].weight);
    }
    // No gun is the knife: its row, no weight. Neither the knife nor the #39 sample rifle is a catalog gun.
    for (const weapon of [null, 'knife']) {
        assert.equal(D.equippedGun({ weapon }), null);
        assert.equal(D.equippedWeapon({ weapon }), D.WEAPONS.knife);
        assert.equal(D.equippedWeight({ weapon }), 0);
    }
    assert.equal(D.equippedGun({ weapon: SAMPLE_GUNS.m4a1.id }), null);
});

test('reloads and stored magazines stop at the effective capacity exactly where they stopped at WEAPONS', () => {
    const bags: [string, number, boolean][][] = [[], [['ammo9', 40, false]], [['ammo9', 3, true], ['ammo9', 25, false]],
        [['shell', 7, false], ['shell', 2, true]], [['ammoR', 30, false], ['ammoR', 30, false], ['ammoR', 4, true]],
        [['ammo9', 9, false], ['shell', 9, false], ['ammoR', 9, false]]];
    const fill = (contents: [string, number, boolean][]) => {
        const bag = D.createInventory(6, 5); let n = 0;
        for (const [id, qty, relief] of contents) assert.equal(D.addItem(bag, id, qty, relief, false, true, () => `u${n++}`), 0);
        return bag;
    };
    let cases = 0;
    for (const weapon of [...FACTORY, 'knife', null]) for (const current of [-3, 0, 1, 2, 7, 8, 12, 30, 2.5, NaN])
        for (const relief of [0, 1, 5, 99]) for (const contents of bags) {
            const was = fill(contents), now = fill(contents), at = `${weapon} ${current} ${relief} ${JSON.stringify(contents)}`;
            assert.deepEqual(D.reloadMagazine({ weapon }, current, relief, now), oldReload(weapon || 'knife', current, relief, was), at);
            assert.deepEqual(now, was, at);
            cases++;
        }
    assert.equal(cases, 5 * 10 * 4 * 6);
    // A stored magazine reaches cleanMagazine through migrateSave: clamped to the capacity, relief to what is loaded.
    for (const id of FACTORY) for (const ammo of [0, 1, D.WEAPONS[id].magazine, D.WEAPONS[id].magazine + 1, 99]) for (const ammoRelief of [0, 1, 99]) {
        const { equipment } = D.migrateSave({ version: 2, equipment: { weapon: id, relief: false, ammo, ammoRelief } });
        assert.deepEqual({ ammo: equipment.ammo, ammoRelief: equipment.ammoRelief }, oldClean(id, ammo, ammoRelief), `${id} ${ammo} ${ammoRelief}`);
    }
});

test('the Runtime reads the effective stats: the old three fire, reload, weigh and show exactly as before', () => {
    const recoil: PerkId[] = ['technique-15-b', 'technique-20-b', 'technique-25-b', 'technique-30-b'];
    for (const b of [benchRaid(), perkBench(recoil, 30)]) {
        const r = b.runtime, perks = perkEffects(r.layered);
        for (const id of FACTORY) {
            arm(b, id);
            const w = r.currentWeapon, h = r.grip, row = D.WEAPONS[id];
            assert.deepEqual([w, h], [row, handlingOf(id)], id);
            assert.ok(w !== row && h !== handlingOf(id), `${id}: from the effective stats, not the tables`);
            // Worked out once per build: every read shares the same frozen objects.
            assert.ok(r.currentWeapon === w && r.grip === h && Object.isFrozen(w) && Object.isFrozen(h), id);
            // The reload perks still multiply once, on top.
            assert.equal(r.reloadTime, row.reload * perks.reload, id);
            assert.equal(r.carriedWeight(), oldCarried(r), id);
            // The HUD weapon card and the aim view read the same numbers.
            const hud = r.current().frame.hud, body = rpgMultipliers(r.layered!).recoil;
            assert.deepEqual(hud.weapon, { id, name: row.name, mag: row.magazine, magSize: row.magazine, reserve: D.count(r.session.loadout!.bag, row.ammo!), reloading: false }, id);
            assert.equal(hud.aim.cone, coneOf(r.handling, row, handlingOf(id), body), id);
            assert.equal(hud.aim.drift, driftOf(r.handling, handlingOf(id), body), id);
            // A full magazine does not reload; one round short does, for the perk-scaled time.
            r.startReload();
            assert.equal(r.reloadLeft, 0, id);
            b.driver.magazine(row.magazine - 1); r.startReload();
            assert.equal(r.reloadLeft, r.reloadTime, id);
            // The test driver takes 0 to the capacity, and a reload from empty takes from the bag what the old one took.
            assert.throws(() => b.driver.magazine(row.magazine + 1), /Invalid magazine fixture/);
            b.driver.magazine(0);
            const bag = structuredClone(r.session.loadout!.bag), expected = oldReload(id, 0, 0, bag);
            r.loadMagazine();
            assert.deepEqual([{ ammo: r.mag, ammoRelief: r.magRelief }, r.session.loadout!.bag], [expected, bag], id);
            assert.equal(r.mag, row.magazine, id);
        }
        // The knife and the #39 sample rifle keep their own tables.
        const s = r.snapshot(); s.knife = true; r.restore(s);
        assert.ok(r.currentWeapon === D.WEAPONS.knife && r.grip === handlingOf('knife'));
        b.driver.sampleGun('m4a1');
        assert.ok(r.currentWeapon === SAMPLE_GUNS.m4a1 && r.grip === handlingOf('m4a1') && r.weaponLook === 'rifle');
        b.driver.sampleGun(null);
        assert.deepEqual(r.currentWeapon, D.WEAPONS.carbine);
    }
});

test('the range hands each gun a full magazine of its effective capacity', () => {
    const raid = createRangeRaid(), range = new ShootingRange(raid.core);
    for (const id of FACTORY) {
        range.arm(id);
        assert.deepEqual([raid.core.currentWeapon, raid.core.mag], [D.WEAPONS[id], D.WEAPONS[id].magazine], id);
    }
    assert.equal(raid.saves.persist(), true, 'the armed range still checkpoints');
});

test('the base departure weight weighs the equipped gun through the gunsmith entry, exactly as ITEMS did', () => {
    const now = 1800000000000, data = new Map<string, string>();
    const state = createSessionState(), saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }), undefined, () => now);
    assert.ok(saves.initialize());
    const hideout = new RealHideoutRuntime(state, saves, () => now, () => true);
    assert.equal(hideout.enter().ok, true);
    for (const weapon of [...FACTORY, null]) {
        const ticket = saves.prepareExpansionMutation(d => { d.profile.equipment = { weapon, relief: false, ammo: weapon ? D.WEAPONS[weapon].magazine : 0, ammoRelief: 0 }; });
        assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
        const p = hideout.snapshot().profile, w = D.WEAPONS[p.equipment.weapon || 'knife'], charm = state.expansion?.charm;
        assert.equal(p.equipment.weapon, weapon);
        const old =D.weight(p.bag) + D.weight(p.safe) + D.ITEMS.knife.weight + (p.equipment.weapon ? D.ITEMS[p.equipment.weapon].weight : 0)
            + (w.ammo ? D.ITEMS[w.ammo].weight * p.equipment.ammo : 0) + (charm ? D.ITEMS[charm.id].weight : 0);
        assert.equal(hideout.departure().weight, old, String(weapon));
    }
});

test('the raid readers no longer look the held gun up by id', () => {
    // The knife's own row (WEAPONS.knife) and the sample's (SAMPLE_GUNS, handlingOf) stay; a gun goes through D.equippedGun.
    // Before M1-05 this found five WEAPONS lookups and the gun's ITEMS weight in these files.
    for (const file of ['src/raid-runtime/runtime.ts', 'src/raid-runtime/presentation.ts', 'src/raid-runtime/test-support.ts', 'src/range/raid.ts']) {
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/WEAPONS\[[^\]]*\]|ITEMS\[[\w.!]*\.weapon\]/g) ?? [], [], file);
    }
});
