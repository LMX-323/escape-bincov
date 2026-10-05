import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { departureWarnings, questProgress, exitBearing } from '../src/qol';

test('departure warnings use matching ammo in the backpack and distinguish safe-only treatment', () => {
    const s = D.newSave(); s.bag.items = []; s.safe.items = []; s.equipment.weapon = 'pistol';
    D.addItem(s.bag, 'shell', 4); D.addItem(s.safe, 'ammo9', 12); D.addItem(s.safe, 'medkit');
    assert.deepEqual(departureWarnings(s), ['背包缺少备用9 毫米弹', '止血用品仅在安全箱，快捷治疗不可用']);
    D.addItem(s.bag, 'ammo9'); D.addItem(s.bag, 'bandage'); assert.deepEqual(departureWarnings(s), []);
    s.equipment.weapon = null; s.safe.items = []; s.bag.items = [];
    assert.deepEqual(departureWarnings(s), ['未装备主武器', '未携带止血用品']);
});
test('raid tracking separates stored and carried materials without double-counting the safe checkpoint', () => {
    const s = D.newSave(); s.stash.items = []; s.bag.items = []; s.safe.items = [];
    D.addItem(s.stash, 'scrap', 2); D.addItem(s.safe, 'scrap'); D.addItem(s.bag, 'scrap', 2);
    const loadout = D.beginRun(s, 42), progress = questProgress(s, loadout);
    assert.deepEqual(progress[0].needs[0], { id: 'scrap', needed: 3, stored: 2, carried: 3 });
    s.quests.repair = true; assert.ok(!questProgress(s, loadout).some(q => q.key === 'repair'));
});
test('navigation reports compass bearing and straight-line tile distance in every quadrant', () => {
    for (const [x,y,dir] of [[32,0,'东'],[32,32,'东南'],[0,32,'南'],[-32,32,'西南'],[-32,0,'西'],[-32,-32,'西北'],[0,-32,'北'],[32,-32,'东北']] as const) {
        const result = exitBearing({x:0,y:0},{x,y}); assert.equal(result.direction,dir); assert.equal(result.distance,Math.hypot(x,y)/32);
    }
    assert.equal(exitBearing({x:1,y:2},{x:1,y:2}).distance,0);
});
