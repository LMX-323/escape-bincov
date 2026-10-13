/**
 * Mall dressing table for the 2.5D view: which ground material, wall face and furniture sprite each cell of a mall
 * floor shows. Pure data from the map's cells, regions and furniture decorations (src/mall-layout-v2.ts); nothing here
 * decides collision, visibility or loot. Each choice is a list of asset ids in preference order, so a missing sample
 * falls back to the next one (and finally to the procedural placeholder of the caller).
 */
import { MALL_FURNITURE, parseFurnitureName, type FurnitureName } from '../mall-layout-v2';

export interface DressRegion { id?: string; x: number; y: number; w: number; h: number; inside?: boolean }
export interface DressDecoration { x: number; y: number; kind: string; name: string }
export interface DressMap {
    mapId: string;
    cells: readonly (readonly string[])[];
    regions: readonly DressRegion[];
    decorations: readonly DressDecoration[];
}
/** `x, y`: top-left of the canvas in world px; `z`: south edge used for depth sorting; `layer` overhead draws above actors. */
export interface DressSprite { assets: readonly string[]; x: number; y: number; z: number; layer: 'sorted' | 'overhead'; emit: boolean }

const TILE = 32;
const hash = (x: number, y: number, salt: number) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};
const id = (name: string) => `mall-${name}-v1`;
const pick = (x: number, y: number, salt: number, options: readonly string[]) => options[Math.floor(hash(x, y, salt) * options.length)];

/** Canvas sizes of the mall samples (Sol batch 1 brief); the sprite stands on its footprint's south edge. */
export const MALL_SPRITE_SIZE: Record<string, readonly [number, number]> = {
    'prop-gondola': [32, 72], 'prop-fridge': [32, 80], 'prop-partition': [32, 80], 'prop-column': [32, 80], 'prop-directory': [32, 80],
    'prop-pylon': [32, 96], 'stairs-up': [96, 144], 'stairs-down': [96, 112], 'prop-sandbags-2': [64, 46], 'prop-sofa-s': [64, 52],
    'prop-cart': [32, 54], 'prop-promo-table': [64, 54], 'prop-pallet-wrapped': [32, 56], 'prop-ice-bed': [64, 54], 'prop-scale-counter': [32, 56],
    'prop-freezer': [64, 54], 'prop-bench': [64, 50], 'prop-planter': [32, 62], 'prop-bed': [64, 84], 'prop-coffee-table': [32, 44],
    'prop-floor-lamp': [32, 76], 'prop-cafe-table': [32, 52], 'prop-planter-box': [64, 56], 'prop-stanchions': [64, 44],
    'prop-adboard-fallen': [64, 44], 'overhead-umbrella': [64, 88], 'sign-hanging-green': [48, 18],
};
const SINGLE: Partial<Record<FurnitureName, string>> = {
    column: 'prop-column', directory: 'prop-directory', pylon: 'prop-pylon', 'stairs-up': 'stairs-up', 'stairs-down': 'stairs-down',
    sandbags: 'prop-sandbags-2', sofa: 'prop-sofa-s', cart: 'prop-cart', 'promo-table': 'prop-promo-table', pallet: 'prop-pallet-wrapped',
    'ice-bed': 'prop-ice-bed', 'scale-counter': 'prop-scale-counter', freezer: 'prop-freezer', bench: 'prop-bench', planter: 'prop-planter',
    bed: 'prop-bed', 'coffee-table': 'prop-coffee-table', 'floor-lamp': 'prop-floor-lamp', 'cafe-table': 'prop-cafe-table',
    'planter-box': 'prop-planter-box', stanchions: 'prop-stanchions', adboard: 'prop-adboard-fallen', partition: 'prop-partition',
};
const EMITS = new Set(['prop-fridge-a', 'prop-fridge-b', 'prop-directory', 'prop-pylon', 'prop-floor-lamp', 'wall-curtain', 'wall-curtain-broken', 'wall-window-2f']);

const contains = (r: DressRegion, x: number, y: number) => x * TILE >= r.x && x * TILE < r.x + r.w && y * TILE >= r.y && y * TILE < r.y + r.h;
const regionAt = (m: DressMap, x: number, y: number) => m.regions.find(r => r.inside !== false && contains(r, x, y)) ?? m.regions.find(r => contains(r, x, y));
const insideFootprint = (x: number, y: number) => x >= 8 && x <= 64 && y >= 6 && y <= 48;

/** Ground material ids, preferred first. Unlisted regions keep the large tile inside and the plaza paving outside. */
export function mallGround(m: DressMap, x: number, y: number): string[] {
    const r = regionAt(m, x, y)?.id ?? '';
    const by: Record<string, string> = {
        'O-02': 'ground-plaza', 'F1-11': 'ground-terrazzo', 'F2-14': 'ground-terrazzo', 'F1-12': 'ground-terrazzo', 'F2-15': 'ground-terrazzo',
        'F1-04': 'ground-tile-fresh', 'F1-05': 'ground-tile-cold', 'F2-13': 'ground-wood', 'F2-18': 'ground-deck',
    };
    const base = by[r] ?? (r.startsWith('O-') || !insideFootprint(x, y) ? 'ground-plaza' : 'ground-tile-large');
    const fallback = base === 'ground-plaza' ? [] : ['ground-tile-large'];
    return [...[`${base}-${hash(x >> 1, y >> 1, 3) < .5 ? 'a' : 'b'}`, `${base}-a`].map(id), ...fallback.map(f => id(`${f}-a`))];
}

