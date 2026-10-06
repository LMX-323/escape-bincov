import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { MALL_WORLD, MALL_ANCHORS, MALL_PASSAGES, initializeMallRaid, mallRunConfig } from '../src/mall-world';
import { newExpansion, validateExpansion } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { corridor, spacePath, traversable, validateSpaces } from '../src/spatial';
import { advanceLayerShots } from '../src/layer-transition';

test('商场39区域、7同层开口、4成对连接及固定验证锚点合法，两层同坐标各自拥有楼板', () => {
    validateSpaces(MALL_WORLD.maps);
    assert.equal(Object.values(MALL_WORLD.maps).flatMap(m => m.regions!).length, 39);
    assert.equal(MALL_PASSAGES.length, 7);
    for (const map of Object.values(MALL_WORLD.maps)) {
        assert.equal(map.entries.length, 4);
        for (const e of map.entries) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(traversable({ definition: map, doors: {}, highTide: true }, { x: e.at.x + dx * 32, y: e.at.y + dy * 32 }, 'body', 10), true);
        assert.equal(traversable({ definition: map, doors: {}, highTide: true }, MALL_ANCHORS.pair, 'body', 10), true);
    }
    for (const p of MALL_PASSAGES) for (const highTide of [false, true]) {
        const context = { definition: MALL_WORLD.maps[p.map], doors: {}, highTide }, vertical = ['P-N', 'P-S'].includes(p.id);
        for (const offset of [-24, 0, 24]) {
            const a = { x: p.at.x + (vertical ? offset : -40), y: p.at.y + (vertical ? -40 : offset) };
            const b = { x: p.at.x + (vertical ? offset : 40), y: p.at.y + (vertical ? 40 : offset) };
            assert.equal(corridor(context, a, b, 'body', 10), true, `${p.id} high=${highTide} offset=${offset}`);
            assert.equal(corridor(context, b, a, 'body', 10), true, `${p.id} reverse`);
        }
    }
    assert.equal(traversable({ definition: MALL_WORLD.maps['mall-f2'], doors: {}, highTide: true }, MALL_ANCHORS.edge, 'body', 10), true);
    assert.equal(traversable({ definition: MALL_WORLD.maps['mall-f2'], doors: {}, highTide: true }, { ...MALL_ANCHORS.edge, x: 73 * 32 + 16 }, 'body', 10), false);
});

test('所有可行走格、开放房间和露台在两种潮位都连至合法平台或干燥撤离环路', () => {
    for (const map of Object.values(MALL_WORLD.maps)) for (const highTide of [false, true]) {
        const context = { definition: map, doors: {}, highTide }, end = map.id === 'mall-f1' ? MALL_ANCHORS.north : map.entries[0].at;
        const queue = [end], seen = new Set([`${Math.floor(end.x / 32)},${Math.floor(end.y / 32)}`]);
        for (let index = 0; index < queue.length; index++) for (const [dx,dy] of [[32,0],[-32,0],[0,32],[0,-32]]) {
            const p = { x: queue[index].x + dx, y: queue[index].y + dy }, key = `${Math.floor(p.x / 32)},${Math.floor(p.y / 32)}`;
            if (seen.has(key) || !traversable(context, p, 'body', 10) || !corridor(context, queue[index], p, 'body', 10)) continue;
            seen.add(key); queue.push(p);
        }
        for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[y].length; x++) {
            const p = { x: (x + .5) * 32, y: (y + .5) * 32 };
            if (traversable(context, p, 'body', 10)) assert.ok(seen.has(`${x},${y}`), `${map.id} high=${highTide} isolated ${x},${y}`);
        }
        for (const e of map.entries) assert.ok(spacePath(context, e.at, end).length);
    }
});

