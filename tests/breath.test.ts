import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { EnemyState } from '../src/checkpoint';
import type { LayeredRaid, PursuitState, WorldDefinition } from '../src/expansion-state';
import { advanceBreath, breathChance, clearBreath, idleBreath, type BreathState } from '../src/breath';
import { aimTarget, resolveLayerShot } from '../src/layer-transition';
import { advanceAim, handlingOf, preciseHeld, SWAY, type Motion } from '../src/shooting';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const foe = (uid: string, x: number, y: number, hp = 30): EnemyState => ({ uid, id: 'scav', x, y, hp, rotation: 0, home: { x, y }, target: { x, y },
    state: 'patrol', timer: 2, cooldown: .7, path: [], repath: 0, alert: 0 });
/** Substeps of `seconds` at a display rate, or split unevenly. */
const frames = (seconds: number, rate: number) => Array.from({ length: Math.round(seconds * rate) }, () => 1 / rate);
const uneven = (seconds: number) => [3, 1, 4, 1, 5, 9, 2, 6].map(p => p / 31 * seconds);
const SPLITS: [string, (seconds: number) => number[]][] = [['30 Hz', s => frames(s, 30)], ['60 Hz', s => frames(s, 60)], ['144 Hz', s => frames(s, 144)], ['uneven', uneven]];

/**
 * The aim held on `sight` over these substeps, shooting at `shots` (raid seconds) the way runTrigger splits a substep at
 * a shot: charge up to the shot, snapshot, clear, then charge the rest of the substep.
 */
function drive(steps: number[], shots: number[] = [], sight: string | null = 'enemy-0', breath: BreathState = idleBreath()) {
    const fired: { target: string | null; chance: number }[] = [];
    let now = 0;
    for (const step of steps) {
        let left = step;
        for (const at of shots) if (at > now && at < now + left) {
            advanceBreath(breath, at - now, true, true, sight); left -= at - now; now = at;
            fired.push({ target: breath.target, chance: breathChance(breath.seconds) }); clearBreath(breath);
        }
        advanceBreath(breath, left, true, true, sight); now += left;
    }
    return { breath, fired };
}

/** Upstairs (inner floor x 32..288, y 32..224), the player at (48, 112) aiming along +x; the border wall is 240 px out. */
function scene(enemies: EnemyState[], edit?: (world: WorldDefinition, raid: LayeredRaid) => void) {
    const world = prototypeWorld(), state = prototypeRaid(D.newSave(), world), raid = state.raid!;
    raid.currentMap = 'upstairs'; raid.player = { x: 48, y: 112, rotation: 0 };
    raid.maps.upstairs.enemies = enemies; raid.pursuits = []; edit?.(world, raid);
    /** What aimTarget names, checked against a bullet fired straight down the same ray (resolveLayerShot). */
    const sight = (reach = 677) => {
        const copy = structuredClone(state), p = raid.player;
        let hit: string | null = null;
        resolveLayerShot(copy, world, raid.currentMap, { uid: 'probe', x: p.x, y: p.y, rotation: p.rotation, vx: Math.cos(p.rotation) * 760,
            vy: Math.sin(p.rotation) * 760, left: reach, damage: 1, enemy: false }, true, uid => { hit = uid; });
        const seen = aimTarget(raid, world, reach);
        assert.equal(seen, hit, 'the sight ray and a straight bullet agree');
        return seen;
    };
    return { world, raid, sight };
}
const chaser = (enemy: EnemyState, sourceMap: string): PursuitState => ({ id: `pursuit-${enemy.uid}`, enemy, sourceMap,
    targetMap: sourceMap === 'upstairs' ? 'downstairs' : 'upstairs', entry: sourceMap === 'upstairs' ? 'down' : 'up',
    path: [{ x: enemy.x, y: enemy.y }, { x: 48, y: 48 }], distance: 100, speed: 50, registeredAt: 0, arrivalAt: 3, waiting: false });

