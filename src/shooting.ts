/**
 * Weapon handling for the raid Runtime (PR #39): how stance, motion, the trigger and recoil decide where a shot goes.
 * Pure rules on plain numbers: no clock, RNG, DOM or save access. The Runtime owns one AimState per raid and never
 * saves it (maintainer, 2026-10-22): a Runtime built from a checkpoint starts from `unsteadyAim()`, so a refresh or a
 * reload can never leave the gun steadier than playing on would have.
 *
 * Every rule is a closed form of elapsed time with the input held constant (linear raise, exponential sway approach,
 * a settle delay, exponential recovery), so splitting an interval into more substeps changes nothing but rounding.
 */
import type { WeaponDef } from './domain';

export type FireMode = 'semi' | 'auto';
/** Two parameter sets for the maintainer's playtest, brisk and steady; the final values follow it. */
export type Feel = 'brisk' | 'steady';
export const FEELS: readonly Feel[] = ['brisk', 'steady'];

/** One weapon's handling in one feel. Angles in radians (full cone angles), times in seconds, rates per second. */
export interface Handling {
    mode: FireMode;
    /** Cone at rest from the hip, as a multiple of the weapon's base `spread`. */
    hip: number;
    /** Cone multiple (of the hip cone) once a precise aim is fully raised, and the seconds it takes to raise. */
    precise: number; raise: number;
    /** Extra cone multiple at full sway. */
    sway: number;
    /** Cone added per shot and its cap. */
    bloom: number; bloomMax: number;
    /** Muzzle drift per shot toward the shooter's right (clockwise on the map) and its cap. */
    kick: number; kickMax: number;
    /** Seconds after the last shot before bloom and drift recover, then the share they lose per second (exponential). */
    settle: number; recover: number;
}
/** Body sway rules of a feel: targets while walking and sprinting, approach rates, turn and draw impulses. */
export interface SwayRules { walk: number; sprint: number; up: number; down: number; turn: number; draw: number }

export interface AimState {
    /** Precise aim raised, 0 (hip) to 1. */
    raise: number;
    /** Body sway, 0 (settled) to 1. */
    sway: number;
    /** Bloom and drift as shares of the held weapon's caps, 0 to 1, so they carry over a weapon switch. */
    bloom: number; drift: number;
    /** Seconds left before bloom and drift start to recover. */
    settle: number;
}
export const unsteadyAim = (): AimState => ({ raise: 0, sway: 1, bloom: 1, drift: 0, settle: 0 });

/** What the shooter did over an interval: distance walked as a share of walk speed, sprint, and the precise button. */
export interface Motion { pace: number; sprint: boolean; precise: boolean }

const SWAY: Record<Feel, SwayRules> = {
    brisk: { walk: .5, sprint: 1, up: 10, down: 5, turn: .35, draw: .6 },
    steady: { walk: .7, sprint: 1, up: 10, down: 3, turn: .55, draw: .9 },
};
const semi = (h: Omit<Handling, 'mode'>): Handling => ({ mode: 'semi', ...h });
const NONE = semi({ hip: 1, precise: 1, raise: .2, sway: 0, bloom: 0, bloomMax: 0, kick: 0, kickMax: 0, settle: 0, recover: 1 });
const HANDLING: Record<string, Record<Feel, Handling>> = {
    knife: { brisk: NONE, steady: NONE },
    pistol: {
        brisk: semi({ hip: 1.6, precise: .3, raise: .18, sway: 1.2, bloom: .012, bloomMax: .05, kick: .006, kickMax: .035, settle: .1, recover: 8 }),
        steady: semi({ hip: 1.8, precise: .22, raise: .3, sway: 1.8, bloom: .016, bloomMax: .07, kick: .009, kickMax: .05, settle: .15, recover: 5 }),
    },
    carbine: {
        brisk: semi({ hip: 2, precise: .25, raise: .25, sway: 1.4, bloom: .01, bloomMax: .04, kick: .008, kickMax: .04, settle: .12, recover: 7 }),
        steady: semi({ hip: 2.2, precise: .2, raise: .4, sway: 2, bloom: .014, bloomMax: .06, kick: .012, kickMax: .06, settle: .18, recover: 4.5 }),
    },
    shotgun: {
        brisk: semi({ hip: 1, precise: .6, raise: .15, sway: .8, bloom: .03, bloomMax: .06, kick: .02, kickMax: .04, settle: .2, recover: 6 }),
        steady: semi({ hip: 1, precise: .5, raise: .25, sway: 1.2, bloom: .04, bloomMax: .08, kick: .03, kickMax: .06, settle: .25, recover: 4 }),
    },
    m4a1: {
        brisk: { mode: 'auto', hip: 2.2, precise: .3, raise: .25, sway: 1.5, bloom: .006, bloomMax: .05, kick: .005, kickMax: .05, settle: .1, recover: 6 },
        steady: { mode: 'auto', hip: 2.4, precise: .22, raise: .4, sway: 2.2, bloom: .009, bloomMax: .08, kick: .008, kickMax: .08, settle: .15, recover: 4 },
    },
};
export const handlingOf = (weaponId: string, feel: Feel): Handling => HANDLING[weaponId]?.[feel] ?? NONE;
export const swayRules = (feel: Feel): SwayRules => SWAY[feel];

