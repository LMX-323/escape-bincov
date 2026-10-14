import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_WORLD } from '../src/building-world';
import { MALL_WORLD } from '../src/mall-world';
import { corridor, type SpaceContext, type SpaceDefinition } from '../src/spatial';
import type { Point } from '../src/world';
import { doorGuide, doorWall, entryKind, entryShown, floorIndoors, roofedRegions, stairLabelPlacement, touchesRoof, type Rect } from '../src/space-guide';

const maps = { ...BUILDING_WORLD.maps, ...MALL_WORLD.maps };
const context = (map: SpaceDefinition, open = false): SpaceContext => ({ definition: map, doors: Object.fromEntries(map.doors.map(d => [d.id, open])), highTide: false });

/** Inline copy of the RaidScene.drawRoofs loop on main e9cbaa5, kept here as the permission oracle. */
function oldRoofs(space: SpaceContext, player: Point) {
    const roofs = [];
    for (const r of space.definition.regions ?? []) {
        if (r.inside === false) continue;
        const inside = player.x >= r.x && player.x < r.x + r.w && player.y >= r.y && player.y < r.y + r.h;
        const near = { x: Math.max(r.x + 40, Math.min(r.x + r.w - 40, player.x)), y: Math.max(r.y + 40, Math.min(r.y + r.h - 40, player.y)) };
        if (!r.sealed && (inside || Math.hypot(player.x - near.x, player.y - near.y) < 80 && corridor({ ...space, highTide: false }, player, near, 'sight', 0))) continue;
        roofs.push(r);
    }
    return roofs;
}
const guides = (map: SpaceDefinition, player: Point, open = false) => {
    const space = context(map, open), roofs = roofedRegions(space, player), indoors = floorIndoors(map, player);
    return { roofs, indoors, doors: Object.fromEntries(map.doors.map(d => [d.id, doorGuide(map, d, space.doors, roofs, indoors)])),
        entries: Object.fromEntries(map.entries.map(e => [e.id, entryShown(e, roofs, indoors)])) };
};

test('roofedRegions keeps the old roof permission at every 16px position, doors closed and open', () => {
    let checked = 0;
    for (const map of Object.values(maps)) for (const open of [false, true]) {
        const space = context(map, open), rows = map.cells.length * 2, cols = map.cells[0].length * 2;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            // Coast: the resident footprint (10..18 x 7..12) plus three tiles on every side.
            if (map.id === 'coast' && (x < 14 || x > 44 || y < 8 || y > 32)) continue;
            const player = { x: x * 16 + 8, y: y * 16 + 8 };
            assert.deepEqual(roofedRegions(space, player), oldRoofs(space, player), `${map.id} ${open} ${player.x},${player.y}`);
            checked++;
        }
    }
    assert.ok(checked > 40000, `checked ${checked}`);
});

test('door walls follow the anchor axis: front and storage doors are east-west, the six side doors north-south', () => {
    const walls = Object.fromEntries(Object.values(BUILDING_WORLD.maps).flatMap(m => m.doors.map(d => [d.id, doorWall(d)])));
    assert.deepEqual(walls, {
        'resident-front': 'ew', 'resident-west': 'ns', 'resident-east': 'ns', 'resident-storage': 'ew',
        'resident-f2-west': 'ns', 'resident-f2-east': 'ns', 'resident-b1-west': 'ns', 'resident-b1-east': 'ns',
    });
    assert.deepEqual(Object.values(maps).flatMap(m => m.entries.map(entryKind)).filter(k => k === 'portal'), []);
    assert.equal(entryKind(BUILDING_WORLD.maps.coast.entries.find(e => e.id === 'resident-up')!), 'up');
    assert.equal(entryKind(BUILDING_WORLD.maps.coast.entries.find(e => e.id === 'resident-basement')!), 'down');
});

test('outside the closed building only the front door is known, with its state; inner doors and stairs stay hidden', () => {
    const map = BUILDING_WORLD.maps.coast, g = guides(map, { x: 464, y: 448 });
    assert.deepEqual(g.roofs.map(r => r.name), ['褪色居民楼 · 一楼']);
    assert.equal(g.indoors, false);
    assert.deepEqual(g.doors, { 'resident-front': { wall: 'ew', state: 'closed' }, 'resident-west': null, 'resident-east': null });
    assert.deepEqual(g.entries, { 'resident-up': false, 'resident-basement': false });
    assert.deepEqual(guides(map, { x: 464, y: 448 }, true).doors['resident-front'], { wall: 'ew', state: 'open' });
});

test('inside the ground floor every door shows its state and both stairs are shown', () => {
    const map = BUILDING_WORLD.maps.coast, g = guides(map, { x: 464, y: 336 });
    assert.deepEqual(g.roofs, []); assert.equal(g.indoors, true);
    assert.deepEqual(g.doors, { 'resident-front': { wall: 'ew', state: 'closed' }, 'resident-west': { wall: 'ns', state: 'closed' }, 'resident-east': { wall: 'ns', state: 'closed' } });
    assert.deepEqual(g.entries, { 'resident-up': true, 'resident-basement': true });
});

