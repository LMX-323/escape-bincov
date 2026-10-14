/**
 * Body facing and walk-cycle direction for an actor whose aim and movement differ (issue #26 F08: walking in any
 * direction other than forward read as a moonwalk). Pure math with no renderer imports, so Node tests and any
 * renderer can share it.
 *
 * - Backpedalling (movement more than 90 deg off the aim) keeps the body on the aim and plays short reversed steps.
 * - Strafing turns the body (hips) toward the movement axis by at most 45 deg, so it never leaves the aim's neighbouring
 *   8-way sector and the held weapon still points along the aim.
 * - A 15 deg band around 90 deg keeps the cycle direction from flickering while the aim jitters near a pure strafe.
 *
 * Display only: the Runtime, input and saves never see these values.
 */

/** Nearest of the eight body directions (0 = east, clockwise in screen space, 2 = south). */
export const dirOf = (angle: number) => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;

/** Largest turn of the body away from the aim, toward the movement axis. */
export const GAIT_TURN = Math.PI / 4;
/** Movement this far off the aim switches between a forward and a reversed walk cycle ... */
const FLIP = Math.PI / 2;
/** ... with this much hysteresis on either side. */
const BAND = Math.PI / 12;
/** Reversed cycle: f0 (the closed idle pose) as the passing pose, contact frames in reverse order (f3 before f1). */
const BACK = [3, 0, 1, 0] as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export type GaitSense = 1 | -1;
export interface Gait { dir: number; sense: GaitSense }

/**
 * Body direction (0..7) and walk-cycle sense for one actor frame. `prevSense` is the sense chosen on the previous frame
 * (1 for a new actor). A still actor faces its aim with sense 1, exactly as before F08.
 */
export function gait(aim: number, vx: number, vy: number, moving: boolean, prevSense: GaitSense): Gait {
  if (!moving) return { dir: dirOf(aim), sense: 1 };
  let d = wrap(Math.atan2(vy, vx) - aim);
  const sense: GaitSense = prevSense === 1 ? (Math.abs(d) > FLIP + BAND ? -1 : 1) : (Math.abs(d) < FLIP - BAND ? 1 : -1);
  if (sense < 0) d = wrap(d + Math.PI);
  return { dir: dirOf(aim + Math.max(-GAIT_TURN, Math.min(GAIT_TURN, d))), sense };
}

/** Body frame (1..4 forward; 3, 0, 1, 0 reversed) for a walk phase in [0, 4). */
export function walkFrame(walk: number, sense: GaitSense): number {
  const i = Math.min(3, Math.max(0, Math.floor(walk)));
  return sense > 0 ? 1 + i : BACK[i];
}
