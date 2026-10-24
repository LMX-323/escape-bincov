import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { RecoveryStore, SESSION_KEY, decodeSession, type SessionRecord } from '../src/recovery-store';
import { decodeBackup, decodePortableBackup, encodeBackup, encodeRecoveryBackup } from '../src/save-backup';
import { decodeStoredProfile } from '../src/profile-codec';
import { entityUid, type WorldResolver } from '../src/expansion-state';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { freshStartRecord } from '../src/fresh-start';
import { GUNS } from '../src/gunsmith/catalog';
import { factoryState, isGunId, validateGun } from '../src/gunsmith/instance';
import { OLD_GUNS, migrateProfile, migrateRecord, type ProfileV3, type RecordV6, type StoredEquipment, type StoredItem,
    type StoredLoot } from '../src/gunsmith/migrate';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

// M0-06 (docs/gunsmith/CONTRACTS.md, the save and migration section): the pure migration to profile v3 / record v6,
// proven on samples made by the real save flows. Not wired in, so today's decoders also stand in for the old client.
const NOW = 1800000000000;
const REFUSED = /存档格式不支持或内容不完整/;
function origin() {
    const data = new Map<string, string>(), failing = new Set<string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); } };
    return { data, failing, storage };
}
type Origin = ReturnType<typeof origin>;
/** One page on the origin, as perk-save.test.ts builds it: SaveSession and the yard Runtime; `enter` walks into the station. */
function page(o: Origin = origin(), enter = true, resolve?: WorldResolver) {
    const state = createSessionState(), saves = new SaveSession(state, () => o.storage, resolve, () => NOW);
    const initialized = saves.initialize();
    const runtime = new RealHideoutRuntime(state, saves, () => NOW);
    if (enter) assert.ok(runtime.enter().ok);
    const setup = (action: (draft: ExpansionDraft) => void) => {
        const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    };
    return { o, state, saves, runtime, setup, initialized, get raw() { return o.data.get(SESSION_KEY)!; } };
}
/** Guns wherever a profile keeps them: a rotated carbine and a relief pistol stored, a shotgun and rifle rounds (5 of them relief) carried, a pistol in the safe, a carbine equipped. */
function armed(d: ExpansionDraft) {
    const s = d.profile;
    s.cash = 4321; s.quests.repair = true;
    s.equipment = { weapon: 'carbine', relief: false, ammo: 0, ammoRelief: 0 };
    for (const [inv, id, qty, relief, rotated] of [[s.stash, 'carbine', 1, false, true], [s.stash, 'pistol', 1, true, false], [s.bag, 'shotgun', 1, false, false],
        [s.bag, 'ammoR', 5, true, false], [s.bag, 'ammoR', 20, false, false], [s.safe, 'pistol', 1, false, false]] as const) {
        assert.equal(D.addItem(inv, id, qty, relief, rotated), 0, id);
    }
}
/** The armed profile in a live building raid (session v5, raid v3), with a shotgun dropped on the ground and a relief pistol put in a crate. */
function liveRaid(o: Origin = origin()) {
    const p = page(o); p.setup(armed);
    const deployed = p.runtime.deploy({ world: 'buildings', seed: 'gunsmith-m0-06' });
    assert.ok(deployed.ok); assert.ok(p.runtime.startRaid(deployed.runId!).ok);
    p.setup(d => {
        const raid = d.expansion.raid!, here = raid.maps[raid.currentMap];
        here.loot.push({ uid: entityUid(raid, raid.nextEntity++), id: 'shotgun', qty: 1, relief: false, x: raid.player.x, y: raid.player.y });
        const crate = Object.values(raid.maps).flatMap(m => m.containers).find(c => !D.addItem(structuredClone(c.inventory), 'pistol'))!;
        assert.equal(D.addItem(crate.inventory, 'pistol', 1, true, false, true, () => entityUid(raid, raid.nextEntity++)), 0);
    });
    return p;
}
/** The live raid extracted and written: a settled v5 record with its terminal result. */
function settled() {
    const p = liveRaid();
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.ok(p.saves.retrySettlement());
    return p;
}
/** The armed profile in a live classic raid, with a relief carbine on the ground and a shotgun in a crate of the checkpoint. */
function classicRaid() {
    const p = page(); p.setup(armed);
    assert.ok(p.runtime.deploy({ world: 'coast', seed: 'gunsmith-m0-06-coast' }).ok);
    const c = structuredClone(p.state.checkpoint!);
    c.loot.push({ uid: 'loot-900', id: 'carbine', qty: 1, relief: true, x: c.player.x, y: c.player.y });
    assert.equal(D.addItem(c.containers![0].inventory, 'shotgun'), 0);
    assert.ok(p.saves.persist(p.state.save, c));
    return p;
}
/** A record the previous client (session v4) wrote for the same state: expansion and raid v2, no perks (perk-save.test.ts). */
function asV4(text: string): string {
    const r = JSON.parse(text); assert.equal(r.version, 5); assert.deepEqual(r.expansion.growth.perks, []);
    r.version = 4; delete r.perksBackup; r.expansion.version = 2; delete r.expansion.growth.perks;
    if (r.expansion.raid) r.expansion.raid.version = 2;
    return JSON.stringify(r);
}
/** The M0 prototype raid: session v4 with expansion and raid v1, on the test world. */
function prototypeRecord() {
    const world = prototypeWorld(), resolve: WorldResolver = id => id === world.id ? world : undefined;
    const p = page(origin(), false, resolve); assert.ok(p.saves.enableExpansion(1000));
    p.setup(d => { prototypeRaid(d.profile, world, d.expansion); });
    return { p, resolve };
}
/** Every object that holds a gun or could: items and ground loot (an id and a qty) and equipped slots (a weapon and ammoRelief). */
function holders(value: unknown, out = { items: [] as any[], slots: [] as any[] }) {
    if (Array.isArray(value)) value.forEach(v => holders(v, out));
    else if (value && typeof value === 'object') {
        const o = value as any;
        if (Object.hasOwn(o, 'weapon') && Object.hasOwn(o, 'ammoRelief')) out.slots.push(o);
        else if (Object.hasOwn(o, 'id') && Object.hasOwn(o, 'qty')) out.items.push(o);
        Object.values(o).forEach(v => holders(v, out));
    }
    return out;
}
/** Takes away every field the migration adds to holders. */
function withoutGuns<T>(value: T): T {
    const copy = structuredClone(value), h = holders(copy);
    for (const item of h.items) delete item.gun;
    for (const slot of h.slots) { delete slot.weaponUid; delete slot.gun; }
    return copy;
}
function unmigrate(record: RecordV6, version: SessionRecord['version']): SessionRecord {
    const copy: any = withoutGuns(record);
    delete copy.gunsBackup; copy.version = version; copy.profile.version = 2;
    return copy;
}
const unmigrateProfile = (profile: ProfileV3): D.SaveDataV1 => ({ ...withoutGuns(profile), version: 2 }) as D.SaveDataV1;
const envelope = (record: { version: number }) => JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: record.version, record });
const settledFile = (save: ProfileV3) => JSON.stringify({ format: 'escape-bincov-backup', formatVersion: 3, createdAt: new Date(NOW).toISOString(), save }, null, 2);
const factory = (gun: unknown, why = '') => assert.deepEqual(gun, factoryState(), why);
const slotOf = (equipment: D.Equipment) => equipment as StoredEquipment;
const itemOf = (item: D.Item) => item as StoredItem;

