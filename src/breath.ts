/**
 * Breath charge for technique-15-a (docs/CRITICAL-PERK-DESIGN.md section 4; state, order and ownership in
 * docs/tasks/critical-perk-contract.md sections 3-4): how long a precise aim has rested on one enemy. Pure rules on plain
 * values. The Runtime owns one per raid and never saves it, like its handling: a Runtime built from a checkpoint (page
 * load, reloadCommitted) starts idle, an internal restoreExpansion sync keeps it, and the interrupt events clear it.
 */

/** `target` is the enemy uid the charge belongs to (null: none), `seconds` the effective time aimed at it, uncapped. */
export interface BreathState { target: string | null; seconds: number }
export const idleBreath = (): BreathState => ({ target: null, seconds: 0 });
/** The breath source's own chance: 10 points per second aimed, continuous (not per whole second), 30% from 3 s on. */
export const breathChance = (seconds: number) => Math.min(.3, seconds / 10);
/**
 * Advance over one substep of `seconds`. With the perk `owned` and a gun drawn (false with the knife), the precise aim
 * held (shooting.ts preciseHeld) and `sight` the enemy the aim rests on (layer-transition.ts aimTarget), the charge
 * grows on that enemy; without any of them it clears. Another enemy restarts from zero and never inherits time. The
 * substep's input and sight are taken to hold over the whole substep, as advanceAim takes its motion, so a new target
 * counts this substep too: an enemy aimed at for T seconds then holds T at any frame rate or substep split. Mutates and
 * returns `breath`.
 */
export function advanceBreath(breath: BreathState, seconds: number, owned: boolean, aiming: boolean, sight: string | null): BreathState {
    if (!owned || !aiming || sight === null) return clearBreath(breath);
    breath.seconds = (breath.target === sight ? breath.seconds : 0) + seconds;
    breath.target = sight;
    return breath;
}
/** Interrupt events (spec section 4.2) and a successful shot, right after its snapshot, clear the charge. Mutates and returns `breath`. */
export function clearBreath(breath: BreathState): BreathState { breath.target = null; breath.seconds = 0; return breath; }