test('CP-12 breath: 0/1/1.5/3/over 3 s give 0/10/15/30/30%, continuous, the same at 30, 60, 144 Hz and uneven substeps', () => {
    assert.deepEqual([0, .5, 1, 1.5, 2.25, 3, 3.5, 60].map(breathChance), [0, .05, .1, .15, .225, .3, .3, .3]);
    for (const [seconds, chance] of [[0, 0], [1, .1], [1.5, .15], [3, .3], [4.5, .3]]) for (const [label, split] of SPLITS) {
        const { breath } = drive(split(seconds));
        assert.ok(close(breath.seconds, seconds) && close(breathChance(breath.seconds), chance), `${seconds} s at ${label}: ${breath.seconds}`);
    }
    // A shot at 1.2345 s takes that charge; the aim held on charges again from zero, with no release needed.
    for (const [label, split] of SPLITS) {
        const { breath, fired } = drive(split(3), [1.2345]);
        assert.equal(fired.length, 1, label); assert.equal(fired[0].target, 'enemy-0');
        assert.ok(close(fired[0].chance, .12345) && close(breath.seconds, 3 - 1.2345), `${label}: ${fired[0].chance} ${breath.seconds}`);
    }
});

test('CP-13 the edge of the hitbox charges as fast as the centre; walking charges on desktop, not on touch; no perk, no charge', () => {
    // Sight is binary: a ray grazing the hit circle names the enemy exactly as one through its centre, and nothing else
    // about the aim reaches the charge.
    const edge = (offset: number) => {
        const { raid, sight } = scene([foe('enemy-0', 200, 112)]);
        raid.player.rotation = Math.asin(offset / 152);
        return sight();
    };
    assert.deepEqual([0, 7, 13.9, -13.9, 14.1].map(edge), ['enemy-0', 'enemy-0', 'enemy-0', 'enemy-0', null]);
    const centre = drive(frames(2, 60), [], edge(0)).breath, rim = drive(frames(2, 60), [], edge(13.9)).breath;
    assert.deepEqual(rim, centre); assert.ok(close(breathChance(centre.seconds), .2));

    // The effective precise aim is #39's: the precise button unless sprinting (walking allowed); on touch, standing with
    // the stick in the inner ring or firing past it; walking on touch drops it. It matches when advanceAim keeps the raise.
    const motions: [Motion, boolean][] = [
        [{ pace: 0, sprint: false, precise: true }, true], [{ pace: .7, sprint: false, precise: true }, true],
        [{ pace: 1.6, sprint: true, precise: true }, false], [{ pace: 0, sprint: false, precise: false }, false],
        [{ pace: 0, sprint: false, precise: false, hold: 'aim' }, true], [{ pace: 0, sprint: false, precise: false, hold: 'fire' }, true],
        [{ pace: .04, sprint: false, precise: false, hold: 'aim' }, true], [{ pace: .7, sprint: false, precise: false, hold: 'aim' }, false],
        [{ pace: .7, sprint: false, precise: false, hold: 'fire' }, false], [{ pace: 1.6, sprint: true, precise: false, hold: 'fire' }, false],
    ];
    for (const [motion, held] of motions) {
        assert.equal(preciseHeld(motion), held, JSON.stringify(motion));
        const aim = advanceAim({ raise: .5, sway: 0, bloom: 0, drift: 0, settle: 0 }, handlingOf('carbine'), SWAY, .05, motion);
        assert.equal(aim.raise >= .5, held, `advanceAim agrees: ${JSON.stringify(motion)}`);
    }
    const walk = (motion: Motion, owned = true) => {
        const breath = idleBreath();
        for (const step of frames(1.5, 60)) advanceBreath(breath, step, owned, preciseHeld(motion), 'enemy-0');
        return breath;
    };
    assert.ok(close(breathChance(walk({ pace: .7, sprint: false, precise: true }).seconds), .15), 'desktop: walking charges');
    assert.deepEqual(walk({ pace: .7, sprint: false, precise: false, hold: 'aim' }), idleBreath(), 'touch: walking does not');
    assert.deepEqual(walk({ pace: 0, sprint: false, precise: true }, false), idleBreath(), 'no perk, no charge');
    // Touch: standing charges; the first walking substep clears it.
    const touch = walk({ pace: 0, sprint: false, precise: false, hold: 'fire' });
    assert.ok(close(touch.seconds, 1.5));
    advanceBreath(touch, 1 / 60, true, preciseHeld({ pace: .7, sprint: false, precise: false, hold: 'fire' }), 'enemy-0');
    assert.deepEqual(touch, idleBreath());
});

