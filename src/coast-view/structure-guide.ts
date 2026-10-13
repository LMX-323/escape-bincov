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
