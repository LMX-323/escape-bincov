import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { changeLayer, settleDepartingShots } from '../src/layer-transition';
import { corridor, findLanding, spacePath, traversable, validateSpaces } from '../src/spatial';
import { validateExpansion } from '../src/expansion-state';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

test('body/path, sight and bullet channels differ for windows, low furniture and ordinary doors', () => {
    const world = prototypeWorld(), map = world.maps.downstairs;
    map.cells[1][2] = 'window'; const context = { definition: map, doors: {} as Record<string, boolean>, highTide: false };
    assert.equal(corridor(context, { x: 48, y: 48 }, { x: 112, y: 48 }, 'body', 10), false);
    assert.equal(corridor(context, { x: 48, y: 48 }, { x: 112, y: 48 }, 'sight'), true);
    assert.equal(corridor(context, { x: 112, y: 48 }, { x: 48, y: 48 }, 'bullet'), true);
    assert.equal(traversable(context, { x: 80, y: 48 }, 'path', 10), false);
    map.cells[1][2] = 'low'; assert.equal(traversable(context, { x: 80, y: 48 }, 'body'), false);
    assert.equal(traversable(context, { x: 80, y: 48 }, 'sight'), true);
    map.cells[1][2] = 'wall'; map.doors.push({ id: 'door-1', x: 2, y: 1, anchors: [{ x: 48, y: 48 }, { x: 112, y: 48 }] }); context.doors['door-1'] = false;
    for (const channel of ['body', 'sight', 'bullet'] as const) assert.equal(traversable(context, { x: 80, y: 48 }, channel), false);
    assert.equal(traversable(context, { x: 80, y: 48 }, 'path'), true);
    context.doors['door-1'] = true;
    for (const channel of ['body', 'sight', 'bullet'] as const) assert.equal(traversable(context, { x: 80, y: 48 }, channel), true);
    validateSpaces(world.maps);
});

test('finite departing trajectories stop at walls/closed doors but can kill through windows/open doors', () => {
    for (const cell of ['wall', 'window', 'low', 'door-closed', 'door-open'] as const) {
        const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), map = world.maps.downstairs;
        map.cells[1][2] = cell.startsWith('door') ? 'wall' : cell as 'wall' | 'window' | 'low';
        if (cell.startsWith('door')) { map.doors.push({ id: 'door-1', x: 2, y: 1, anchors: [{ x: 48, y: 48 }, { x: 112, y: 48 }] }); state.raid!.maps.downstairs.doors['door-1'] = cell === 'door-open'; }
        state.raid!.maps.downstairs.bullets[0].x = 48;
        assert.equal(changeLayer(state, world, 'up'), true);
        assert.equal(state.raid!.kills, cell === 'wall' || cell === 'door-closed' ? 0 : 1);
        assert.equal(state.raid!.maps.downstairs.bullets.length, 0);
        validateExpansion(state, profile, null, () => world);
    }
});

test('short/zero-speed shots cannot kill; first legal target receives actual damage, not overkill', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets[0].left = 10;
    settleDepartingShots(state, world, 'downstairs'); assert.equal(raid.kills, 0); assert.equal(raid.training.quantity.technique, 0);
    raid.maps.downstairs.bullets = [{ uid: 'shot-3', x: 64, y: 48, rotation: 0, vx: 0, vy: 0, left: 200, damage: 999, enemy: false }];
    settleDepartingShots(state, world, 'downstairs'); assert.equal(raid.kills, 0);
    const [front, rear] = raid.maps.downstairs.enemies; front.x = 96; rear.x = 144; rear.y = 48;
    raid.maps.downstairs.bullets = [{ uid: 'shot-4', x: 64, y: 48, rotation: 0, vx: 500, vy: 0, left: 130, damage: 999, enemy: false }];
    settleDepartingShots(state, world, 'downstairs');
    assert.equal(front.hp, 0); assert.equal(rear.hp, 56); assert.equal(raid.training.quantity.technique, .025);
});

test('no landing rejects without settling bullets, and fallback uses distance then row/column inside a circle', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    const context = { definition: world.maps.upstairs, doors: {}, highTide: false }, at = { x: 80, y: 80 };
    assert.deepEqual(findLanding(context, at, [at]), { x: 80, y: 48 });
    const target = world.maps.upstairs;
    target.cells = target.cells.map(row => row.map(() => 'wall'));
    target.cells[1][1] = 'floor';
    const enemy = raid.maps.downstairs.enemies.pop()!; enemy.x = 48; enemy.y = 48; enemy.home = { x: 48, y: 48 }; enemy.target = { x: 48, y: 48 };
    raid.maps.upstairs.enemies.push(enemy);
    const before = structuredClone(state); assert.equal(changeLayer(state, world, 'up'), false); assert.deepEqual(state, before);
});

test('survivors without eye contact or a path do not pursue; an existing event keeps its target on return', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    world.maps.downstairs.cells[2][1] = 'wall'; raid.maps.downstairs.bullets = [];
    assert.equal(changeLayer(state, world, 'up'), true);
    assert.equal(raid.pursuits.length, 1); assert.equal(raid.pursuits[0].enemy.uid, 'enemy-0');
    const event = structuredClone(raid.pursuits[0]);
    assert.equal(changeLayer(state, world, 'down'), true); assert.deepEqual(raid.pursuits[0], event);
    const context = { definition: world.maps.downstairs, doors: {}, highTide: false };
    assert.ok(spacePath(context, { x: 112, y: 48 }, { x: 48, y: 48 }).length > 0);
});

test('killing a source pursuit cancels ownership transfer and produces only one corpse', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    raid.maps.downstairs.bullets = [];
    assert.equal(changeLayer(state, world, 'up'), true); assert.equal(raid.pursuits.length, 2);
    assert.equal(changeLayer(state, world, 'down'), true);
    raid.maps.downstairs.bullets = [{ uid: 'shot-7', x: 64, y: 48, rotation: 0, vx: 500, vy: 0, left: 120, damage: 999, enemy: false }];
    assert.equal(changeLayer(state, world, 'up'), true);
    assert.equal(raid.pursuits.length, 1); assert.equal(raid.maps.downstairs.enemies.length, 1);
    assert.equal(raid.maps.downstairs.enemies[0].hp, 0); assert.equal(raid.maps.downstairs.containers.length, 1);
    validateExpansion(state, profile, null, () => world);
});