const furnitureAt = (m: DressMap) => {
    const at = new Map<string, ReturnType<typeof parseFurnitureName>>();
    for (const d of m.decorations) { const f = parseFurnitureName(d.name); if (f) at.set(`${Math.floor(d.x / TILE)},${Math.floor(d.y / TILE)}`, f); }
    return at;
};
/** Wall cells that are furniture are drawn as props, never as wall segments. */
export function mallWallCells(m: DressMap): { x: number; y: number }[] {
    const f = furnitureAt(m), out: { x: number; y: number }[] = [];
    m.cells.forEach((row, y) => row.forEach((c, x) => { if (c === 'wall' && !f.has(`${x},${y}`)) out.push({ x, y }); }));
    return out;
}
const BACK_OF_HOUSE = new Set(['F1-09', 'F1-10', 'F1-15', 'F2-09', 'F2-10', 'F2-17', 'F1-13', 'F2-16', 'F2-12']);
/** Face of a wall cell as seen from the south: glass curtain at the lobbies, service block at back-of-house rooms. */
export function mallWallFace(m: DressMap, x: number, y: number): string[] {
    const south = regionAt(m, x, y + 1)?.id ?? '', own = m.regions.find(r => contains(r, x, y))?.id ?? '';
    if (m.mapId === 'mall-f1' && y === 6 && x >= 54 && x <= 63) return [id(hash(x, y, 9) < .2 ? 'wall-curtain-broken' : 'wall-curtain'), id('wall-curtain')];
    if (m.mapId === 'mall-f2' && y === 6 && x >= 54 && x <= 63) return [id('wall-window-2f'), id('wall-facade-int-a'), id('wall-service-a')];
    if (BACK_OF_HOUSE.has(own) || BACK_OF_HOUSE.has(south)) return [id(hash(x, y, 7) < .5 ? 'wall-service-a' : 'wall-service-b'), id('wall-service-a')];
    return [id('wall-facade-int-a'), id('wall-service-a')];
}
export const wallHasEmit = (asset: string) => EMITS.has(asset.replace(/^mall-|-v1$/g, ''));

/** One sprite per furniture piece (multi-cell pieces at their north-west part) plus the umbrellas over cafe tables. */
export function mallProps(m: DressMap): DressSprite[] {
    const at = furnitureAt(m), out: DressSprite[] = [];
    const same = (x: number, y: number, type: string) => at.get(`${x},${y}`)?.type === type;
    for (const [key, f] of at) {
        if (!f || f.dx !== 0 || f.dy !== 0) continue;
        const [x, y] = key.split(',').map(Number), t = MALL_FURNITURE[f.type];
        let names: string[];
        if (f.type === 'gondola') {
            const w = same(x - 1, y, 'gondola'), e = same(x + 1, y, 'gondola');
            names = !w ? ['prop-gondola-end-w'] : !e ? ['prop-gondola-end-e']
                : [`prop-gondola-${pick(x, y, 17, ['mid-full-a', 'mid-full-b', 'mid-full-a', 'mid-sparse', 'mid-looted'])}`, 'prop-gondola-mid-full-a'];
        } else if (f.type === 'fridge') names = [`prop-fridge-${hash(x, y, 19) < .7 ? 'a' : 'b'}`, 'prop-fridge-a'];
        else names = [SINGLE[f.type]!];
        const size = MALL_SPRITE_SIZE[names[0].replace(/-(end-[ew]|mid-.*|[ab])$/, '')] ?? MALL_SPRITE_SIZE[names[0]] ?? [t.w * TILE, t.h * TILE];
        const south = (y + t.h) * TILE;
        out.push({ assets: names.map(id), x: x * TILE, y: south - size[1], z: south, layer: 'sorted', emit: names.some(n => EMITS.has(n)) });
        if (f.type === 'cafe-table') {
            const [uw, uh] = MALL_SPRITE_SIZE['overhead-umbrella'];
            out.push({ assets: [id('overhead-umbrella')], x: x * TILE + 16 - uw / 2, y: y * TILE + 16 - (uh - 1), z: south, layer: 'overhead', emit: false });
        }
    }
    return out.sort((a, b) => a.z - b.z || a.x - b.x);
}

/** Hanging signs over the supermarket aisles (overhead, no footprint): anchor is the sign's top centre at ceiling height. */
export function mallSigns(m: DressMap): DressSprite[] {
    if (m.mapId !== 'mall-f1') return [];
    const hang = (x: number, y: number, asset: string): DressSprite => ({ assets: [id(asset)], x: x * TILE + 16 - 24, y: y * TILE + 16 - 60, z: (y + 1) * TILE, layer: 'overhead', emit: false });
    return [hang(34, 24, 'sign-hanging-green'), hang(43, 27, 'sign-hanging-green'), hang(50, 24, 'sign-hanging-green'),
        hang(36, 38, 'sign-hanging-blue'), hang(48, 35, 'sign-hanging-frost')];
}
