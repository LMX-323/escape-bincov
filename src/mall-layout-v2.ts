/**
 * Mall layout revision 2 (data only). Furniture is laid out per cell so its collision class (B blocks bodies, sight and
 * bullets; M blocks bodies; V is visual) is materialized into the same cells the art stands on, and the 2.5D view can
 * draw each piece from the decoration it owns. Outer walls, rooms, passages, anchors, exits and the four connection
 * groups stay as in revision 1; only the stairs S-N landing moves inside the same two lobbies. Regions listed in
 * MALL_V2_REGIONS are dressed by this table instead of the revision-1 corner markers; the rest keep revision 1.
 */
import type { Point } from './world';

export type FurnitureKind = 'B' | 'M' | 'V';
/** `run`: modules repeat east-west and join like wall segments (the view picks end and middle pieces). */
export interface FurnitureType { w: number; h: number; kind: FurnitureKind; run?: true }
export const MALL_FURNITURE = {
    gondola: { w: 1, h: 1, kind: 'B', run: true },
    fridge: { w: 1, h: 1, kind: 'B', run: true },
    partition: { w: 1, h: 1, kind: 'B', run: true },
    column: { w: 1, h: 1, kind: 'B' },
    directory: { w: 1, h: 1, kind: 'B' },
    pylon: { w: 1, h: 1, kind: 'B' },
    'stairs-up': { w: 3, h: 3, kind: 'B' },
    'stairs-down': { w: 3, h: 3, kind: 'M' },
    sandbags: { w: 2, h: 1, kind: 'M' },
    sofa: { w: 2, h: 1, kind: 'M' },
    cart: { w: 1, h: 1, kind: 'M' },
    'promo-table': { w: 2, h: 1, kind: 'M' },
    pallet: { w: 1, h: 1, kind: 'M' },
    'ice-bed': { w: 2, h: 1, kind: 'M' },
    'scale-counter': { w: 1, h: 1, kind: 'M' },
    freezer: { w: 2, h: 1, kind: 'M' },
    bench: { w: 2, h: 1, kind: 'M' },
    planter: { w: 1, h: 1, kind: 'M' },
    bed: { w: 2, h: 2, kind: 'M' },
    'coffee-table': { w: 1, h: 1, kind: 'M' },
    'floor-lamp': { w: 1, h: 1, kind: 'M' },
    'cafe-table': { w: 1, h: 1, kind: 'M' },
    'planter-box': { w: 2, h: 1, kind: 'M' },
    stanchions: { w: 2, h: 1, kind: 'M' },
    adboard: { w: 2, h: 1, kind: 'M' },
    'gondola-toppled': { w: 2, h: 1, kind: 'M' },
    debris: { w: 1, h: 1, kind: 'M' },
} as const satisfies Record<string, FurnitureType>;
export type FurnitureName = keyof typeof MALL_FURNITURE;
/** `x, y`: north-west cell. `n`: number of modules for run furniture (east-west). */
export interface Placement { type: FurnitureName; x: number; y: number; n?: number }

/** Regions dressed by revision 2 (the walkable demo route). */
export const MALL_V2_REGIONS = ['O-02', 'F1-03', 'F1-04', 'F1-05', 'F1-11', 'F2-13', 'F2-14', 'F2-18'] as const;

const cell = (x: number, y: number): Point => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
/** Same ids and pairs as revision 1. S-N moves east so its flight stands beside the entrance instead of in front of it. */
export const MALL_V2_STAIRS = [
    ['S-W', cell(14, 41), cell(14, 31)], ['S-N', cell(62, 13), cell(62, 13)],
    ['S-E', cell(60, 45), cell(60, 45)], ['E-C', cell(38, 16), cell(38, 19)],
] as const;

const gondolaRow = (y: number, toppledEnd = false): Placement[] => [
    { type: 'gondola', x: 31, y, n: 6 }, { type: 'gondola', x: 40, y, n: 5 },
    // A toppled end lies where it stood (low), so the aisles beside it keep their width.
    ...(toppledEnd ? [{ type: 'gondola', x: 47, y, n: 4 }, { type: 'gondola-toppled', x: 51, y }] as Placement[] : [{ type: 'gondola', x: 47, y, n: 6 }] as Placement[]),
];
const vignette = (y: number, room: 'living' | 'bed'): Placement[] => [
    { type: 'partition', x: 57, y, n: 4 },
    ...(room === 'living'
        ? [{ type: 'sofa', x: 58, y: y + 1 }, { type: 'coffee-table', x: 58, y: y + 3 }, { type: 'floor-lamp', x: 60, y: y + 1 }] as Placement[]
        : [{ type: 'bed', x: 58, y: y + 1 }, { type: 'floor-lamp', x: 60, y: y + 1 }] as Placement[]),
];

