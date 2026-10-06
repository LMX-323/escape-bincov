import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { BUILDING_WORLD, buildingRunConfig, initializeBuildingRaid } from '../src/building-world';
import { newExpansion, validateExpansion } from '../src/expansion-state';
import { doorAnchor, interactionTarget, spacePath, toggleDoor, traversable, validateSpaces, type SpaceContext } from '../src/spatial';
import { resolveExpansionWorld } from '../src/expansion-worlds';

test('居民楼各图尺寸独立，每个房间和成对平台在两种潮位均有永久退路', () => {
    validateSpaces(BUILDING_WORLD.maps);
    assert.equal(BUILDING_WORLD.maps.coast.cells.length, 52);
    assert.equal(BUILDING_WORLD.maps['resident-f2'].cells.length, 10);
    assert.equal(BUILDING_WORLD.maps['resident-b1'].cells.length, 9);
    for (const map of Object.values(BUILDING_WORLD.maps)) for (const highTide of [false, true]) {
        const context = { definition: map, doors: Object.fromEntries(map.doors.map(d => [d.id, false])), highTide };
        const destination = map.id === 'coast' ? { x: 208, y: 432 } : map.entries[0].at;
        for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[y].length; x++) {
            if (map.id === 'coast' && (x < 10 || x > 18 || y < 7 || y > 12)) continue;
            const point = { x: x * 32 + 16, y: y * 32 + 16 };
            if (traversable(context, point, 'path', 10)) assert.ok(spacePath(context, point, destination, true).length, `${map.id} ${x},${y}`);
        }
    }
});

test('门两侧都可开，占门洞的玩家或活敌人拒绝关门，窗和家具通弹但不能穿行', () => {
    const map = BUILDING_WORLD.maps.coast, doors = Object.fromEntries(map.doors.map(d => [d.id, false]));
    const context: SpaceContext = { definition: map, doors, highTide: false };
    const door = map.doors.find(d => d.id === 'resident-front')!;
    for (const side of door.anchors) {
        context.doors[door.id] = false;
        assert.deepEqual(doorAnchor(context, door.id, side), side);
        assert.equal(toggleDoor(context, door.id, side, []), 'opened');
        assert.equal(toggleDoor(context, door.id, side, [{ x: door.x * 32 + 16, y: door.y * 32 + 16 }]), 'occupied');
        assert.equal(context.doors[door.id], true);
        assert.equal(toggleDoor(context, door.id, side, []), 'closed');
    }
    const aperture = { x: 11 * 32 + 16, y: 7 * 32 + 16 };
    for (const channel of ['sight', 'bullet'] as const) assert.equal(traversable(context, aperture, channel), true);
    for (const channel of ['body', 'path'] as const) assert.equal(traversable(context, aperture, channel), false);
    assert.equal(toggleDoor(context, door.id, { x: 208, y: 208 }, []), 'unreachable');
});

test('交互共享目标：撤离优先，其余按距离和入口、门、物资、记录排序，不隔窗拾取', () => {
    const map = BUILDING_WORLD.maps['resident-b1'];
    const context = { definition: map, doors: Object.fromEntries(map.doors.map(d => [d.id, true])), highTide: false };
    const player = { x: 176, y: 176 }, at = { x: 176, y: 144 };
    const candidates = [
        { id: 'note', kind: 'note' as const, at, label: '阅读' },
        { id: 'door', kind: 'door' as const, at, label: '开门' },
        { id: 'entry', kind: 'entry' as const, at, label: '上楼 · 一楼' },
        { id: 'ground', kind: 'ground' as const, at, label: '拾取' },
    ];
    assert.equal(interactionTarget(context, player, candidates)?.id, 'entry');
    candidates.push({ id: 'exit', kind: 'exit' as never, at: { x: 176, y: 135 }, label: '撤离' });
    assert.equal(interactionTarget(context, player, candidates)?.id, 'exit');
    const coast = BUILDING_WORLD.maps.coast;
    assert.equal(interactionTarget({ ...context, definition: coast, doors: {} }, { x: 368, y: 208 },
        [{ id: 'across-window', kind: 'ground', at: { x: 368, y: 260 }, label: '拾取' }]), null);
});

test('新居民楼一次投放全局25敌人和60记录，平台无投放，原海岸生成和旧世界不变', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const profile = D.newSave(), loadout = D.beginRun(profile, seed), state = newExpansion(0), config = buildingRunConfig(seed);
        initializeBuildingRaid(state, loadout, config);
        validateExpansion(state, profile, null, resolveExpansionWorld);
        const maps = Object.values(state.raid!.maps);
        assert.equal(maps.flatMap(m => m.enemies).length, 25);
        assert.equal(config.loot.length + config.containers.reduce((n, c) => n + c.items.length, 0), 60);
        const amounts = (items: { id: string; qty: number }[]) => items.reduce((result, i) => ({ ...result, [i.id]: (result[i.id] ?? 0) + i.qty }), {} as Record<string, number>);
        assert.deepEqual(amounts(maps.flatMap(m => [...m.loot, ...m.containers.flatMap(c => c.inventory.items)])),
            amounts([...config.loot, ...config.containers.flatMap(c => c.items)]));
        assert.deepEqual(buildingRunConfig(seed), config, '新图初始化不修改旧海岸生成器');
        assert.ok(maps.flatMap(m => m.loot).length >= 40);
        assert.ok(maps.flatMap(m => m.containers).length <= 10);
        for (const [id, layer] of Object.entries(state.raid!.maps)) for (const entry of BUILDING_WORLD.maps[id].entries) {
            assert.ok([...layer.loot, ...layer.containers, ...layer.enemies].every(p => Math.hypot(p.x - entry.at.x, p.y - entry.at.y) >= 20));
        }
    }
});
