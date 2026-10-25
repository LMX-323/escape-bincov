import type { Point, WeaponLook } from '../raid-runtime/contract';

/** Private #75 playtest candidates, in world pixels and display seconds; not the gun's angular handling. */
export const WEAPON_RETRACTION_PX = 3;
export const WEAPON_RETRACTION_SECONDS = .08;

export type RetractionState = { weapon: WeaponLook | null; seq: number; left: number };
export const idleRetraction = (): RetractionState => ({ weapon: null, seq: 0, left: 0 });
export type RetractionShot = Readonly<{ seq: number; weapon: WeaponLook }>;
const firearm = (weapon: WeaponLook) => weapon === 'pistol' || weapon === 'carbine' || weapon === 'shotgun' || weapon === 'rifle';

/** One bounded state per drawn actor, discarded with that actor/map/epoch. No deferred per-shot queue.
 * Every shot packet draws the original pose, including packets with several shots or a repeated event. The first
 * following packet without a shot first ages the pulse on the scene's existing display clock. An interval longer
 * than the pulse expires it without drawing a late peak. Thus at 10 Hz even a single shot can have no recoil frame;
 * never move a shot's muzzle or defer an expired pulse to force one into view.
 */
export function stepRetraction(state: RetractionState, weapon: WeaponLook, dt: number, eligible: boolean, shot?: RetractionShot): number {
    if (state.weapon !== weapon) { state.weapon = weapon; state.left = 0; }
    const allowed = eligible && firearm(weapon);
    if (!allowed) state.left = 0;
    if (shot) {
        if (shot.seq > state.seq) {
            state.seq = shot.seq;
            state.left = allowed && shot.weapon === weapon ? WEAPON_RETRACTION_SECONDS : 0;
        } else state.left = Math.max(0, state.left - Math.max(0, dt));
        return 0;
    }
    if (!allowed) return 0;
    state.left = Math.max(0, state.left - Math.max(0, dt));
    return WEAPON_RETRACTION_PX * state.left / WEAPON_RETRACTION_SECONDS;
}

/** The original whole-pixel grip projection when back=0. Arms and weapon rim use the resulting sprite transform. */
export function heldWeaponOffset(angle: number, forward: number, off: number, back: number): Point {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: Math.round(c * (forward - back) + s * off), y: Math.round(s * (forward - back) - c * off) };
}
