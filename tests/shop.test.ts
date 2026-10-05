import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import * as S from '../src/shop';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY } from '../src/recovery-store';
function fixture() {
    const save = D.newSave(); save.stash.items = []; save.bag.items = []; save.safe.items = [];
    return save;
}
function buy(c: S.ShopCart, id: string, x = 0, y = 0) {
    assert.ok(S.moveShopItem(c, 'merchant', 'buy', c.catalog.items.find(i => i.id === id)!.uid, x, y));
}
function sell(c: S.ShopCart, id: string, x = 0, y = 0) {
    assert.ok(S.moveShopItem(c, 'stash', 'sell', c.stash.items.find(i => i.id === id)!.uid, x, y));
}
test('cart conserves goods before checkout; pack return and sale return cancel without touching save', () => {
    const save = fixture(); D.addItem(save.stash, 'watch', 2); const before = structuredClone(save), c = S.createCart(save, 'arms');
    buy(c, 'ammo9'); sell(c, 'watch'); assert.deepEqual(save, before);
    assert.ok(S.moveShopItem(c, 'buy', 'merchant', c.buy.items[0].uid, 999, 999));
    assert.ok(S.moveShopItem(c, 'sell', 'stash', c.sell.items[0].uid, 0, 0));
    assert.equal(S.cartDirty(c), false); assert.deepEqual(save, before);
    assert.match(S.shopPlacementError(c, 'merchant', 'stash', c.catalog.items[0].uid, 0, 0)!, /待买/);
});
test('net settlement allows sale to finance the purchase and free its storage space', () => {
    const save = fixture(); save.cash = 0; save.stash = D.createInventory(1, 1); D.addItem(save.stash, 'watch');
    const c = S.createCart(save, 'arms'); sell(c, 'watch'); buy(c, 'ammo9');
    assert.equal(S.settleCart(save, c), true); assert.equal(save.cash, 156); assert.equal(D.count(save.stash, 'ammo9'), 12);
    assert.equal(S.settleCart(save, c), false, 'A stale cart cannot be settled twice');
});
test('insufficient cash or space rejects every purchase and sale', () => {
    for (const cash of [0, 5000]) {
        const save = fixture(); save.cash = cash; save.stash = D.createInventory(1, 1); D.addItem(save.stash, 'scrap');
        const c = S.createCart(save, 'arms'); sell(c, 'scrap'); buy(c, 'shotgun'); const before = structuredClone(save);
        assert.equal(S.settleCart(save, c), false); assert.deepEqual(save, before);
    }
});
test('quest warning uses whole transaction totals, includes carried supplies and excludes finished quests', () => {
    const save = fixture(); D.addItem(save.stash, 'scrap', 3); const c = S.createCart(save, 'arms'); sell(c, 'scrap');
    assert.deepEqual(S.saleWarnings(save, c), [{ quest: D.QUESTS.repair.name, id: 'scrap', needed: 3, sold: 3, remaining: 0 }]);
    buy(c, 'scrap'); D.addItem(save.safe, 'scrap', 2); assert.deepEqual(S.saleWarnings(save, c), []);
    save.safe.items = []; save.quests.repair = true; assert.deepEqual(S.saleWarnings(save, c), []);
});
test('relief, malformed pack and changed stash cannot be sold or settled', () => {
    const save = fixture(); D.addItem(save.stash, 'ammo9', 12, true); const c = S.createCart(save, 'arms');
    assert.match(S.shopPlacementError(c, 'stash', 'sell', c.stash.items[0].uid, 0, 0)!, /不可出售/);
    buy(c, 'ammo9'); c.buy.items[0].qty = 13; const before = structuredClone(save);
    assert.equal(S.settleCart(save, c), false); assert.deepEqual(save, before);
    c.buy.items[0].qty = 12; D.addItem(save.stash, 'water'); assert.equal(S.settleCart(save, c), false);
});
test('save failure rolls back entire net transaction, retry writes exactly once and reload agrees', () => {
    const state = createSessionState(); let raw: string | null = null, fail = false, writes = 0;
    const session = new SaveSession(state, () => ({ getItem: k => k === SESSION_KEY ? raw : null, setItem: (_k, value) => { if (fail) throw Error('quota'); raw = value; writes++; } }));
    assert.ok(session.initialize()); state.state = 'hideout'; state.save = fixture(); D.addItem(state.save.stash, 'watch');
    assert.ok(session.persist()); const c = S.createCart(state.save, 'arms'); sell(c, 'watch'); buy(c, 'ammo9');
    const before = structuredClone(state.save), oldRaw = raw, oldWrites = writes; fail = true;
    assert.equal(session.mutate(() => S.settleCart(state.save, c)), 'save-failed'); assert.deepEqual(state.save, before); assert.equal(raw, oldRaw);
    fail = false; assert.equal(session.mutate(() => S.settleCart(state.save, c)), 'committed'); assert.equal(writes, oldWrites + 1);
    assert.deepEqual(JSON.parse(raw!).profile, state.save);
    assert.equal(session.mutate(() => S.settleCart(state.save, c)), 'rejected'); assert.equal(writes, oldWrites + 1);
});
