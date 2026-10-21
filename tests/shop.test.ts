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
    const save = fixture(); D.addItem(save.stash, 'watch', 2); D.addItem(save.stash, 'scrap'); const before = structuredClone(save), c = S.createCart(save, 'arms');
    buy(c, 'ammo9'); sell(c, 'watch'); assert.deepEqual(save, before);
    assert.ok(S.moveShopItem(c, 'buy', 'merchant', c.buy.items[0].uid, 999, 999));
    assert.ok(S.moveShopItem(c, 'sell', 'stash', c.sell.items[0].uid, 0, 0));
    assert.equal(S.cartDirty(c), false); assert.deepEqual(save, before);
    assert.match(S.shopPlacementError(c, 'merchant', 'stash', c.catalog.items[0].uid, 0, 0)!, /待买/);
});
test('net settlement allows sale to finance the purchase and free its storage space', () => {
    const save = fixture(); save.cash = 0; save.stash = D.createInventory(1, 1); D.addItem(save.stash, 'watch');
    const c = S.createCart(save, 'arms'); sell(c, 'watch'); buy(c, 'ammo9');
    assert.equal(S.settleCartResult(save, c).ok, true); assert.equal(save.cash, 156); assert.equal(D.count(save.stash, 'ammo9'), 12);
    assert.equal(S.settleCartResult(save, c).ok, false, 'A stale cart cannot be settled twice');
});
test('insufficient cash or space rejects every purchase and sale', () => {
    for (const cash of [0, 5000]) {
        const save = fixture(); save.cash = cash; save.stash = D.createInventory(1, 1); D.addItem(save.stash, 'scrap');
        const c = S.createCart(save, 'arms'); sell(c, 'scrap'); buy(c, 'shotgun'); const before = structuredClone(save);
        assert.equal(S.settleCartResult(save, c).ok, false); assert.deepEqual(save, before);
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
    assert.equal(S.settleCartResult(save, c).ok, false); assert.deepEqual(save, before);
    c.buy.items[0].qty = 12; D.addItem(save.stash, 'water'); assert.equal(S.settleCartResult(save, c).ok, false);
});
test('shopQuote prices the trading side by whole pack or stack and agrees with cart totals', () => {
    const save = fixture(); D.addItem(save.stash, 'watch'); D.addItem(save.stash, 'pistol'); D.addItem(save.stash, 'ammo9', 12, true); D.addItem(save.stash, 'knife');
    const c = S.createCart(save, 'arms'), inStash = (id: string, relief = false) => c.stash.items.find(i => i.id === id && !!i.relief === relief)!;
    assert.deepEqual(S.shopQuote('merchant', c.catalog.items.find(i => i.id === 'ammo9')!), { side: 'buy', total: 84 });
    assert.deepEqual(S.shopQuote('stash', inStash('watch')), { side: 'sell', total: 240 });
    assert.deepEqual(S.shopQuote('stash', inStash('pistol')), { side: 'sell', total: 150 });
    assert.deepEqual(S.shopQuote('stash', inStash('ammo9', true)), { side: 'sell', total: null }, 'relief goods cannot be sold');
    assert.deepEqual(S.shopQuote('stash', inStash('knife')), { side: 'sell', total: null }, 'no sale value');
    buy(c, 'ammo9'); buy(c, 'pistol', 1, 0); sell(c, 'watch'); sell(c, 'pistol', 1, 0);
    assert.deepEqual(S.shopQuote('sell', c.sell.items.find(i => i.id === 'watch')!), { side: 'sell', total: 240 });
    assert.deepEqual(S.shopQuote('buy', c.buy.items.find(i => i.id === 'ammo9')!), { side: 'buy', total: 84 });
    const quoted = (src: S.ShopSource, inv: D.Inventory) => inv.items.reduce((n, i) => n + S.shopQuote(src, i).total!, 0);
    const totals = S.cartTotals(c);
    assert.deepEqual(totals, { buy: quoted('buy', c.buy), sell: quoted('sell', c.sell), net: quoted('buy', c.buy) - quoted('sell', c.sell) });
    assert.deepEqual(totals, { buy: 84 + 320, sell: 240 + 150, net: 14 });
});
test('firstShopCell scans row-major and reports a rule before the generic space fallback', () => {
    const save = fixture(); D.addItem(save.stash, 'ammo9', 12, true); D.addItem(save.stash, 'watch'); const c = S.createCart(save, 'arms');
    const relief = c.stash.items.find(i => i.relief)!.uid, watch = c.stash.items.find(i => i.id === 'watch')!.uid;
    const toSell = (uid: string) => (x: number, y: number) => S.shopPlacementError(c, 'stash', 'sell', uid, x, y);
    assert.deepEqual(S.firstShopCell(c.sell.w, c.sell.h, toSell(relief)), { reason: '这件物品不可出售。' });
    assert.deepEqual(S.firstShopCell(c.sell.w, c.sell.h, toSell(watch)), { x: 0, y: 0 }, 'empty grid');
    const pistol = () => c.catalog.items.find(i => i.id === 'pistol')!.uid, toBuy = (x: number, y: number) => S.shopPlacementError(c, 'merchant', 'buy', pistol(), x, y);
    assert.deepEqual(S.firstShopCell(c.buy.w, c.buy.h, toBuy), { x: 0, y: 0 });
    buy(c, 'pistol'); assert.deepEqual(S.firstShopCell(c.buy.w, c.buy.h, toBuy), { x: 2, y: 0 }, 'merchant to buy keeps the row-major order');
    c.sell.items = Array.from({ length: c.sell.w * c.sell.h }, (_, i) => ({ uid: `full-${i}`, id: 'scrap', qty: 1, x: i % c.sell.w, y: Math.floor(i / c.sell.w) }));
    assert.equal(toSell(watch)(0, 0), S.SHOP_SPACE_MESSAGE);
    assert.deepEqual(S.firstShopCell(c.sell.w, c.sell.h, toSell(watch)), { reason: null }, 'only space blocked');
    assert.deepEqual(S.firstShopCell(c.sell.w, c.sell.h, toSell(relief)), { reason: '这件物品不可出售。' }, 'the rule wins over a full grid');
    assert.deepEqual(S.firstShopCell(2, 2, () => S.cartRejectionMessage.stale), { reason: S.cartRejectionMessage.stale });
    assert.deepEqual(S.firstShopCell(2, 2, (x, y) => x + y < 2 ? S.SHOP_SPACE_MESSAGE : '先放入待买或待卖区，再统一结算。'), { reason: '先放入待买或待卖区，再统一结算。' });
});
test('save failure rolls back entire net transaction, retry writes exactly once and reload agrees', () => {
    const state = createSessionState(); let raw: string | null = null, fail = false, writes = 0;
    const session = new SaveSession(state, () => ({ getItem: k => k === SESSION_KEY ? raw : null, setItem: (_k, value) => { if (fail) throw Error('quota'); raw = value; writes++; } }));
    assert.ok(session.initialize()); state.state = 'hideout'; state.save = fixture(); D.addItem(state.save.stash, 'watch');
    assert.ok(session.persist()); const c = S.createCart(state.save, 'arms'); sell(c, 'watch'); buy(c, 'ammo9');
    const before = structuredClone(state.save), oldRaw = raw, oldWrites = writes; fail = true;
    assert.equal(session.mutate(() => S.settleCartResult(state.save, c).ok), 'save-failed'); assert.deepEqual(state.save, before); assert.equal(raw, oldRaw);
    fail = false; assert.equal(session.mutate(() => S.settleCartResult(state.save, c).ok), 'committed'); assert.equal(writes, oldWrites + 1);
    assert.deepEqual(JSON.parse(raw!).profile, state.save);
    assert.equal(session.mutate(() => S.settleCartResult(state.save, c).ok), 'rejected'); assert.equal(writes, oldWrites + 1);
});
