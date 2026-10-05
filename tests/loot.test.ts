import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { placementError } from '../src/loot';

function inventory(id: string, qty = 1, w = 6, h = 5, relief = false): D.Inventory {
    const inv = D.createInventory(w, h);
    assert.equal(D.addItem(inv, id, qty, relief), 0);
    return inv;
}

test('exact placement validates the complete footprint without changing either inventory', () => {
    const source = inventory('shotgun'), target = D.createInventory(6, 5), uid = source.items[0].uid;
    const before = structuredClone({ source, target });
    assert.equal(placementError(source, target, uid, 3, 4), null);
    for (const [x, y] of [[4, 4], [-1, 0], [0, 5]]) assert.match(placementError(source, target, uid, x, y)!, /边界/);
    for (const [x, y] of [[0.5, 0], [0, NaN], [Infinity, 0]]) assert.match(placementError(source, target, uid, x, y)!, /有效/);
    assert.match(placementError(source, D.createInventory(2, 2), uid, 0, 0)!, /边界/);
    assert.deepEqual({ source, target }, before);
});

test('full inventory rejects a chosen slot even when the source could stack elsewhere', () => {
    const source = inventory('ammo9', 5), target = D.createInventory(2, 1);
    D.addItem(target, 'sample'); D.addItem(target, 'ammo9', 2);
    assert.match(placementError(source, target, source.items[0].uid, 0, 0)!, /其他物品/);
    assert.equal(placementError(source, target, source.items[0].uid, 1, 0), null);
    const before = structuredClone({ source, target });
    assert.match(placementError(source, target, 'consumed-uid', 1, 0)!, /重新选择/);
    assert.deepEqual({ source, target }, before);
});

test('whole stacks merge only at their exact origin and never exceed the stack limit', () => {
    const source = inventory('water'), target = inventory('water', 1, 2, 3), uid = source.items[0].uid;
    assert.equal(placementError(source, target, uid, 0, 0), null);
    assert.match(placementError(source, target, uid, 0, 1)!, /其他物品/);
    target.items[0].qty = 2;
    assert.match(placementError(source, target, uid, 0, 0)!, /堆叠上限为 2/);
    const ammo = inventory('ammo9', 8), almostFull = inventory('ammo9', 33);
    assert.match(placementError(ammo, almostFull, ammo.items[0].uid, 0, 0)!, /整组/);
    assert.equal(ammo.items[0].qty, 8);
    assert.equal(almostFull.items[0].qty, 33);
});

test('relief identity is preserved for both accepted and refused stacks', () => {
    const source = inventory('ammo9', 12, 6, 5, true), target = inventory('ammo9', 8);
    const uid = source.items[0].uid;
    assert.match(placementError(source, target, uid, 0, 0)!, /救济/);
    target.items[0].relief = true;
    assert.equal(placementError(source, target, uid, 0, 0), null);
    assert.equal(placementError(source, target, uid, 1, 0), null);
});

test('same-inventory rearrangement can overlap its old footprint but cannot overlap other items', () => {
    const inv = inventory('shotgun'), uid = inv.items[0].uid;
    assert.equal(placementError(inv, inv, uid, 1, 0), null);
    D.addItem(inv, 'sample');
    assert.match(placementError(inv, inv, uid, 1, 0)!, /其他物品/);
    assert.equal(placementError(inv, inv, uid, 0, 1), null);
    const stack = inventory('ammo9', 45);
    stack.items[0].qty = 30;
    assert.equal(placementError(stack, stack, stack.items[1].uid, 0, 0), null);
});

test('missing items, malformed quantities and duplicate identities are rejected', () => {
    const source = inventory('pearl'), target = D.createInventory(6, 5), uid = source.items[0].uid;
    assert.match(placementError(source, target, 'gone', 0, 0)!, /重新选择/);
    for (const qty of [0, -1, 0.5, 4, NaN]) {
        source.items[0].qty = qty;
        assert.match(placementError(source, target, uid, 0, 0)!, /数据无效/);
    }
    source.items[0].qty = 1;
    target.items.push({ ...source.items[0], x: 2 });
    assert.match(placementError(source, target, uid, 0, 0)!, /标识冲突/);
    target.items = [];
    source.items.push({ ...source.items[0], x: 1 });
    assert.match(placementError(source, target, uid, 0, 0)!, /标识冲突/);
});
