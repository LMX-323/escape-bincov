import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterCritChance, critChance, critMultiplier, isPerkId, perkLimitBonus, perkNode, snapshotChance, validPerkSelection,
    CRIT_SOURCE_IDS, PERK_IDS, PERK_TIERS, type CritSnapshot, type CritSource, type PerkId } from '../src/perks';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const level = (strength: number, constitution = 10, technique = 10) => ({ strength, constitution, technique });

test('the catalog has 24 stable ids on 12 nodes, two per node, in catalog order', () => {
    assert.equal(PERK_IDS.length, 24);
    assert.equal(new Set(PERK_IDS).size, 24);
    const nodes = new Map<string, string[]>();
    for (const id of PERK_IDS) {
        const { attribute, tier, side } = perkNode(id);
        assert.equal(`${attribute}-${tier}-${side}`, id);
        assert.ok(PERK_TIERS.includes(tier));
        nodes.set(`${attribute}-${tier}`, [...nodes.get(`${attribute}-${tier}`) ?? [], side]);
    }
    assert.equal(nodes.size, 12);
    for (const sides of nodes.values()) assert.deepEqual(sides, ['a', 'b']);
    for (const bad of ['', 'toString', '__proto__', 'constructor', 'strength-10-a', 'luck-15-a', 'strength-15-c', 7, null, ['strength-15-a']])
        assert.equal(isPerkId(bad), false, String(bad));
});

test('a stored selection needs known ids in catalog order, one per node and a permanent level at the tier', () => {
    assert.ok(validPerkSelection([], level(10)));
    assert.ok(validPerkSelection(['strength-30-b'], level(30)), 'a higher tier may be chosen first');
    assert.ok(validPerkSelection(['strength-15-a', 'strength-20-b', 'constitution-15-b', 'technique-30-a'], level(20, 15, 30)));
    const all = PERK_IDS.filter(id => id.endsWith('-a'));
    assert.ok(validPerkSelection(all, level(30, 30, 30)));
    for (const [perks, why] of [
        [['strength-15-a', 'strength-15-b'], 'both sides of one node'],
        [['strength-20-a', 'strength-15-a'], 'out of catalog order'],
        [['strength-15-a', 'strength-15-a'], 'repeated'],
        [['strength-20-a'], 'permanent 19 is below tier 20'],
        [['unknown-15-a'], 'unknown id'],
        [['toString'], 'prototype name'],
        ['strength-15-a', 'not an array'],
        [[...all, 'technique-30-b'], 'more than 12'],
    ] as const) assert.equal(validPerkSelection(perks, level(19, 30, 30)), false, why);
    assert.equal(validPerkSelection(['strength-15-a'], level(14.99)), false, 'only the permanent integer unlocks');
    assert.equal(validPerkSelection(['strength-15-a'], level(NaN)), false);
});

test('limit bonuses add, and at effective attribute 40 reach hp 210, stamina 180 and carry 52 kg', () => {
    assert.deepEqual(perkLimitBonus([]), { hp: 0, stamina: 0, carry: 0 });
    const bonus = perkLimitBonus(['strength-15-a', 'strength-20-b', 'strength-30-a', 'constitution-15-a']);
    assert.deepEqual(bonus, { hp: 20, stamina: 20, carry: 10 });
    // The attribute formulas of derivedLimits at 40, plus the bonuses.
    assert.equal(100 + 3 * 30 + bonus.hp, 210);
    assert.equal(100 + 2 * 30 + bonus.stamina, 180);
    assert.ok(near(24 + .6 * 30 + bonus.carry, 52));
});

test('independent sources multiply their miss chances: the design examples', () => {
    const source = (id: CritSource['id'], chance: number): CritSource => ({ id, chance });
    const tech = (t: number) => source('character', characterCritChance(t));
    assert.ok(near(critChance([source('technique-15-a', .3), source('focus', .3)]), .51));
    assert.ok(near(critChance([source('technique-15-a', .3), source('focus', .3), source('technique-30-a', .1)]), .559));
    assert.ok(near(critChance([tech(10), source('weapon', .05)]), .069));
    assert.ok(near(critChance([tech(10), source('weapon', .03)]), .0494));
    assert.ok(near(critChance([tech(10), source('weapon', .08)]), .0984));
    assert.ok(near(critChance([tech(10), source('weapon', .08), source('technique-15-a', .3)]), .36888));
    assert.ok(near(critChance([tech(10), source('weapon', .08), source('technique-15-a', .3), source('focus', .05)]), .400436));
    assert.ok(near(critChance([tech(15), source('weapon', .08), source('technique-15-a', .3)]), .37371));
    assert.ok(near(critChance([tech(15), source('weapon', .08), source('technique-15-a', .3), source('focus', .05)]), .4050245));
    assert.ok(near(characterCritChance(1), .0065));
    assert.equal(characterCritChance(-100), 0);
    // Order does not matter; a repeated id with the same chance counts once.
    const set = [tech(12), source('weapon', .08), source('technique-20-a', .05), source('focus', .05)];
    assert.ok(near(critChance(set), critChance([...set].reverse())));
    assert.equal(critChance([...set, source('focus', .05)]), critChance(set));
    assert.equal(critChance([]), 0);
    assert.equal(critChance([source('weapon', 1), source('focus', .2)]), 1);
    assert.ok(critChance(CRIT_SOURCE_IDS.map(id => source(id, .99))) < 1);
});

test('invalid sources throw instead of counting as zero or certain', () => {
    for (const bad of [[{ id: 'weapon', chance: NaN }], [{ id: 'weapon', chance: Infinity }], [{ id: 'weapon', chance: -.01 }],
        [{ id: 'weapon', chance: 1.01 }], [{ id: 'toString', chance: .1 }], [{ id: 'luck', chance: .1 }],
        [{ id: 'focus', chance: .05 }, { id: 'focus', chance: .1 }]])
        assert.throws(() => critChance(bad as CritSource[]), /命中参数无效/);
});

test('a snapshot keeps the breath source only for the enemy it was charged on', () => {
    const perks: PerkId[] = ['technique-15-a', 'technique-25-a'];
    const snapshot: CritSnapshot = { multiplier: critMultiplier(perks), target: 'entity-r-7',
        sources: [{ id: 'character', chance: .02 }, { id: 'weapon', chance: .08 }, { id: 'technique-15-a', chance: .3 }] };
    assert.equal(snapshot.multiplier, 1.7);
    assert.equal(critMultiplier([]), 1.5);
    assert.ok(near(snapshotChance(snapshot, 'entity-r-7'), 1 - .98 * .92 * .7));
    assert.ok(near(snapshotChance(snapshot, 'entity-r-8'), 1 - .98 * .92));
    assert.ok(near(snapshotChance({ ...snapshot, target: null }, 'entity-r-7'), 1 - .98 * .92));
});