export const MALL_V2_LAYOUT: Record<'mall-f1' | 'mall-f2', readonly Placement[]> = {
    'mall-f1': [
        // O-02: the approach to the main entrance; the north exit circle and the doorway stay open.
        { type: 'pylon', x: 55, y: 3 }, { type: 'stanchions', x: 62, y: 2 }, { type: 'stanchions', x: 62, y: 4 },
        { type: 'adboard', x: 51, y: 2 }, { type: 'planter', x: 53, y: 5 }, { type: 'planter', x: 46, y: 5 },
        // F1-11: stairs flight against the east facade, directory column facing the doorway, low sandbag barricade.
        { type: 'stairs-up', x: 61, y: 9 }, { type: 'directory', x: 58, y: 11 }, { type: 'sandbags', x: 57, y: 8 },
        { type: 'bench', x: 57, y: 14 }, { type: 'planter', x: 63, y: 15 }, { type: 'debris', x: 57, y: 10 },
        // North aisle frontage of the supermarket (west of the power room only, so its two-row aisle stays clear).
        { type: 'promo-table', x: 31, y: 19 }, { type: 'cart', x: 34, y: 19 }, { type: 'pallet', x: 42, y: 19 },
        // F1-03: three east-west gondola rows, a three-cell cross aisle under the escalator and a two-cell one.
        ...gondolaRow(22), ...gondolaRow(25), ...gondolaRow(28, true),
        { type: 'column', x: 30, y: 26 }, { type: 'column', x: 53, y: 26 }, { type: 'debris', x: 53, y: 21 },
        // F1-04: two fresh islands of ice beds with weighing counters.
        { type: 'ice-bed', x: 32, y: 36 }, { type: 'ice-bed', x: 34, y: 36 }, { type: 'ice-bed', x: 36, y: 36 }, { type: 'scale-counter', x: 38, y: 36 },
        { type: 'ice-bed', x: 32, y: 39 }, { type: 'ice-bed', x: 34, y: 39 }, { type: 'scale-counter', x: 36, y: 39 },
        { type: 'column', x: 30, y: 37 }, { type: 'column', x: 42, y: 37 },
        // F1-05: a wall of upright fridges facing the cold aisle, chest freezer islands.
        { type: 'fridge', x: 45, y: 33, n: 8 },
        { type: 'freezer', x: 45, y: 36 }, { type: 'freezer', x: 49, y: 36 }, { type: 'freezer', x: 45, y: 39 }, { type: 'freezer', x: 49, y: 39 },
    ],
    'mall-f2': [
        // F2-14: stairwell opening above the F1 flight, directory column, bench.
        { type: 'stairs-down', x: 61, y: 9 }, { type: 'directory', x: 58, y: 11 }, { type: 'bench', x: 57, y: 14 },
        { type: 'planter', x: 57, y: 8 }, { type: 'planter', x: 63, y: 15 },
        // F2-13: four sample rooms behind east-west partitions; the facade-side aisle (x 61-63) leads to both terrace doors.
        ...vignette(17, 'living'), ...vignette(24, 'bed'), ...vignette(31, 'living'), ...vignette(38, 'bed'),
        // F2-18: planters along the parapets and cafe tables, clear of the edge anchor and both doors.
        { type: 'planter-box', x: 66, y: 26 }, { type: 'planter-box', x: 70, y: 26 }, { type: 'planter-box', x: 70, y: 44 },
        { type: 'cafe-table', x: 67, y: 31 }, { type: 'cafe-table', x: 70, y: 31 }, { type: 'cafe-table', x: 67, y: 36 }, { type: 'cafe-table', x: 69, y: 40 },
    ],
};

/** Decoration name per cell: plain type for single cells and run modules, `type#dx,dy` for parts of larger pieces. */
export function furnitureCellName(type: FurnitureName, dx: number, dy: number): string {
    const t: FurnitureType = MALL_FURNITURE[type];
    return t.run || t.w * t.h === 1 ? type : `${type}#${dx},${dy}`;
}
export function parseFurnitureName(name: string): { type: FurnitureName; dx: number; dy: number } | null {
    const match = /^([a-z-]+)(?:#(\d+),(\d+))?$/.exec(name);
    if (!match || !Object.hasOwn(MALL_FURNITURE, match[1])) return null;
    return { type: match[1] as FurnitureName, dx: Number(match[2] ?? 0), dy: Number(match[3] ?? 0) };
}