/**
 * Sample automatic rifle for the playtest (maintainer, 2026-10-22): only the ?test=1 driver, an explicit sample URL
 * and the 试枪场 page hand it out. It is not an item, never enters a shop, a loot table or a save, and reloads from an
 * endless reserve; #28 adds the real one.
 */
export const SAMPLE_GUNS: Readonly<Record<'m4a1', WeaponDef>> = {
    m4a1: { id: 'm4a1', name: 'M4A1 样本', ammo: 'ammoR', magazine: 30, damage: 24, range: 600, cooldown: .1, reload: 2.1, pellets: 1, spread: .03 },
};

/**
 * Playtest marks a maintainer may add to the raid URL: `feel=steady` (or `brisk`) picks the parameter set, and
 * `gun=m4a1` hands the sample rifle, the latter only together with a `sample=` mark. Neither is saved.
 */
export function playtestMarks(search: string): { feel: Feel | null; gun: 'm4a1' | null } {
    const p = new URLSearchParams(search), feel = p.get('feel');
    return { feel: FEELS.find(f => f === feel) ?? null, gun: p.has('sample') && p.get('gun') === 'm4a1' ? 'm4a1' : null };
}

/** Advance an aim over `seconds` of unchanged motion. Mutates and returns `aim`. */
export function advanceAim(aim: AimState, h: Handling, rules: SwayRules, seconds: number, motion: Motion): AimState {
    if (seconds <= 0) return aim;
    // A precise aim rises over `raise` seconds and drops twice as fast; sprinting lowers it.
    aim.raise = motion.precise && !motion.sprint ? Math.min(1, aim.raise + seconds / h.raise) : Math.max(0, aim.raise - 2 * seconds / h.raise);
    const target = Math.min(1, Math.min(1, motion.pace) * rules.walk + (motion.sprint ? rules.sprint : 0));
    aim.sway = target + (aim.sway - target) * Math.exp(-(aim.sway < target ? rules.up : rules.down) * seconds);
    const quiet = Math.max(0, seconds - aim.settle);
    aim.settle = Math.max(0, aim.settle - seconds);
    if (quiet > 0) { const k = Math.exp(-h.recover * quiet); aim.bloom *= k; aim.drift *= k; }
    return aim;
}
/** A sharp turn shakes the aim in proportion to the angle swept. */
export function turnAim(aim: AimState, rules: SwayRules, radians: number): void { aim.sway = Math.min(1, aim.sway + rules.turn * Math.abs(radians)); }
/** Drawing another weapon: the aim starts from the hip and the body sways at least `draw`. Bloom and drift carry over. */
export function drawAim(aim: AimState, rules: SwayRules): void { aim.raise = 0; aim.sway = Math.max(aim.sway, rules.draw); }
/** Full cone a shot fired now scatters over. `body` is the character's own multiplier (rpgMultipliers().recoil). */
export const coneOf = (aim: AimState, w: WeaponDef, h: Handling, body = 1) =>
    (w.spread * h.hip * (1 + (h.precise - 1) * aim.raise) * (1 + h.sway * aim.sway) + h.bloomMax * aim.bloom) * body;
/** Where the next shot is centred relative to the aim: radians toward the shooter's right. */
export const driftOf = (aim: AimState, h: Handling, body = 1) => h.kickMax * aim.drift * body;
/** Recoil of one shot: more bloom and drift, and recovery waits for `settle` again. */
export function recoil(aim: AimState, h: Handling): void {
    if (h.bloomMax > 0) aim.bloom = Math.min(1, aim.bloom + h.bloom / h.bloomMax);
    if (h.kickMax > 0) aim.drift = Math.min(1, aim.drift + h.kick / h.kickMax);
    aim.settle = h.settle;
}
