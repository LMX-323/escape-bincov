import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_WORLD } from '../src/building-world';
import { checkpointBodyFits, traversable } from '../src/spatial';
import { shotBarrier } from '../src/layer-transition';
import { benchRaid, replay, mouse, LANE } from './fixtures/shooting-bench';

// S1 of PR #39: a shot fired with the body pressed against a wall, a closed door or a convex corner stops at that
// surface, in all eight directions: the bullet stops exactly at the first opaque boundary on its way out of the body.
// Before S1 a bullet was born 17 px out, up to 7 px inside a wall ('start-blocked'), or past a corner it had cut.
const map = BUILDING_WORLD.maps.coast, TILE = 32;
const DIRS = Array.from({ length: 8 }, (_, k) => k * Math.PI / 4);

/** Free cells next to an opaque one in direction (dx, dy); a diagonal needs both side cells free (a convex corner). */
function spots(dx: number, dy: number, door: boolean, doors: Readonly<Record<string, boolean>>) {
    const ctx = { definition: map, doors, highTide: false };
    const free = (x: number, y: number) => traversable(ctx, { x: (x + .5) * TILE, y: (y + .5) * TILE }, 'bullet');
    const closedDoor = (x: number, y: number) => map.doors.some(d => d.x === x && d.y === y && !doors[d.id]);
    const out: { x: number; y: number }[] = [];
    for (let y = 2; y < map.cells.length - 2; y++) for (let x = 2; x < map.cells[0].length - 2; x++) {
        if (!free(x, y) || free(x + dx, y + dy) || dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
        if (door === closedDoor(x + dx, y + dy)) out.push({ x, y });
    }
    const far = (c: { x: number; y: number }) => Math.hypot(c.x * TILE - LANE.at.x, c.y * TILE - LANE.at.y);
    return out.sort((a, b) => far(a) - far(b));
}

test('S1: shots fired flush against walls, closed doors and convex corners stop at the surface in all eight directions', t => {
    for (const [angle, door] of [...DIRS.map(a => [a, false] as const), [0, true] as const, [Math.PI / 2, true] as const]) {
        const b = benchRaid(), r = b.runtime, doors = { ...r.space!.doors }, ctx = { definition: map, doors, highTide: r.highTide };
        b.driver.freezeAI(true);
        const dx = Math.round(Math.cos(angle)), dy = Math.round(Math.sin(angle));
        // The nearest such spot with no enemy around, the body pushed as far toward the surface as it fits.
        const spot = spots(dx, dy, door, doors).map(c => {
            let p = { x: (c.x + .5) * TILE, y: (c.y + .5) * TILE };
            if (!checkpointBodyFits(ctx, p)) return null;
            for (let i = 0; i < 64; i++) {
                const q = { x: p.x + Math.cos(angle) * .5, y: p.y + Math.sin(angle) * .5 };
                if (!checkpointBodyFits(ctx, q)) break;
                p = q;
            }
            return p;
        }).find(p => p && r.enemies.every(e => e.hp <= 0 || Math.hypot(e.x - p.x, e.y - p.y) > 120)) ?? null;
        assert.ok(spot, `no spot for ${angle} ${door}`);
        b.driver.placePlayer(spot, angle);
        r.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 };
        const log = replay(b, (time, previous) => ({ ...mouse([0])(time, previous), aim: angle }), .2, 60);
        const label = `${Math.round(angle * 180 / Math.PI)}°${door ? ' door' : ''}`;
        assert.equal(log.shots.length, 1, label);
        assert.equal(log.impacts.length, 1, `${label}: ${JSON.stringify(log.impacts)}`);
        const [impact] = log.impacts, a = log.shots[0].angles[0], ux = Math.cos(a), uy = Math.sin(a);
        assert.equal(impact.reason, 'blocked', label);
        // Where the bullet stopped is the first opaque boundary on its ray out of the body.
        const stop = shotBarrier(ctx, { uid: 'probe', x: spot.x, y: spot.y, rotation: a, vx: ux, vy: uy, left: 400, damage: 1, enemy: false }, ux, uy);
        const along = (impact.contact!.x - spot.x) * ux + (impact.contact!.y - spot.y) * uy;
        assert.ok(Math.abs(along - stop) < 1e-6, `${label}: stopped at ${along.toFixed(2)} px, first surface at ${stop.toFixed(2)} px`);
        t.diagnostic(`${label}: body at (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}), stopped ${along.toFixed(2)} px out`);
    }
});