test('upstairs: the landing shows the storage door state; a door between two covered rooms shows no state', () => {
    const map = BUILDING_WORLD.maps['resident-f2'];
    const landing = guides(map, { x: 304, y: 80 });
    assert.ok(landing.roofs.some(r => r.name === '东侧住户'), 'east room stays covered behind the closed storage door');
    assert.deepEqual(landing.doors['resident-storage'], { wall: 'ew', state: 'closed' });
    assert.equal(landing.entries['resident-down'], true);
    const west = guides(map, { x: 80, y: 176 });
    assert.ok(!west.roofs.some(r => r.name === '西侧住户'));
    assert.deepEqual(west.doors['resident-storage'], { wall: 'ew', state: 'unknown' });
    assert.deepEqual(guides(map, { x: 80, y: 176 }, true).doors['resident-storage'], { wall: 'ew', state: 'unknown' }, 'an opened hidden door is not revealed');
    // The west door sits in the wall column between the west room and the corridor, outside every roof.
    assert.deepEqual(west.doors['resident-f2-west'], { wall: 'ns', state: 'closed' });
});

test('floorIndoors: the street and the mall ring are outdoors; the mall shell and the upper and lower floors are indoors', () => {
    const coast = BUILDING_WORLD.maps.coast, f1 = MALL_WORLD.maps['mall-f1'], f2 = MALL_WORLD.maps['mall-f2'];
    for (const p of [{ x: 464, y: 448 }, { x: 208, y: 432 }, { x: 1200, y: 800 }, { x: 640, y: 300 }]) assert.equal(floorIndoors(coast, p), false, `${p.x},${p.y}`);
    for (const p of [{ x: 336, y: 240 }, { x: 592, y: 400 }, { x: 464, y: 336 }]) assert.equal(floorIndoors(coast, p), true, `${p.x},${p.y}`);
    const at = (x: number, y: number) => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
    for (const p of [at(4, 10), at(30, 3), at(70, 20), at(30, 52), at(72, 30), at(68, 50)]) assert.equal(floorIndoors(f1, p), false, `f1 ${p.x},${p.y}`);
    for (const p of [at(14, 41), at(60, 11), at(60, 45), at(38, 16), at(40, 25), at(20, 12)]) assert.equal(floorIndoors(f1, p), true, `f1 ${p.x},${p.y}`);
    assert.equal(floorIndoors(f2, at(68, 30)), false, 'the second-floor terrace is outdoors');
    assert.equal(floorIndoors(f2, at(40, 25)), true);
    for (const map of [BUILDING_WORLD.maps['resident-f2'], BUILDING_WORLD.maps['resident-b1']])
        for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[0].length; x++) assert.equal(floorIndoors(map, at(x, y)), true, `${map.id} ${x},${y}`);
});

test('stair labels avoid region names, platforms and each other, below first', () => {
    const at = { x: 304, y: 80 }, size = { w: 60, h: 16 };
    assert.deepEqual(stairLabelPlacement(at, size, []), { x: 274, y: 100, w: 60, h: 16 });
    const below: Rect = { x: 270, y: 105, w: 70, h: 14 }, above: Rect = { x: 270, y: 41, w: 70, h: 14 };
    assert.deepEqual(stairLabelPlacement(at, size, [below]), { x: 274, y: 44, w: 60, h: 16 });
    const left = stairLabelPlacement(at, size, [below, above]);
    assert.deepEqual(left, { x: 224, y: 72, w: 60, h: 16 });
    const player = { x: at.x - 16, y: at.y - 16, w: 32, h: 32 };
    assert.ok(left.x + left.w <= player.x, 'never covers a player standing on the platform');
});

test('touchesRoof: a label goes above the roof only when part of it lies under one; shared edges do not count', () => {
    const roof: Rect = { x: 256, y: 96, w: 96, h: 128 };
    assert.equal(touchesRoof([roof], { x: 224, y: 72, w: 60, h: 24 }), false, 'ends on the roof edge');
    assert.equal(touchesRoof([roof], { x: 224, y: 72, w: 60, h: 25 }), true, 'one pixel row under the roof');
    assert.equal(touchesRoof([], { x: 0, y: 0, w: 10, h: 10 }), false);
    // The f2 landing label sits left of the platform, clear of the covered east room, so it stays on the floor layer.
    const map = BUILDING_WORLD.maps['resident-f2'], roofs = roofedRegions(context(map), { x: 304, y: 80 });
    assert.equal(touchesRoof(roofs, { x: 224, y: 72, w: 60, h: 16 }), false);
    assert.equal(touchesRoof(roofs, { x: 274, y: 100, w: 60, h: 16 }), true, 'below the platform it would lie on the east room roof');
});
