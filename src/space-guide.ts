import type { Point } from './world';
import { corridor, inSpace, separation, type DoorDefinition, type EntryDefinition, type SpaceContext, type SpaceDefinition } from './spatial';

/**
 * Phaser-free rules for the ordinary raid view's door and stair guides.
 * The roof rule is the content permission: enemies, loot and corpses stay under every roofed region.
 * Guides only describe fixed structure, and a door's open or closed state is shown only when the
 * door can be seen from an uncovered cell.
 */
export type Region = NonNullable<SpaceDefinition['regions']>[number];
export type Rect = { x: number; y: number; w: number; h: number };
export type DoorWall = 'ns' | 'ew';
export type DoorGuideState = 'open' | 'closed' | 'unknown';
export interface DoorGuide { wall: DoorWall; state: DoorGuideState }

/** Anchors on the west and east sides mean the door sits in a north-south wall. Same rule as raid-runtime/presentation.ts. */
export const doorWall = (door: DoorDefinition): DoorWall => door.anchors[0].x !== door.anchors[1].x ? 'ns' : 'ew';
/** Stair direction from the existing destination label. Same rule as raid-runtime/presentation.ts. */
export const entryKind = (entry: EntryDefinition): 'up' | 'down' | 'portal' =>
    entry.label?.startsWith('上楼') ? 'up' : entry.label?.startsWith('下楼') ? 'down' : 'portal';

export const rectContains = (r: Rect, p: Point): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/**
 * Regions that stay covered for this player position. This is the RaidScene.drawRoofs rule unchanged:
 * an inside region is uncovered only when the player stands in it, or is within 80px of its clamped
 * interior point with low-tide sight to it. Sealed regions are always covered.
 */
export function roofedRegions(context: SpaceContext, player: Point): Region[] {
    const sight: SpaceContext = { ...context, highTide: false };
    return (context.definition.regions ?? []).filter(r => {
        if (r.inside === false) return false;
        const near = { x: Math.max(r.x + 40, Math.min(r.x + r.w - 40, player.x)), y: Math.max(r.y + 40, Math.min(r.y + r.h - 40, player.y)) };
        return !(!r.sealed && (rectContains(r, player) || separation(player, near) < 80 && corridor(sight, player, near, 'sight', 0)));
    });
}

export const underRoof = (roofs: readonly Rect[], p: Point): boolean => roofs.some(r => rectContains(r, p));

/**
 * Whether the player is inside the building shell of this floor. An upper or lower floor without
 * outdoor regions is entirely indoors. The street map and maps with outdoor regions use the bounding
 * box of their inside regions; outdoor regions are excluded unless an inside region also covers the point.
 */
export function floorIndoors(map: SpaceDefinition, p: Point): boolean {
    if (!inSpace(map, p)) return false;
    const regions = map.regions ?? [], inside = regions.filter(r => r.inside !== false), outdoor = regions.filter(r => r.inside === false);
    // The street map has no outdoor regions, but only its building footprint is indoors.
    if (map.id !== 'coast' && !outdoor.length) return true;
    if (!inside.length) return false;
    const x = Math.min(...inside.map(r => r.x)), y = Math.min(...inside.map(r => r.y));
    const box = { x, y, w: Math.max(...inside.map(r => r.x + r.w)) - x, h: Math.max(...inside.map(r => r.y + r.h)) - y };
    return rectContains(box, p) && (inside.some(r => rectContains(r, p)) || !outdoor.some(r => rectContains(r, p)));
}

/**
 * The guide for one door, or null when it must stay hidden. The state is shown when the door cell or
 * either anchor is uncovered. A door known only because the player is indoors on this floor shows no
 * state, so a door between two covered rooms never tells whether someone opened it.
 */
export function doorGuide(map: SpaceDefinition, door: DoorDefinition, doors: Readonly<Record<string, boolean>>, roofs: readonly Rect[], indoors: boolean): DoorGuide | null {
    const cell = { x: (door.x + .5) * map.tile, y: (door.y + .5) * map.tile }, wall = doorWall(door);
    if ([cell, ...door.anchors].some(p => !underRoof(roofs, p))) return { wall, state: doors[door.id] ? 'open' : 'closed' };
    return indoors ? { wall, state: 'unknown' } : null;
}

/** A stair is shown when its platform is uncovered, or when the player is inside the same building floor. */
export const entryShown = (entry: EntryDefinition, roofs: readonly Rect[], indoors: boolean): boolean => indoors || !underRoof(roofs, entry.at);

/**
 * Place a stair label beside its platform without covering region names, other stair labels or a
 * player standing on the platform. Candidates are tried below, above, left, then right.
 */
export function stairLabelPlacement(at: Point, size: { w: number; h: number }, blocked: readonly Rect[], gap = 4): Rect {
    const half = 16 + gap, candidates: Rect[] = [
        { x: at.x - size.w / 2, y: at.y + half, w: size.w, h: size.h },
        { x: at.x - size.w / 2, y: at.y - half - size.h, w: size.w, h: size.h },
        { x: at.x - half - size.w, y: at.y - size.h / 2, w: size.w, h: size.h },
        { x: at.x + half, y: at.y - size.h / 2, w: size.w, h: size.h },
    ];
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    return candidates.find(c => !blocked.some(b => overlaps(c, b))) ?? candidates[0];
}