test('CP-14 the target: switching restarts from zero; walls, closed doors, range and corpses cut it; windows pass; nearest, then uid', () => {
    // A new target never inherits time, and returning to the old one starts over too.
    const breath = drive(frames(2, 60)).breath;
    advanceBreath(breath, 1 / 60, true, true, 'enemy-1');
    assert.equal(breath.target, 'enemy-1'); assert.ok(close(breath.seconds, 1 / 60));
    drive(frames(.5, 60), [], 'enemy-1', breath); assert.ok(close(breath.seconds, .5 + 1 / 60));
    advanceBreath(breath, 1 / 60, true, true, 'enemy-0'); assert.ok(close(breath.seconds, 1 / 60));
    // Losing sight, sprinting or leaving the precise aim clears it; so do the Runtime's interrupt events.
    advanceBreath(breath, 1 / 60, true, true, null); assert.deepEqual(breath, idleBreath());
    drive(frames(1, 60), [], 'enemy-0', breath);
    advanceBreath(breath, 1 / 60, true, preciseHeld({ pace: 1.6, sprint: true, precise: true }), 'enemy-0'); assert.deepEqual(breath, idleBreath());
    drive(frames(1, 60), [], 'enemy-0', breath); assert.deepEqual(clearBreath(breath), idleBreath());

    // The ray stops at the first wall or closed door; a window or an open door lets it through.
    const blocked = (cell: 'wall' | 'window' | 'low' | 'door-closed' | 'door-open') => scene([foe('enemy-0', 200, 112)], (world, raid) => {
        world.maps.upstairs.cells[3][4] = cell.startsWith('door') ? 'wall' : cell as 'wall' | 'window' | 'low';
        if (cell.startsWith('door')) {
            world.maps.upstairs.doors.push({ id: 'door-1', x: 4, y: 3, anchors: [{ x: 112, y: 112 }, { x: 176, y: 112 }] });
            raid.maps.upstairs.doors['door-1'] = cell === 'door-open';
        }
    }).sight();
    assert.deepEqual((['wall', 'door-closed', 'window', 'low', 'door-open'] as const).map(blocked), [null, null, 'enemy-0', 'enemy-0', 'enemy-0']);
    // The weapon's reach: the near edge of the hit circle is 138 px out.
    const far = scene([foe('enemy-0', 200, 112)]);
    assert.deepEqual([130, 137.9, 138, 677, 0, -5].map(reach => far.sight(reach)), [null, null, 'enemy-0', 'enemy-0', null, null]);
    // Corpses are skipped; the nearest live enemy wins whatever its uid; at equal distance the uid decides ('en' order).
    assert.equal(scene([foe('enemy-0', 120, 112, 0)]).sight(), null);
    assert.equal(scene([foe('enemy-a', 120, 112, 0), foe('enemy-b', 200, 112)]).sight(), 'enemy-b');
    assert.equal(scene([foe('enemy-a', 200, 112), foe('enemy-z', 120, 112)]).sight(), 'enemy-z');
    assert.equal(scene([foe('enemy-b', 150, 107), foe('enemy-a', 150, 117)]).sight(), 'enemy-a');
    assert.equal(scene([foe('enemy-9', 150, 107), foe('enemy-10', 150, 117)]).sight(), 'enemy-10');
    // A pursuer this layer still owns counts; one owned by the other layer, or an enemy of another layer, does not.
    assert.equal(scene([foe('enemy-a', 200, 112)], (_, raid) => { raid.pursuits = [chaser(foe('enemy-p', 150, 112), 'upstairs')]; }).sight(), 'enemy-p');
    assert.equal(scene([], (_, raid) => { raid.pursuits = [chaser(foe('enemy-p', 150, 112), 'downstairs')]; }).sight(), null);
    assert.equal(scene([], (_, raid) => { raid.maps.downstairs.enemies = [foe('enemy-d', 150, 112)]; }).sight(), null);
});