/**
 * The proof every sample goes through: lossless (taking the added fields away gives the decoded record back), every gun
 * a factory instance under its own uid, the equipped gun given `equipped`, the old bytes kept as gunsBackup, today's
 * client refusing the result, and the migration idempotent and deterministic.
 */
function prove(name: string, text: string, resolve?: WorldResolver, equipped = ['gun-v6']) {
    const before = decodeSession(text, resolve), after = migrateRecord(before, text);
    assert.deepEqual([after.version, after.profile.version, after.gunsBackup], [6, 3, text], name);
    assert.deepEqual(unmigrate(after, before.version), before, `${name}: nothing but the gun fields changes`);
    const was = holders(before), now = holders(after);
    assert.equal(now.items.length, was.items.length, name);
    assert.ok(now.items.some(i => isGunId(i.id)) || now.slots.some(s => s.weapon !== null), `${name} holds guns`);
    for (const item of now.items) {
        if (!isGunId(item.id)) { assert.equal(Object.hasOwn(item, 'gun'), false, `${name} ${item.id}`); continue; }
        factory(item.gun, `${name} ${item.uid}`); assert.deepEqual(validateGun(item.id, item.uid, item.gun), { ok: true });
    }
    for (const slot of now.slots) {
        if (slot.weapon === null) { assert.deepEqual([slot.weaponUid, slot.gun], [null, null], name); continue; }
        factory(slot.gun, name); assert.deepEqual(validateGun(slot.weapon, slot.weaponUid, slot.gun), { ok: true });
    }
    assert.deepEqual(now.slots.filter(s => s.weapon !== null).map(s => s.weaponUid), equipped, name);
    // The exact old bytes stay; today's client (records 2..5, backups 2..5) refuses the new record both ways.
    assert.deepEqual(decodeSession(after.gunsBackup!, resolve), before, name);
    assert.throws(() => decodeSession(JSON.stringify(after), resolve), /无法读取这份存档/, name);
    assert.throws(() => decodePortableBackup(envelope(after), resolve), /不兼容的版本/, name);
    // Idempotent (the v6 record comes back equal, whatever bytes are offered) and deterministic.
    assert.deepEqual(migrateRecord(after, null), after, name); assert.deepEqual(migrateRecord(after, 'other bytes'), after, name);
    assert.equal(JSON.stringify(migrateRecord(decodeSession(text, resolve), text)), JSON.stringify(after), name);
    return { before, after };
}

