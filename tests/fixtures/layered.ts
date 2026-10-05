import * as D from '../../src/domain';
import type { EnemyState } from '../../src/checkpoint';
import { newExpansion, newTraining, RECIPES, PRODUCTION_SPEED, type LayeredRaid, type ProductionBatch, type WorldDefinition, type ExpansionState } from '../../src/expansion-state';
import type { Cell, SpaceDefinition } from '../../src/spatial';

function map(id: string, cols: number, rows: number): SpaceDefinition {
    return { id, name: id, floor: id, tile: 32, doors: [], entries: [], cells: Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x): Cell => x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 'wall' : 'floor')) };
}
export function prototypeWorld(): WorldDefinition {
    const downstairs = map('downstairs', 6, 6), upstairs = map('upstairs', 10, 8);
    downstairs.entries.push({ id: 'up', at: { x: 48, y: 48 }, targetMap: 'upstairs', targetEntry: 'down', landing: { x: 48, y: 48 } });
    upstairs.entries.push({ id: 'down', at: { x: 48, y: 48 }, targetMap: 'downstairs', targetEntry: 'up', landing: { x: 48, y: 48 } });
    return { id: 'prototype-v1', revision: 'prototype-layout-1', maps: { downstairs, upstairs }, enemyCount: 2,
        spawnMap: 'downstairs', spawn: { x: 48, y: 48 } };
}
function enemy(uid: string, x: number, y: number, hp: number): EnemyState {
    return { uid, id: 'scav', x, y, hp, rotation: 0, home: { x, y }, target: { x, y }, state: 'chase',
        timer: 2, cooldown: .7, path: [], repath: 0, alert: 6 };
}
export function productionBatch(id = 'batch-1', recipe: ProductionBatch['recipe'] = 'bandage', level: 1 | 2 | 3 = 1): ProductionBatch {
    const definition = RECIPES[recipe], duration = definition.seconds * PRODUCTION_SPEED[level];
    return { id, recipe, duration, remaining: duration, workbenchLevel: level, paidCash: definition.cash,
        paidItems: structuredClone([...definition.materials]), result: structuredClone([...definition.result]) };
}
/** Explicit M0 fixture. Does not claim to be a finished resident building or mall. */
export function prototypeRaid(profile: D.SaveDataV1, world: WorldDefinition, state = newExpansion(1000)): ExpansionState {
    const loadout = D.beginRun(profile, 42);
    const maps: LayeredRaid['maps'] = Object.fromEntries(Object.values(world.maps).map(m => [m.id, {
        doors: Object.fromEntries(m.doors.map(d => [d.id, false])), localTime: 0, enemies: [], loot: [], containers: [], bullets: [], noise: null,
    }]));
    maps.downstairs.enemies = [enemy('enemy-0', 112, 48, 10), enemy('enemy-1', 48, 112, 56)];
    maps.downstairs.bullets = [
        { uid: 'shot-0', x: 64, y: 48, rotation: 0, vx: 500, vy: 0, left: 120, damage: 27, enemy: false },
        { uid: 'shot-1', x: 48, y: 80, rotation: 0, vx: 0, vy: -300, left: 60, damage: 20, enemy: true },
    ];
    state.base.location = 'raid'; state.base.facilities.workbench = 1;
    state.base.queue = [productionBatch()]; state.base.nextBatch = 2;
    state.raid = { version: 1, worldVersion: world.id, layoutRevision: world.revision, seed: 42, runId: loadout.runId!,
        currentMap: world.spawnMap, player: { ...world.spawn, rotation: 0 }, loadout, elapsed: 0,
        initialHigh: false, highTide: false, warned: false, tideChanged: false, kills: 0, rng: 12345, nextEntity: 1,
        maps, pursuits: [], training: newTraining(), reloadLeft: .8, fireCooldown: .2, knife: false, hitTime: .1,
        roster: maps.downstairs.enemies.map(e => ({ uid: e.uid, id: e.id })), eventRolled: false };
    return state;
}
