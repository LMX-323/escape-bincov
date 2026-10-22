import type { BuildingDef, DoorDef, MapDef, Point, Rect } from '../raid-runtime/contract';

const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/** A layered map is one floor, including the landings and perimeter outside its named rooms. */
export function structureBounds(map: MapDef, building: BuildingDef): Rect {
  return map.key.mapId !== 'coast' && map.buildings.filter(b => b.regionIds.length).length === 1 ? map.bounds : building;
}

/** Display-only cutaway. This must never be used as actor, loot, decal or sound visibility permission. */
export function occupiedStructure(map: MapDef, player: Point): BuildingDef | null {
  return map.buildings.find(b => b.regionIds.length > 0 && contains(structureBounds(map, b), player)) ?? null;
}

export function structureContains(map: MapDef, building: BuildingDef | null, point: Point): boolean {
  return !!building && contains(structureBounds(map, building), point);
}

/** Static connections can be read throughout the occupied building's current floor. Other interiors stay covered. */
export function knownStructurePoint(map: MapDef, point: Point, revealed: Readonly<Record<string, boolean>>, occupied: BuildingDef | null): boolean {
  if (structureContains(map, occupied, point)) return true;
  return map.regions.filter(r => r.inside && contains(r, point)).every(r => revealed[r.id] === true);
}

export function knownDoor(map: MapDef, door: DoorDef, revealed: Readonly<Record<string, boolean>>, occupied: BuildingDef | null): boolean {
  return structureContains(map, occupied, { x: door.x * 32 + 16, y: door.y * 32 + 16 })
    || door.anchors.some(p => knownStructurePoint(map, p, revealed, occupied));
}

/**
 * Fail-closed visibility of a world point, the Runtime's rule (presentation.ts): regions may overlap, so a point is shown
 * only when every inside region containing it is revealed. Points in no inside region (streets, corridors) are shown.
 */
export function shownAt(map: MapDef, revealed: Readonly<Record<string, boolean>>, p: Point): boolean {
  return map.regions.every(r => !r.inside || !contains(r, p) || revealed[r.id] === true);
}
/** The region a point counts as: a containing unrevealed region wins, ties by stable id (presentation.ts). */
export function regionAtClosed(map: MapDef, revealed: Readonly<Record<string, boolean>>, p: Point): string | null {
  return map.regions.filter(r => r.inside && contains(r, p))
    .sort((a, b) => Number(!!revealed[a.id]) - Number(!!revealed[b.id]) || a.id.localeCompare(b.id, 'en'))[0]?.id ?? null;
}

/**
 * Whether the Runtime shows an actor now: the player always, anyone else when the room it counts as (fail closed) is
 * revealed or it stands in no room. Hit feedback checks the target this way as well as the hit point: a bullet's contact
 * lies on a circle around the target and can fall outside its room. A target the frame does not carry is left to the
 * hit point alone.
 */
export function actorShown(frame: { actors: readonly { uid: string; regionId: string | null }[]; revealed: Readonly<Record<string, boolean>> }, uid: string): boolean {
  if (uid === 'player') return true;
  const a = frame.actors.find(x => x.uid === uid);
  return !a || a.regionId === null || frame.revealed[a.regionId] === true;
}

export const isMall = (map: MapDef) => map.buildings.some(b => b.kind === 'mall');
/**
 * Rooms whose walls a mall floor cuts away: the rooms the player stands in, with one cell of hysteresis so the cutaway
 * does not flicker at a doorway: a room joins once the player is a cell inside it and leaves once the player is a cell
 * outside it. `previous` is last frame's set.
 */
export function mallCutRooms(map: MapDef, player: Point, previous: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const r of map.regions) {
    if (!r.inside) continue;
    const m = previous.has(r.id) ? -32 : Math.min(32, Math.floor(Math.min(r.w, r.h) / 2) - 1);
    if (contains({ x: r.x + m, y: r.y + m, w: r.w - m * 2, h: r.h - m * 2 }, player)) out.add(r.id);
  }
  return out;
}
/**
 * Facade walls a mall floor never cuts: the north front (rows 6-7 and the stepped north-west block) and the west and east
 * sides (columns 8-9 and 63-64). Cutting them would only show the outside; the south front hides the rooms' last row,
 * so it is cut with the room behind it.
 */
const facade = (p: Point) => {
  const x = Math.floor(p.x / 32), y = Math.floor(p.y / 32);
  return x >= 8 && x <= 64 && y >= 6 && y <= 48 && (y <= 7 || x <= 9 || x >= 63 || y <= 10 && x < 13 - (y - 6));
};
const inRoom = (map: MapDef, x: number, y: number) => map.regions.some(r => r.inside && contains(r, { x: x * 32 + 16, y: y * 32 + 16 }));
/**
 * Walls hiding the corridor the player walks in (indoor floor in no room): along the open cells of the player's row, out
 * to the next wall or room, the first wall up to two rows ahead (south). It changes only when the player changes row,
 * so it does not slide along with the player. Keys `x,y`.
 */
export function mallCorridorWalls(map: MapDef, player: Point): Set<string> {
  const out = new Set<string>(), px = Math.floor(player.x / 32), py = Math.floor(player.y / 32);
  const indoor = (x: number, y: number) => x >= 8 && x <= 64 && y >= 6 && y <= 48;
  const corridor = (x: number, y: number) => indoor(x, y) && map.cells[y]?.[x] !== undefined && map.cells[y][x] !== 'wall' && !inRoom(map, x, y);
  if (!corridor(px, py)) return out;
  let x0 = px, x1 = px;
  while (corridor(x0 - 1, py)) x0--;
  while (corridor(x1 + 1, py)) x1++;
  for (let x = x0; x <= x1; x++) for (let d = 1; d <= 2; d++) {
    const c = map.cells[py + d]?.[x];
    if (c === 'wall') { out.add(`${x},${py + d}`); break; }
    if (!corridor(x, py + d)) break;
  }
  return out;
}
/**
 * Mall floors are one building each, so the layered-floor rule would cut every wall of the floor away at once. Here the
 * cutaway is the rooms in `rooms` (each with its south wall row) and, in a corridor, the `corridor` walls just ahead;
 * the facade's north and side walls are never cut, so the building reads the same from the plaza and from inside. Nor is
 * a sealed block (the maintenance core): there is no floor behind it, so cutting it would only show stacked wall feet. On
 * F2 it lies inside F2-01. Walls that hide the player still fade through the focus rule. `p` is a wall cell's centre.
 * Display only.
 */
export function mallCutaway(map: MapDef, rooms: ReadonlySet<string>, corridor: ReadonlySet<string> = new Set()): (p: Point) => boolean {
  const rects = map.regions.filter(r => rooms.has(r.id)).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h + 32 }));
  const sealed = map.regions.filter(r => r.sealed);
  return p => !facade(p) && !sealed.some(r => contains(r, p)) && (rects.some(r => contains(r, p)) || corridor.has(`${Math.floor(p.x / 32)},${Math.floor(p.y / 32)}`));
}