test('the old guns are exactly the guns that were items before the catalog', () => {
    assert.deepEqual([...OLD_GUNS].sort(), Object.keys(D.WEAPONS).filter(id => id !== 'knife').sort());
    for (const id of OLD_GUNS) { assert.ok(isGunId(id) && Object.hasOwn(D.ITEMS, id)); assert.deepEqual(GUNS[id].stats, D.WEAPONS[id]); }
    assert.ok(Object.keys(GUNS).filter(id => Object.hasOwn(D.ITEMS, id)).every(id => OLD_GUNS.includes(id as never)));
});

test('a fresh save: the starter pistol becomes a factory instance in the profile, the new-game record, the station record and a fresh start', () => {
    const save = D.newSave(), v3 = migrateProfile(save);
    assert.equal(v3.version, 3); assert.equal(v3.equipment.weaponUid, 'gun-v6'); factory(v3.equipment.gun);
    assert.deepEqual(unmigrateProfile(v3), save); assert.deepEqual(migrateProfile(v3), v3);
    const o = origin(), newGame = page(o, false);
    assert.equal(JSON.parse(newGame.raw).version, 3);
    const { before, after } = prove('new game, session v3', newGame.raw);
    assert.equal(Object.hasOwn(after, 'expansion'), false);
    assert.deepEqual(after.profile, migrateProfile(before.profile), 'the same save migrates the same way inside and outside a record');
    assert.equal(JSON.parse(page().raw).version, 5);
    prove('first station entry, session v5', page().raw);
    prove('fresh start, session v5', JSON.stringify(freshStartRecord(.35, NOW)));
});