test('商场一次分配6/10/9敌人与12/28/20物资，10箱20记录和40散落，幸运中性守恒且刷新不重投', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const profile = D.newSave(), loadout = D.beginRun(profile, seed), state = newExpansion(0), config = mallRunConfig(seed);
        state.version = 2; state.charm = null; state.awards = [];
        initializeMallRaid(state, loadout, config); validateExpansion(state, profile, null, resolveExpansionWorld);
        const f1 = state.raid!.maps['mall-f1'], f2 = state.raid!.maps['mall-f2'];
        assert.equal(f1.enemies.length, 16); assert.equal(f2.enemies.length, 9);
        assert.equal(f1.enemies.filter(e => e.x < 8 * 32 || e.x >= 64 * 32 || e.y < 6 * 32 || e.y >= 48 * 32).length, 6);
        assert.equal(f1.loot.length, 26); assert.equal(f1.containers.length, 7);
        assert.equal(f2.loot.length, 14); assert.equal(f2.containers.length, 3);
        const amounts = (items: {id: string; qty: number}[]) => items.reduce((a,i) => { a[i.id] = (a[i.id] ?? 0) + i.qty; return a; }, {} as Record<string, number>);
        assert.deepEqual(amounts([...f1.loot, ...f2.loot, ...[...f1.containers, ...f2.containers].flatMap(c => c.inventory.items)]), amounts([...config.loot, ...config.containers.flatMap(c => c.items)]));
        const copy = structuredClone(state); validateExpansion(copy, profile, null, resolveExpansionWorld); assert.deepEqual(copy, state);
        assert.equal(config.exits.length, 2);
        for (const layer of Object.values(state.raid!.maps)) for (const p of [...layer.enemies, ...layer.loot, ...layer.containers]) assert.ok(MALL_WORLD.maps[layer === f1 ? 'mall-f1' : 'mall-f2'].entries.every(e => Math.hypot(e.at.x - p.x, e.at.y - p.y) >= 144));
    }
});

test('B/M/V装饰的视觉登记与实际移动、子弹和视线通道一致；封存核无隐形连接', () => {
    for (const map of Object.values(MALL_WORLD.maps)) {
        const context = { definition: map, doors: {}, highTide: true };
        for (const d of map.decorations!) for (const channel of ['body', 'bullet', 'sight'] as const) assert.equal(traversable(context, d, channel), d.kind === 'V' || d.kind === 'M' && channel !== 'body', `${map.id} ${d.name} ${d.kind} ${channel}`);
        for (const r of map.regions!.filter(r => r.sealed)) assert.equal(traversable(context, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 'body'), false);
    }
});

test('商场同平面坐标的两个原敌人、掉落和声源由楼层隔离，双向射击只结算当前层', () => {
    const profile = D.newSave(), state = newExpansion(0), loadout = D.beginRun(profile, 41);
    state.version = 2; state.charm = null; state.awards = [];
    initializeMallRaid(state, loadout, mallRunConfig(41));
    const raid = state.raid!, f1 = raid.maps['mall-f1'], f2 = raid.maps['mall-f2'];
    Object.assign(f1.enemies[0], MALL_ANCHORS.pair, { hp: 10 });
    Object.assign(f2.enemies[0], MALL_ANCHORS.pair, { hp: 10 });
    for (const [sourceId, targetId] of [['mall-f1', 'mall-f2'], ['mall-f2', 'mall-f1']]) {
        raid.currentMap = sourceId; raid.player = { ...MALL_ANCHORS.pair, rotation: 0 };
        const source = raid.maps[sourceId], targetBefore = structuredClone(raid.maps[targetId]);
        source.noise = { at: { ...MALL_ANCHORS.pair }, radius: 510, remaining: .5 };
        source.bullets.push({ uid: `entity-${raid.nextEntity++}`, ...MALL_ANCHORS.pair, rotation: 0, vx: 500, vy: 0, left: 32, damage: 999, enemy: false });
        advanceLayerShots(state, MALL_WORLD, sourceId, .1);
        assert.equal(source.enemies[0].hp, 0);
        assert.equal(source.containers.filter(c => c.id === `corpse-${source.enemies[0].uid}`).length, 1);
        assert.deepEqual(raid.maps[targetId], targetBefore);
        validateExpansion(state, profile, null, resolveExpansionWorld);
    }
    assert.equal(raid.kills, 2); assert.equal(raid.training.quantity.technique, .05);
});
