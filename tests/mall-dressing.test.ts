import test from 'node:test';
import assert from 'node:assert/strict';
import { mallWorldV2 } from '../src/mall-world';
import { MALL_FURNITURE, MALL_V2_LAYOUT } from '../src/mall-layout-v2';
import { MALL_SPRITE_SIZE, PROCEDURAL, WALL_LIFT, mallDecals, mallGround, mallLights, mallLintels, mallProps, mallSigns, mallWallCells, mallWallFace, mallWallParts, mallWallProps, mallWallRole, type DressMap } from '../src/coast-view/mall-dressing';
import { DECAL_SIZE } from '../src/coast-view/art/mall';

const V2 = mallWorldV2();
const dress = (id: string): DressMap => { const m = V2.maps[id]; return { mapId: id, cells: m.cells, regions: m.regions!, decorations: m.decorations! }; };

test('商场布置表：每件家具一张贴图，立在占地南边线上；货架连排两端用端头、中间用中段', () => {
    for (const id of ['mall-f1', 'mall-f2'] as const) {
        const m = dress(id), props = mallProps(m), sorted = props.filter(p => p.layer === 'sorted');
        const pieces = MALL_V2_LAYOUT[id].reduce((n, p) => { const t = MALL_FURNITURE[p.type]; return n + ('run' in t ? p.n ?? 1 : 1); }, 0);
        assert.equal(sorted.length, pieces, `${id} one sprite per piece or run module`);
        assert.equal(props.filter(p => p.layer === 'overhead').length, MALL_V2_LAYOUT[id].filter(p => p.type === 'cafe-table').length);
        for (const p of sorted) {
            const name = p.assets[0].replace(PROCEDURAL, '').replace(/^mall-|-v1$/g, ''), key = name.replace(/-(end-[ew]|mid-.*|[ab])$/, '');
            const size = MALL_SPRITE_SIZE[key] ?? MALL_SPRITE_SIZE[name];
            assert.ok(size, `${p.assets[0]} has a planned size`);
            assert.equal(p.y + size[1], p.z, `${p.assets[0]} stands on its footprint's south edge`);
            assert.ok(p.assets.every(a => /^mall-[a-z0-9-]+-v1$/.test(a) || a === PROCEDURAL + 'stairs-up' || a === PROCEDURAL + 'stairs-down'));
            assert.ok(p.foot && p.foot.y + p.foot.h === p.z, `${p.assets[0]} carries its footprint for the contact shadow`);
        }
        for (const run of MALL_V2_LAYOUT[id].filter(p => p.type === 'gondola')) {
            const row = sorted.filter(p => p.z === (run.y + 1) * 32 && p.x >= run.x * 32 && p.x < (run.x + run.n!) * 32).sort((a, b) => a.x - b.x);
            assert.equal(row.length, run.n);
            assert.equal(row[0].assets[0], 'mall-prop-gondola-end-w-v1'); assert.equal(row.at(-1)!.assets[0], 'mall-prop-gondola-end-e-v1');
            for (const mid of row.slice(1, -1)) assert.match(mid.assets[0], /^mall-prop-gondola-mid-/);
        }
    }
});

