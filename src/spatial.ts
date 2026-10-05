import type { Point } from './world';

/** A map's geometry is immutable; door state belongs to its raid snapshot. */
export type Cell = 'floor' | 'wall' | 'window' | 'low' | 'tide';
export interface DoorDefinition {
    id: string; x: number; y: number; anchors: [Point, Point];
}
export interface EntryDefinition {
    id: string; at: Point; targetMap: string; targetEntry: string; landing: Point;
}
export interface SpaceDefinition {
    id: string; name: string; floor: string; tile: number; cells: Cell[][];
    doors: DoorDefinition[]; entries: EntryDefinition[];
}
export type SpaceContext = { definition: SpaceDefinition; doors: Record<string, boolean>; highTide: boolean };
export type Channel = 'body' | 'sight' | 'bullet' | 'path';
export const separation = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function spaceSize(map: SpaceDefinition) {
    return { width: map.cells[0].length * map.tile, height: map.cells.length * map.tile };
}
export function inSpace(map: SpaceDefinition, p: Point, radius = 0): boolean {
    const size = spaceSize(map);
    return [p.x, p.y, radius].every(Number.isFinite) && radius >= 0
        && p.x - radius >= 0 && p.y - radius >= 0 && p.x + radius < size.width && p.y + radius < size.height;
}
export function traversable(context: SpaceContext, point: Point, channel: Channel, radius = 0): boolean {
    const map = context.definition;
    if (!inSpace(map, point, radius)) return false;
    const minX = Math.floor((point.x - radius) / map.tile), maxX = Math.floor((point.x + radius) / map.tile);
    const minY = Math.floor((point.y - radius) / map.tile), maxY = Math.floor((point.y + radius) / map.tile);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const door = map.doors.find(d => d.x === x && d.y === y);
        if (door) {
            if (!Object.hasOwn(context.doors, door.id)) return false;
            if (!context.doors[door.id] && channel !== 'path') return false;
            continue;
        }
        const cell = map.cells[y]?.[x];
        if (!cell || cell === 'wall') return false;
        if ((channel === 'body' || channel === 'path')
            && (cell === 'window' || cell === 'low' || (cell === 'tide' && context.highTide))) return false;
    }
    return true;
}
export function corridor(context: SpaceContext, from: Point, to: Point, channel: Channel, radius = 0): boolean {
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return false;
    const steps = Math.max(1, Math.ceil(separation(from, to) / 4));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!traversable(context, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, channel, radius)) return false;
    }
    return true;
}
/** Cardinal paths use complete body clearance and allow an enemy to open a normal door. */
export function spacePath(context: SpaceContext, from: Point, to: Point, openDoors = false): Point[] {
    const map = context.definition, cols = map.cells[0].length, rows = map.cells.length, tile = map.tile;
    const center = (x: number, y: number) => ({ x: (x + .5) * tile, y: (y + .5) * tile });
    const sx = Math.floor(from.x / tile), sy = Math.floor(from.y / tile), tx = Math.floor(to.x / tile), ty = Math.floor(to.y / tile);
    const channel = openDoors ? 'path' : 'body';
    if (!traversable(context, center(sx, sy), channel, 10) || !traversable(context, center(tx, ty), channel, 10)) return [];
    const start = sy * cols + sx, goal = ty * cols + tx, parent = new Int32Array(cols * rows).fill(-1);
    const queue = [start]; parent[start] = start;
    for (let read = 0; read < queue.length; read++) {
        const key = queue[read];
        if (key === goal) {
            const path: Point[] = [];
            for (let at = goal; ; at = parent[at]) { path.push(center(at % cols, Math.floor(at / cols))); if (at === start) break; }
            return path.reverse();
        }
        const x = key % cols, y = Math.floor(key / cols);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = x + dx, ny = y + dy, next = ny * cols + nx;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || parent[next] !== -1) continue;
            if (!traversable(context, center(nx, ny), channel, 10)) continue;
            parent[next] = key; queue.push(next);
        }
    }
    return [];
}
/** Specified landing first; then a 64px circle, distance / row / column order. */
export function findLanding(context: SpaceContext, at: Point, occupied: readonly Point[], radius = 10): Point | null {
    const valid = (p: Point) => traversable(context, p, 'body', radius) && occupied.every(actor => separation(actor, p) >= radius + 10);
    if (valid(at)) return { ...at };
    const map = context.definition, candidates: Point[] = [];
    for (let row = Math.max(0, Math.floor((at.y - 64) / map.tile)); row <= Math.min(map.cells.length - 1, Math.floor((at.y + 64) / map.tile)); row++) {
        for (let col = Math.max(0, Math.floor((at.x - 64) / map.tile)); col <= Math.min(map.cells[0].length - 1, Math.floor((at.x + 64) / map.tile)); col++) {
            const p = { x: (col + .5) * map.tile, y: (row + .5) * map.tile };
            if (separation(at, p) <= 64 && valid(p)) candidates.push(p);
        }
    }
    candidates.sort((a, b) => separation(at, a) - separation(at, b) || a.y - b.y || a.x - b.x);
    return candidates[0] ?? null;
}

export function validateSpaces(maps: Record<string, SpaceDefinition>): void {
    const fail = () => { throw new Error('地图定义无效。'); };
    for (const [id, map] of Object.entries(maps)) {
        if (map.id !== id || map.tile !== 32 || !map.cells.length || map.cells.length > 256
            || !map.cells[0].length || map.cells[0].length > 256
            || map.cells.some(row => row.length !== map.cells[0].length || row.some(cell => !['floor', 'wall', 'window', 'low', 'tide'].includes(cell)))) fail();
        if (new Set(map.doors.map(d => d.id)).size !== map.doors.length || new Set(map.entries.map(e => e.id)).size !== map.entries.length) fail();
        for (const door of map.doors) {
            if (!Number.isInteger(door.x) || !Number.isInteger(door.y) || !map.cells[door.y]?.[door.x] || door.anchors.length !== 2
                || !door.anchors.every(p => inSpace(map, p, 10))) fail();
        }
        for (const entry of map.entries) {
            const target = maps[entry.targetMap], reverse = target?.entries.find(e => e.id === entry.targetEntry);
            if (!reverse || reverse.targetMap !== id || reverse.targetEntry !== entry.id
                || !inSpace(map, entry.at, 10) || !inSpace(target, entry.landing, 10)) fail();
        }
    }
}