test('an old settled save: guns everywhere become factory instances; cash, places, rotation, relief, magazine and the result stay', () => {
    const p = settled(), { before, after } = prove('settled v5', p.raw), b = before.profile, a = after.profile;
    assert.deepEqual([a.cash, a.activeRun, a.quests.repair], [4321, null, true]);
    assert.deepEqual(after.terminal, before.terminal); assert.equal(after.terminal!.outcome, 'extract');
    assert.deepEqual(a.lastResult, b.lastResult); assert.deepEqual(a.stats, b.stats);
    for (const name of ['stash', 'bag', 'safe'] as const) {
        assert.deepEqual(a[name].items.map(i => [i.uid, i.id, i.qty, i.x, i.y, i.relief, i.rotated]), b[name].items.map(i => [i.uid, i.id, i.qty, i.x, i.y, i.relief, i.rotated]), name);
    }
    const stored = a.stash.items.filter(i => isGunId(i.id)).map(itemOf);
    assert.deepEqual(stored.map(i => [i.id, !!i.rotated, !!i.relief]), [['carbine', true, false], ['pistol', false, true]]);
    stored.forEach(i => factory(i.gun));
    assert.deepEqual(itemOf(a.bag.items.find(i => i.id === 'shotgun')!).gun, factoryState());
    assert.deepEqual([D.count(a.bag, 'ammoR'), D.count(a.bag, 'shotgun'), D.count(a.safe, 'pistol')], [13, 1, 1]);
    // The extracted magazine keeps its count and its relief rounds; the gun got the one new uid.
    assert.deepEqual([a.equipment.weapon, a.equipment.ammo, a.equipment.ammoRelief, a.equipment.relief], ['carbine', 12, 5, false]);
    assert.equal(a.equipment.weaponUid, 'gun-v6'); factory(a.equipment.gun);
    assert.deepEqual(after.expansion, before.expansion);
});

test('old settled backups: the profile file and the recovery file give the same guns; today\'s client refuses both new files', () => {
    const p = settled(), file = encodeBackup(p.state.save), save = decodeBackup(file), v3 = migrateProfile(save);
    assert.equal(JSON.parse(file).formatVersion, 2);
    assert.deepEqual(unmigrateProfile(v3), save); assert.deepEqual(migrateProfile(v3), v3);
    assert.equal(v3.equipment.weaponUid, 'gun-v6');
    const recovery = decodePortableBackup(p.runtime.exportBackup());
    assert.equal(recovery.kind, 'session'); if (recovery.kind !== 'session') return;
    const { after } = prove('settled recovery backup', JSON.stringify(recovery.record));
    assert.deepEqual(after.profile, v3, 'the same save migrates the same way inside and outside a record');
    // Today's client: the v3 profile file, a bare v3 profile, and a v3 file labelled v2 are all refused.
    assert.throws(() => decodeBackup(settledFile(v3)), /不兼容的版本/);
    assert.throws(() => decodePortableBackup(settledFile(v3)), /不兼容的版本/);
    assert.throws(() => decodeBackup(JSON.stringify(v3)), REFUSED);
    assert.throws(() => decodeStoredProfile(v3), REFUSED);
    assert.throws(() => decodeBackup(settledFile(v3).replace('"formatVersion": 3', '"formatVersion": 2')), /不兼容的版本/);
    const target = page(), kept = target.raw;
    for (const text of [settledFile(v3), envelope(after)]) {
        const preview = target.runtime.previewImport(text);
        assert.equal(preview.ok, false); assert.equal(target.raw, kept);
    }
});

