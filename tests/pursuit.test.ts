import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';
import { changeLayer, settleDepartingShots, advanceLayerShots } from '../src/layer-transition';
import { advancePursuits, pursuitPosition } from '../src/pursuit';
import { validateExpansion } from '../src/expansion-state';

test('追击进度、途经开门和抵达只移交一个原身份，冷却/生命不重置，返回不改变旧目标', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world);
    state.raid!.maps.downstairs.bullets = [];
    assert.equal(changeLayer(state, world, 'up'), true);
    assert.equal(state.raid!.pursuits.length, 2);
    const event = state.raid!.pursuits.find(p => p.enemy.uid === 'enemy-1')!;
    const originalHp = event.enemy.hp, cooldown = event.enemy.cooldown;
    state.raid!.elapsed = 1;
    const position = pursuitPosition(event, state.raid!.elapsed);
    advancePursuits(state, world); assert.equal(event.enemy.x, position.x); assert.equal(event.enemy.y, position.y);
    assert.equal(changeLayer(state, world, 'down'), true);
    state.raid!.elapsed = 5;
    advancePursuits(state, world);
    assert.equal(state.raid!.pursuits.length, 0);
    assert.equal(state.raid!.maps.upstairs.enemies.length, 2);
    assert.equal(state.raid!.maps.downstairs.enemies.length, 0);
    const arrived = state.raid!.maps.upstairs.enemies.find(e => e.uid === 'enemy-1')!;
    assert.equal(arrived.hp, originalHp); assert.equal(arrived.cooldown, cooldown);
    validateExpansion(state, profile, null, id => id === world.id ? world : undefined);
});

test('堵塞目标稳定等待，腾出落点后抵达；不可见目标收到敌人但本地时间仍冻结', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets = []; raid.maps.downstairs.enemies[0].alert = 0;
    const target = world.maps.upstairs;
    target.cells = target.cells.map((row, y) => row.map((_c, x) => x === 1 && y === 1 || x === 4 && y === 4 ? 'floor' : 'wall'));
    assert.equal(changeLayer(state, world, 'up'), true);
    raid.elapsed = 5; advancePursuits(state, world);
    assert.equal(raid.pursuits.length, 1); assert.equal(raid.pursuits[0].waiting, true);
    assert.equal(raid.maps.upstairs.enemies.length, 0);
    raid.player = { x: 144, y: 144, rotation: 0 }; advancePursuits(state, world);
    assert.equal(raid.pursuits.length, 0); assert.equal(raid.maps.upstairs.enemies.length, 1);
    assert.equal(raid.maps.upstairs.localTime, 0);
    validateExpansion(state, profile, null, id => id === world.id ? world : undefined);
});

test('返回来源层时落点避开仍属于追击事件的活人投影', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets = [];
    assert.equal(changeLayer(state, world, 'up'), true);
    raid.elapsed = Math.max(...raid.pursuits.map(p => p.distance / p.speed));
    advancePursuits(state, world);
    assert.equal(raid.maps.downstairs.enemies.length, 0);
    assert.equal(changeLayer(state, world, 'down'), true);
    assert.deepEqual(raid.player, { x: 80, y: 48, rotation: 0 });
    assert.ok(raid.pursuits.every(p => Math.hypot(p.enemy.x - raid.player.x, p.enemy.y - raid.player.y) >= 20));
    validateExpansion(state, profile, null, () => world);
});

test('普通飞行与离层结算共用有限首碰撞内核，同一子弹伤害和掉落一致', () => {
    const world = prototypeWorld(), profile = D.newSave(), a = prototypeRaid(profile, world);
    const b = structuredClone(a);
    a.raid!.maps.downstairs.bullets = [a.raid!.maps.downstairs.bullets[0]];
    b.raid!.maps.downstairs.bullets = [b.raid!.maps.downstairs.bullets[0]];
    settleDepartingShots(a, world, 'downstairs'); advanceLayerShots(b, world, 'downstairs', 1);
    assert.deepEqual(a.raid!.maps.downstairs, b.raid!.maps.downstairs);
    assert.equal(a.raid!.rng, b.raid!.rng); assert.equal(a.raid!.nextEntity, b.raid!.nextEntity);
    assert.deepEqual(a.raid!.training, b.raid!.training);
});

test('潮位切断剩余路段时取消追击并归回来源，听声或未发现玩家不登记事件', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets = [];
    const source = world.maps.downstairs;
    source.cells = source.cells.map((row, y) => row.map((_c, x) => x === 1 && [1, 2, 3].includes(y) || x === 3 && y === 1 ? 'floor' : 'wall'));
    source.cells[2][1] = 'tide';
    raid.maps.downstairs.enemies[0].state = 'investigate';
    assert.equal(changeLayer(state, world, 'up'), true);
    assert.equal(raid.pursuits.length, 1);
    raid.highTide = true; raid.elapsed = .1; advancePursuits(state, world, true);
    assert.equal(raid.pursuits.length, 0);
    assert.equal(raid.maps.downstairs.enemies.length, 2);
    assert.equal(raid.maps.downstairs.enemies.find(e => e.uid === 'enemy-1')!.hp, 56);
});