test('商场布置表：家具格不当墙画；大堂北墙是玻璃幕墙，后场墙用后场墙面；地面按区域选材质', () => {
    const f1 = dress('mall-f1'), walls = new Set(mallWallCells(f1).map(c => `${c.x},${c.y}`));
    for (const d of f1.decorations.filter(d => d.kind === 'B' && /^[a-z-]+$/.test(d.name.split('#')[0]))) assert.ok(!walls.has(`${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}`));
    assert.match(mallWallFace(f1, 58, 6)[0], /^mall-wall-curtain/);
    assert.match(mallWallFace(f1, 40, 13)[0], /^mall-wall-service-/);
    assert.equal(mallGround(f1, 59, 3)[0].startsWith('mall-ground-plaza-'), true);
    assert.equal(mallGround(f1, 60, 10)[0].startsWith('mall-ground-terrazzo-'), true);
    assert.equal(mallGround(f1, 35, 23)[0].startsWith('mall-ground-tile-large-'), true);
    assert.equal(mallGround(dress('mall-f2'), 59, 22)[0].startsWith('mall-ground-wood-'), true);
    // One standing board per gondola run (on its west end) plus fresh, cold and home-store boards; nothing hangs.
    assert.equal(mallSigns(f1).length, MALL_V2_LAYOUT['mall-f1'].filter(p => p.type === 'gondola').length + 3);
    assert.equal(mallSigns(dress('mall-f2')).length, 2);
    for (const s of [...mallSigns(f1), ...mallSigns(dress('mall-f2'))]) assert.ok(s.layer === 'sorted' && s.assets[0].startsWith(PROCEDURAL + 'sign:'));
});

test('商场布置表：一层地图边是封锁围挡，二层楼外是虚空、只有露台一圈是矮女儿墙；东西向门洞上有门头', () => {
    const f1 = dress('mall-f1'), f2 = dress('mall-f2');
    assert.equal(mallWallRole(f1, 30, 0), 'boundary'); assert.equal(mallWallRole(f1, 8, 20), 'wall');
    assert.equal(mallWallRole(f2, 2, 2), 'void'); assert.equal(mallWallRole(f2, 30, 52), 'void');
    for (const [x, y] of [[73, 30], [68, 25], [68, 45]]) assert.equal(mallWallRole(f2, x, y), 'parapet', `${x},${y}`);
    assert.equal(mallWallRole(f2, 64, 30), 'wall');
    assert.equal(WALL_LIFT.parapet, 24); assert.deepEqual(mallWallParts(f2, 2, 2), { cap: [], face: [], rail: [] });
    assert.match(mallWallParts(f1, 30, 0).face[0], /^mall-wall-hoarding-/);
    const l1 = new Map(mallLintels(f1).map(l => [`${l.x},${l.y}`, l.assets[0]]));
    for (const x of [59, 60, 61]) assert.equal(l1.get(`${x},6`), 'mall-wall-lintel-entrance-v1');
    for (const x of [36, 37, 38]) assert.equal(l1.get(`${x},13`), 'mall-wall-lintel-shutter-v1');
    assert.ok(mallLintels(f2).every(l => mallWallRole(f2, l.x - 1, l.y) !== 'void'));
    for (const m of [f1, f2]) for (const p of mallWallProps(m)) assert.ok(p.assets.every(a => /^mall-[a-z0-9-]+-v1$/.test(a)));
    // Ceiling lights are light sources only: the ceiling is cut away, so no fixture sprite is drawn.
    for (const m of [f1, f2]) for (const l of mallLights(m)) assert.deepEqual(Object.keys(l).sort(), ['broken', 'r', 'x', 'y']);
});

test('商场布置表：地面杂物只落在空地上，宽件占两格空地，不压家具和墙，位置稳定', () => {
    for (const id of ['mall-f1', 'mall-f2']) {
        const m = dress(id), decals = mallDecals(m), seen = new Set<string>();
        assert.ok(decals.length > 15, `${id} has clutter (${decals.length})`);
        const furniture = new Set(m.decorations.filter(d => /^[a-z-]+/.test(d.name)).map(d => `${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}`));
        for (const d of decals) {
            const [w] = DECAL_SIZE[d.kind], cells = w / 32;
            for (let i = 0; i < cells; i++) {
                const x = d.x / 32 + i, y = d.y / 32, key = `${x},${y}`;
                assert.equal(m.cells[y][x], 'floor', `${id} ${d.kind} at ${key}`); assert.ok(!furniture.has(key)); assert.ok(!seen.has(key), `${key} used twice`); seen.add(key);
            }
        }
        assert.deepEqual(mallDecals(m), decals, 'stable');
    }
});
