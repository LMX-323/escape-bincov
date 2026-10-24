import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../src/domain';
import { GUNS } from '../src/gunsmith/catalog';
import { isGunId } from '../src/gunsmith/instance';

// #28 M2-01: G17 and M4A1 are real guns, and every "is it a gun" check reads one answer, D.isGun.

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path.split('\\').join('/')] : [];
});

test('one answer to "is it a gun": the WEAPONS rows but the knife, each a catalog gun and a weapon item', () => {
    const guns = Object.keys(D.WEAPONS).filter(id => D.isGun(id));
    assert.deepEqual(guns, ['pistol', 'shotgun', 'carbine', 'gb17', 'mb4a1']);
    // Every weapon item but the knife is a gun, and nothing else is.
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => D.ITEMS[id].kind === 'weapon' && id !== 'knife'), guns);
    // Each is a catalog gun, so the gunsmith rules (instances, stats, saves) can read it.
    for (const id of guns) assert.ok(isGunId(id), id);
    // The knife, enemy weapon looks, the retired #39 sample id, catalog guns that are no items yet and odd values are not.
    for (const id of ['knife', 'rifle', 'club', 'claw', 'm4a1', 'mpb5', 'akb74', 'ammo9', 'toString', '__proto__', '', null, undefined, ['pistol'], 7])
        assert.equal(D.isGun(id), false, String(id));
});

test('G17 and M4A1 are items and weapons made from the catalog: stats, name, footprint, weight and prices', () => {
    for (const id of ['gb17', 'mb4a1'] as const) {
        const gun = GUNS[id], item = D.ITEMS[id];
        assert.deepEqual(D.WEAPONS[id], gun.stats, id);
        assert.notEqual(D.WEAPONS[id], gun.stats, `${id}: a copy, never the catalog's own object`);
        assert.deepEqual({ name: item.name, w: item.w, h: item.h, weight: item.weight, stack: item.stack, buy: item.buy, sell: item.sell, kind: item.kind },
            { name: gun.stats.name, w: gun.w, h: gun.h, weight: gun.weight, stack: 1, buy: gun.buy, sell: gun.sell, kind: 'weapon' }, id);
    }
    // Every gun's description states its factory capacity, the old three's included.
    for (const id of Object.keys(D.WEAPONS).filter(id => D.isGun(id))) assert.ok(D.ITEMS[id].description.includes(`${D.WEAPONS[id].magazine} 发`), id);
    // Born as factory instances wherever guns are born: a new item, the test driver, the range (gunsmith-readers.test.ts).
    const inv = D.createInventory(6, 5);
    assert.equal(D.addItem(inv, 'gb17'), 0); assert.equal(D.addItem(inv, 'mb4a1'), 0);
    for (const item of inv.items) assert.deepEqual(item.gun, { parts: [], devices: { laser: false, light: false } }, item.id);
    assert.deepEqual(inv.items.map(i => D.itemSize(i)), [{ w: 2, h: 1 }, { w: 4, h: 1 }]);
});

test('no "is it a gun" check outside the domain reads the weapon table or the catalog by itself', () => {
    for (const file of sources('src')) {
        if (file.startsWith('src/gunsmith/')) continue; // catalog membership is the gunsmith rules' own question
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/\bisGunId\(/g) ?? [], [], `${file}: use D.isGun`);
        assert.deepEqual(text.match(/WEAPONS\[[^\]]+\]\s*&&|hasOwn(?:StringKey)?\((?:D\.)?WEAPONS\b/g)?.filter(() => file !== 'src/domain.ts') ?? [], [], `${file}: use D.isGun`);
    }
    // The domain answers it once, from WEAPONS.
    assert.equal(readFileSync('src/domain.ts', 'utf8').match(/Object\.hasOwn\(WEAPONS,/g)?.length, 1);
});