test('an active layered raid: loadout, carried guns, a gun on the ground and one in a crate; RNG, serials, clock and rules identity stay', () => {
    const p = liveRaid(), { before, after } = prove('live building raid v5', p.raw);
    const raid = after.expansion!.raid!, old = before.expansion!.raid!;
    assert.deepEqual([after.expansion!.version, raid.version], [3, 3]);
    assert.deepEqual([raid.rng, raid.nextEntity, raid.elapsed, raid.seed, raid.runId, raid.currentMap], [old.rng, old.nextEntity, old.elapsed, old.seed, old.runId, old.currentMap]);
    assert.deepEqual([slotOf(raid.loadout).weaponUid, raid.loadout.weapon, raid.loadout.ammo, raid.loadout.ammoRelief], ['gun-v6', 'carbine', 12, 5]);
    assert.deepEqual([slotOf(after.profile.equipment).weaponUid, after.profile.equipment.weapon], [null, null]);
    const ground = Object.values(raid.maps).flatMap(m => m.loot as StoredLoot[]).filter(l => isGunId(l.id));
    assert.ok(ground.some(l => l.id === 'shotgun' && l.uid.startsWith(`entity-${raid.runId}-`)));
    ground.forEach(l => factory(l.gun, l.uid));
    const crated = Object.values(raid.maps).flatMap(m => m.containers.flatMap(c => c.inventory.items.map(itemOf))).filter(i => i.id === 'pistol' && i.relief);
    assert.equal(crated.length, 1); factory(crated[0].gun);
    // The profile's safe mirrors the loadout's safe, gun state included.
    assert.deepEqual(after.profile.safe, raid.loadout.safe); assert.ok(raid.loadout.safe.items.map(itemOf).some(i => i.id === 'pistol' && i.gun));
    // The same raid written by the previous client (session v4, expansion and raid v2), and the M0 prototype raid (v1).
    const v4 = prove('live raid, session v4', asV4(p.raw)).after;
    assert.deepEqual([v4.expansion!.version, v4.expansion!.raid!.version, Object.hasOwn(v4, 'perksBackup'), Object.hasOwn(v4, 'systemsBackup')], [2, 2, false, true]);
    const proto = prototypeRecord(), v1 = prove('prototype raid, session v4', proto.p.raw, proto.resolve).after;
    assert.deepEqual([v1.expansion!.version, v1.expansion!.raid!.version, v1.expansion!.raid!.maps.downstairs.bullets.length], [1, 1, 2]);
});

test('an active classic raid: the checkpoint keeps its loadout, a relief carbine on the ground and a shotgun in a crate', () => {
    const p = classicRaid(), { before, after } = prove('live classic raid', p.raw);
    const c = after.raid!, old = before.raid!;
    assert.equal(after.expansion!.raid, null); assert.equal(after.expansion!.base.location, 'raid');
    assert.deepEqual([c.version, c.worldVersion, c.rng, c.nextEntity, c.elapsed, c.kills], [old.version, old.worldVersion, old.rng, old.nextEntity, old.elapsed, old.kills]);
    const carbine = (c.loot as StoredLoot[]).find(l => l.uid === 'loot-900')!;
    assert.equal(carbine.relief, true); factory(carbine.gun);
    const crated = c.containers!.flatMap(x => x.inventory.items.map(itemOf)).filter(i => i.id === 'shotgun');
    assert.ok(crated.length >= 1); crated.forEach(i => factory(i.gun));
    assert.deepEqual([slotOf(c.loadout).weaponUid, c.loadout.ammo, c.loadout.ammoRelief], ['gun-v6', 12, 5]);
    assert.deepEqual(after.profile.safe, c.loadout.safe);
});

test('a pending settlement exported while the write fails keeps its terminal record and settlement state', () => {
    const p = liveRaid();
    p.o.failing.add(SESSION_KEY);
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.equal(p.saves.retrySettlement(), false);
    const file = encodeRecoveryBackup(p.saves.backupRecord()!), recorded = JSON.stringify(JSON.parse(file).record);
    const { before, after } = prove('pending settlement', recorded);
    assert.deepEqual([after.terminal!.outcome, after.terminal!.reason, after.expansion!.base.location, after.expansion!.raid], ['extract', 'extract', 'settlement', null]);
    assert.deepEqual([after.profile.activeRun, after.raid], [null, null]); assert.deepEqual(after.profile.lastResult, before.profile.lastResult);
    assert.deepEqual([after.profile.equipment.ammo, after.profile.equipment.ammoRelief, after.profile.equipment.weaponUid], [12, 5, 'gun-v6']);
    // Through the file: decodePortableBackup gives the record that migrates to the same result.
    const portable = decodePortableBackup(file);
    assert.equal(portable.kind, 'session'); if (portable.kind !== 'session') return;
    assert.deepEqual(migrateRecord(portable.record, recorded), after);
});

