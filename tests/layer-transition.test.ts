import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState, EnemyState } from '../src/checkpoint';
import { changeLayer, resolveLayerShot, settleDepartingShots, type ShotObservation } from '../src/layer-transition';
import { corridor, findLanding, spacePath, traversable, validateSpaces } from '../src/spatial';
import { validateExpansion, type ExpansionState, type PursuitState } from '../src/expansion-state';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

const foe = (uid: string, x: number, y: number, hp = 30): EnemyState => ({ uid, id: 'scav', x, y, hp, rotation: 0, home: { x, y }, target: { x, y },
    state: 'patrol', timer: 2, cooldown: .7, path: [], repath: 0, alert: 0 });
const chaser = (enemy: EnemyState, sourceMap: string): PursuitState => ({ id: `pursuit-${enemy.uid}`, enemy, sourceMap,
    targetMap: sourceMap === 'upstairs' ? 'downstairs' : 'upstairs', entry: sourceMap === 'upstairs' ? 'down' : 'up',
    path: [{ x: enemy.x, y: enemy.y }, { x: 48, y: 48 }], distance: 100, speed: 50, registeredAt: 0, arrivalAt: 3, waiting: false });

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

test('resolveLayerShot candidates stay put: live enemies of the layer and its own pursuers, nearest first, ties by uid', () => {
    const world = prototypeWorld();
    // One player shot on the upstairs layer, from (40, 100) along +x; the first wall is 248 px out.
    const fire = (enemies: EnemyState[], pursuits: PursuitState[] = [], patch: Partial<BulletState> = {}, edit?: (state: ExpansionState) => void) => {
        const state = prototypeRaid(D.newSave(), world), raid = state.raid!;
        raid.maps.downstairs.bullets = []; raid.maps.upstairs.enemies = enemies; raid.pursuits = pursuits; edit?.(state);
        const hits: [string, boolean][] = [], events: ShotObservation[] = [], rng = raid.rng;
        const done = resolveLayerShot(state, world, 'upstairs', { uid: 'shot-9', x: 40, y: 100, rotation: 0, vx: 500, vy: 0, left: 240, damage: 5, enemy: false, ...patch },
            true, (uid, critical) => hits.push([uid, critical]), undefined, e => events.push(e));
        return { state, raid, done, hits, events, rng };
    };
    // Equal distance: the uid decides (localeCompare 'en', not numeric), not the array order.
    for (const [first, second] of [['enemy-b', 'enemy-a'], ['enemy-9', 'enemy-10']]) {
        const shot = fire([foe(first, 120, 95), foe(second, 120, 105)]);
        assert.deepEqual(shot.hits, [[second, false]]); assert.equal(shot.done, true); assert.equal(shot.raid.rng, shot.rng);
        assert.deepEqual(shot.raid.maps.upstairs.enemies.map(e => e.hp), [30, 25]);
        assert.equal(shot.events.length, 1); assert.equal(shot.events[0].reason, 'hit-actor'); assert.ok(Math.abs(shot.events[0].contact!.x - 40 - (80 - Math.sqrt(171))) < 1e-9);
    }
    // A pursuer this layer still owns counts and a nearer one wins; one owned by the other layer, a corpse and anything
    // past the range do not.
    const chase = () => [chaser(foe('enemy-p', 150, 100), 'upstairs'), chaser(foe('enemy-q', 100, 100), 'downstairs')];
    let shot = fire([foe('enemy-d', 70, 100, 0), foe('enemy-a', 200, 100)], chase());
    assert.deepEqual(shot.hits, [['enemy-p', false]]); assert.equal(shot.raid.pursuits[0].enemy.hp, 25); assert.equal(shot.raid.pursuits[1].enemy.hp, 30);
    shot = fire([foe('enemy-a', 200, 100)], chase(), { damage: 99 });
    assert.deepEqual(shot.hits, [['enemy-p', false]]); assert.equal(shot.raid.kills, 1);
    assert.deepEqual(shot.raid.pursuits.map(p => p.enemy.uid), ['enemy-q']);
    assert.deepEqual(shot.raid.maps.upstairs.enemies.map(e => [e.uid, e.hp]), [['enemy-a', 30], ['enemy-p', 0]]);
    assert.deepEqual(shot.raid.maps.upstairs.containers.map(c => c.id), ['corpse-enemy-p']);
    shot = fire([foe('enemy-a', 200, 100)], [], { left: 140 });
    assert.deepEqual(shot.hits, []); assert.equal(shot.done, false); assert.deepEqual(shot.events, []);
    // A wall stops the shot short of the enemy behind it; a window does not.
    for (const cell of ['wall', 'window'] as const) {
        shot = fire([foe('enemy-a', 200, 100)], [], {}, () => { world.maps.upstairs.cells[3][4] = cell; });
        world.maps.upstairs.cells[3][4] = 'floor';
        assert.deepEqual(shot.hits, cell === 'wall' ? [] : [['enemy-a', false]]); assert.equal(shot.done, true);
        assert.equal(shot.events[0].reason, cell === 'wall' ? 'blocked' : 'hit-actor'); assert.equal(shot.events[0].contact!.x - 40, cell === 'wall' ? 88 : 146);
    }
    // v2: a hit draws the critical roll once from raid.rng; a miss draws nothing.
    const v2 = (state: ExpansionState) => { state.raid!.version = 2; state.raid!.shockAt = -10; state.raid!.mapEvent = 'none'; };
    shot = fire([foe('enemy-a', 200, 100)], [], {}, v2);
    const random = D.seededRandom(shot.rng); random();
    assert.equal(shot.raid.rng, random.getState()); assert.equal(shot.hits.length, 1);
    assert.equal(shot.raid.maps.upstairs.enemies[0].hp, 30 - 5 * (shot.hits[0][1] ? 1.5 : 1));
    shot = fire([foe('enemy-a', 200, 140)], [], {}, v2);
    assert.deepEqual(shot.hits, []); assert.equal(shot.raid.rng, shot.rng);
});
