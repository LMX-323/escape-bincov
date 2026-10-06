import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';
import { changeLayer, settleDepartingShots, advanceLayerShots } from '../src/layer-transition';
import { advancePursuits, pursuitPosition } from '../src/pursuit';
import { validateExpansion } from '../src/expansion-state';
import { toggleDoor } from '../src/spatial';

test('追击敌人走过门后，玩家关门，后续帧、刷新及连接等待不得重开身后的门', () => {
    const world = prototypeWorld(), profile = D.newSave();
    world.maps.downstairs.doors.push({ id: 'gate', x: 2, y: 1, anchors: [{ x: 48, y: 48 }, { x: 112, y: 48 }] });
    const state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets = []; raid.maps.downstairs.doors.gate = true;
    raid.maps.downstairs.enemies[1].alert = 0;
    assert.equal(changeLayer(state, world, 'up'), true);
    const event = raid.pursuits[0], arrival = event.arrivalAt, hp = event.enemy.hp, rng = raid.rng;
    raid.elapsed = event.registeredAt + event.distance / event.speed;
    advancePursuits(state, world);
    assert.equal(raid.pursuits.length, 1, 'Still waiting for the one-second connector delay');
    raid.currentMap = 'downstairs'; raid.player = { x: 112, y: 48, rotation: 0 };
    const context = { definition: world.maps.downstairs, doors: raid.maps.downstairs.doors, highTide: false };
    assert.equal(toggleDoor(context, 'gate', raid.player, [event.enemy]), 'closed');
    raid.elapsed += 1 / 60;
    assert.equal(advancePursuits(state, world), false);
    assert.equal(context.doors.gate, false, 'A distant pursuit cannot reopen a door it already passed');
    assert.equal(event.arrivalAt, arrival); assert.equal(event.enemy.hp, hp); assert.equal(raid.rng, rng);
    const restored = validateExpansion(JSON.parse(JSON.stringify(state)), profile, null, () => world)!;
    restored.raid!.elapsed += 1 / 60; advancePursuits(restored, world);
    assert.equal(restored.raid!.maps.downstairs.doors.gate, false);
    restored.raid!.elapsed = arrival; advancePursuits(restored, world);
    assert.equal(restored.raid!.pursuits.length, 0);
    assert.equal(restored.raid!.maps.downstairs.doors.gate, false);
    assert.equal(restored.raid!.maps.upstairs.enemies.filter(e => e.uid === event.enemy.uid).length, 1);
});

test('一帧跨过弯道和多扇门时仍打开新路段的门，越过后不再处理旧门', () => {
    const world = prototypeWorld(), profile = D.newSave();
    world.spawn = { x: 48, y: 112 }; world.maps.downstairs.entries[0].at = { ...world.spawn };
    world.maps.downstairs.doors.push(
        { id: 'horizontal', x: 2, y: 3, anchors: [{ x: 48, y: 112 }, { x: 112, y: 112 }] },
        { id: 'vertical', x: 3, y: 2, anchors: [{ x: 112, y: 48 }, { x: 112, y: 112 }] });
    const state = prototypeRaid(profile, world), raid = state.raid!, source = raid.maps.downstairs;
    source.bullets = []; source.enemies[1].alert = 0;
    Object.assign(source.doors, { horizontal: true, vertical: true });
    assert.equal(changeLayer(state, world, 'up'), true);
    const event = raid.pursuits[0], arrival = event.arrivalAt;
    Object.assign(source.doors, { horizontal: false, vertical: false });
    raid.elapsed = event.registeredAt + (event.distance - 2) / event.speed;
    assert.equal(advancePursuits(state, world), true);
    assert.deepEqual(source.doors, { horizontal: true, vertical: true });
    Object.assign(source.doors, { horizontal: false, vertical: false });
    raid.elapsed += 1 / 60; assert.equal(advancePursuits(state, world), false);
    assert.deepEqual(source.doors, { horizontal: false, vertical: false });
    assert.equal(event.arrivalAt, arrival);
    validateExpansion(state, profile, null, () => world);
});

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