test('a record carrying every earlier backup keeps them verbatim and adds its own bytes; a v2 record keeps its bytes once', () => {
    const o = origin(), legacy = { ...D.newSave(), version: 1, cash: 1842 } as unknown as D.SaveDataV1;
    assert.equal(D.addItem(legacy.stash, 'pistol', 1, false, false, false), 0);
    const legacyText = JSON.stringify(legacy);
    const v2Text = JSON.stringify({ format: 'escape-bincov-session', version: 2, revision: 3, savedAt: NOW - 5000, profile: legacy, raid: null, terminal: null, legacyBackup: legacyText });
    o.data.set(D.SAVE_KEY, legacyText); o.data.set(SESSION_KEY, v2Text);
    const p = page(o, false); assert.equal(p.initialized, true);
    const v3Text = p.raw; assert.ok(p.saves.enableExpansion(NOW));
    const v4Text = p.raw; assert.ok(p.runtime.enter().ok);
    const text = p.raw, { after } = prove('every backup, session v5', text);
    assert.deepEqual([JSON.parse(v3Text).version, JSON.parse(v4Text).version, JSON.parse(text).version], [3, 4, 5]);
    assert.deepEqual([after.legacyBackup, after.migrationBackup, after.systemsBackup, after.perksBackup, after.gunsBackup], [legacyText, v2Text, v3Text, v4Text, text]);
    assert.equal(after.profile.cash, 1842);
    // A v2 record: decodeSession turns it into v3 with its text as migrationBackup, and M1-02 passes null for gunsBackup.
    const v2 = decodeSession(v2Text), fromV2 = migrateRecord(v2, null);
    assert.deepEqual([v2.version, v2.migrationBackup, fromV2.migrationBackup, fromV2.gunsBackup], [3, v2Text, v2Text, null]);
    assert.deepEqual(unmigrate(fromV2, 3), v2);
    assert.ok(fromV2.profile.stash.items.map(itemOf).some(i => i.id === 'pistol' && i.gun));
    // The legacy key's profile takes the same path through domain migrateSave.
    const fromLegacy = migrateProfile(D.migrateSave(JSON.parse(legacyText)));
    assert.equal(fromLegacy.equipment.weaponUid, 'gun-v6'); assert.ok(fromLegacy.stash.items.map(itemOf).some(i => i.id === 'pistol' && i.gun));
});

test('deterministic and idempotent: the same text every time, no clock or random numbers, nothing new on a second run', () => {
    const text = liveRaid().raw, decoded = [0, 1, 2].map(() => decodeSession(text)), fresh = D.newSave();
    const random = Math.random, now = Date.now;
    let runs: string[];
    try {
        Math.random = () => { throw new Error('random'); }; Date.now = () => { throw new Error('clock'); };
        runs = decoded.map(r => JSON.stringify(migrateRecord(r, text)));
        const once = migrateRecord(decoded[0], text);
        assert.deepEqual(migrateRecord(migrateRecord(once, text), text), once);
        const profile = migrateProfile(fresh);
        assert.deepEqual(migrateProfile(migrateProfile(profile)), profile);
    } finally { Math.random = random; Date.now = now; }
    assert.equal(new Set(runs).size, 1);
    assert.deepEqual(decoded[0], decodeSession(text), 'the input is not changed');
});

test('the equipped gun\'s uid avoids every string already in the save', () => {
    const save = D.newSave();
    save.stash.items[0].uid = 'gun-v6'; assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-2');
    save.bag.items[0].uid = 'gun-v6-2'; assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-3');
    save.lastResult = { outcome: 'extract', kills: 0, keptValue: 0, lostValue: 0, message: 'gun-v6-3', seed: 1, recovered: false };
    assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-4', 'any string counts, not only uids');
    const record = decodeSession(liveRaid().raw), raid = record.expansion!.raid!;
    Object.values(raid.maps).flatMap(m => m.containers.flatMap(c => c.inventory.items))[0].uid = 'gun-v6';
    assert.equal(slotOf(migrateRecord(record, null).expansion!.raid!.loadout).weaponUid, 'gun-v6-2');
});

test('malformed and unknown inputs are refused, never repaired', () => {
    const save = D.newSave(), v3 = migrateProfile(save), text = liveRaid().raw, live = decodeSession(text), v6 = migrateRecord(live, text);
    const refuse = <T>(base: T, run: (value: T) => unknown, faults: [string, (value: any) => void][]) => {
        for (const [why, mutate] of faults) {
            const value = structuredClone(base); mutate(value);
            assert.throws(() => run(value), REFUSED, why);
        }
    };
    for (const value of [null, undefined, 'x', [], 5, {}]) {
        assert.throws(() => migrateProfile(value as never), REFUSED); assert.throws(() => migrateRecord(value as never, null), REFUSED);
    }
    for (const version of [0, 1, 4, '2', undefined]) assert.throws(() => migrateProfile({ ...save, version } as never), REFUSED, String(version));
    for (const version of [1, 2, 7, '5', null]) assert.throws(() => migrateRecord({ ...live, version } as never, text), REFUSED, String(version));
    refuse(save, migrateProfile, [
        ['an old item already holding a gun state', p => { p.stash.items.push({ uid: 'x1', id: 'pistol', qty: 1, x: 0, y: 5, gun: factoryState() }); }],
        ['an old slot holding a uid', p => { p.equipment.weaponUid = 'x1'; }],
        ['an old slot holding a gun state', p => { p.equipment.gun = null; }],
        ['a catalog gun no old save can hold', p => { p.stash.items.push({ uid: 'x1', id: 'gb17', qty: 1, x: 0, y: 5 }); }],
        ['an equipped catalog gun no old save can hold', p => { p.equipment.weapon = 'mb4a1'; }],
        ['an equipped knife', p => { p.equipment.weapon = 'knife'; }], ['the sample rifle', p => { p.equipment.weapon = 'm4a1'; }],
        ['a prototype name', p => { p.equipment.weapon = '__proto__'; }], ['no equipped field', p => { delete p.equipment.weapon; }],
        ['no stash', p => { delete p.stash; }], ['items not a list', p => { p.bag.items = {}; }], ['an item not an object', p => { p.safe.items.push(7); }],
        ['no equipment', p => { delete p.equipment; }], ['two items with one uid', p => { p.bag.items[1].uid = p.bag.items[0].uid; }],
        ['a gun sharing an item uid', p => { p.stash.items.push({ uid: p.bag.items[0].uid, id: 'shotgun', qty: 1, x: 0, y: 5 }); }],
    ]);
    refuse(v3, migrateProfile, [
        ['a gun item without its state', p => { p.stash.items.push({ uid: 'x1', id: 'pistol', qty: 1, x: 0, y: 5 }); }],
        ['another item with a gun state', p => { p.bag.items[0].gun = factoryState(); }],
        ['an equipped gun without a uid', p => { p.equipment.weaponUid = null; }],
        ['an equipped gun without a state', p => { p.equipment.gun = null; }],
        ['no gun, yet a uid', p => { Object.assign(p.equipment, { weapon: null, weaponUid: 'x1', gun: null }); }],
        ['a slot key missing', p => { delete p.equipment.weaponUid; }],
        ['an unknown part', p => { p.equipment.gun.parts.push({ uid: 'p1', id: 'Z99', slot: 'muzzle', relief: false, children: [] }); }],
        ['a part sharing an item uid', p => { p.equipment.gun.parts.push({ uid: p.bag.items[0].uid, id: 'M01', slot: 'muzzle', relief: false, children: [] }); }],
        ['a device on with nothing to switch', p => { p.equipment.gun.devices.laser = true; }],
    ]);
    const layer = (r: any) => r.expansion.raid.maps[r.expansion.raid.currentMap];
    const ground = (r: any) => layer(r).loot.find((l: any) => l.id === 'shotgun');
    const crate = (r: any) => Object.values(r.expansion.raid.maps).flatMap((m: any) => m.containers).find((c: any) => c.inventory.items.length) as any;
    refuse(live, r => migrateRecord(r, text), [
        ['another format', r => { r.format = 'escape-bincov-backup'; }], ['a v3 profile in an old record', r => { r.profile.version = 3; }],
        ['gunsBackup in an old record', r => { r.gunsBackup = null; }], ['v5 holding a v2 expansion', r => { r.expansion.version = 2; }],
        ['v4 holding a v3 expansion', r => { r.version = 4; }], ['v3 holding an expansion', r => { r.version = 3; }],
        ['v4 without an expansion', r => { r.version = 4; delete r.expansion; }], ['a null expansion', r => { r.expansion = null; }],
        ['an old ground gun holding a state', r => { ground(r).gun = factoryState(); }],
        ['an old crate item holding a state', r => { crate(r).inventory.items[0].gun = factoryState(); }],
        ['an old loadout holding a uid', r => { r.expansion.raid.loadout.weaponUid = 'x1'; }],
        ['a loadout gun no old save can hold', r => { r.expansion.raid.loadout.weapon = 'mb4a1'; }],
        ['ground loot not a list', r => { layer(r).loot = {}; }], ['a crate without its inventory', r => { delete crate(r).inventory; }],
        ['a map that is not an object', r => { r.expansion.raid.maps[r.expansion.raid.currentMap] = 5; }],
        ['a charm that is a gun', r => { r.expansion.charm = { uid: 'c1', id: 'pistol', qty: 1, x: 0, y: 0 }; }],
        ['a charm sharing a stored gun\'s uid', r => { r.expansion.charm = { uid: r.profile.stash.items.find((i: any) => i.id === 'carbine').uid, id: 'luckyCharm', qty: 1, x: 0, y: 0 }; }],
        ['a classic checkpoint that is not an object', r => { r.raid = 5; }],
    ]);
    assert.throws(() => migrateRecord(live, 5 as never), REFUSED, 'gunsBackup must be text or null');
    refuse(v6, r => migrateRecord(r, text), [
        ['no gunsBackup', r => { delete r.gunsBackup; }], ['gunsBackup not text', r => { r.gunsBackup = 5; }],
        ['a v2 profile', r => { r.profile.version = 2; }], ['a ground gun without its state', r => { delete ground(r).gun; }],
        ['a loadout gun with a part for another gun', r => { r.expansion.raid.loadout.gun.parts.push({ uid: 'p1', id: 'M11', slot: 'muzzle', relief: false, children: [] }); }],
        ['the mirrored safe losing a state', r => { delete r.profile.safe.items.find((i: any) => i.id === 'pistol').gun; }],
        ['two guns sharing a part uid', r => {
            const part = () => ({ uid: 'p-shared', id: 'M05', slot: 'muzzle', relief: false, children: [] });
            r.expansion.raid.loadout.gun.parts.push(part()); r.profile.stash.items.find((i: any) => i.id === 'carbine').gun.parts.push(part());
        }],
    ]);
    // The same additions are legal one at a time, so each refusal above is for the fault it names.
    const single = structuredClone(v6) as any;
    single.expansion.raid.loadout.gun.parts.push({ uid: 'p-shared', id: 'M05', slot: 'muzzle', relief: false, children: [] });
    assert.deepEqual(migrateRecord(single, null), single);
});

test('today\'s client refuses a v6 record in storage and keeps its bytes; a tab that was already open cannot overwrite it', () => {
    const o = origin(), open = page(o), v6 = JSON.stringify(migrateRecord(decodeSession(open.raw), open.raw));
    o.data.set(SESSION_KEY, v6);
    assert.throws(() => new RecoveryStore(o.storage).load(), /无法读取这份存档/);
    const reopened = page(o, false);
    assert.deepEqual([reopened.initialized, reopened.state.storageOK, o.data.get(SESSION_KEY) === v6], [false, false, true]);
    assert.equal(open.saves.setVolume(.2), false); assert.equal(open.state.conflict, true); assert.equal(o.data.get(SESSION_KEY), v6);
});
