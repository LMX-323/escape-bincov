/**
 * Coast-view camera rules (village, mall and the station-yard mall entry share them). Pure math with no Pixi imports,
 * so Node tests can replay the follow loop. Display only: the Runtime, input and saves never see these values.
 */

/** Aim look-ahead along the aim, world px (an x-by-y ellipse). Half the old 48 x 34 by default (playtest F-04: the view
 *  slid with every mouse flick); the right button (precise aim) keeps the old reach, 1.7 x 48 x 34. */
export const AIM_LEAD = { x: 24, y: 17 } as const, PRECISE_LEAD = { x: 81.6, y: 57.8 } as const;
export const aimLead = (aim: number, precise: boolean) => {
  const l = precise ? PRECISE_LEAD : AIM_LEAD;
  return { x: Math.cos(aim) * l.x, y: Math.sin(aim) * l.y };
};

/** How far the smoothed offset may stray from the held whole-pixel offset before the camera moves. It absorbs the
 *  frame-to-frame wobble of the follow; that wobble stays far below it only while the smoothing runs on the clock the
 *  Runtime moved the player on (host.ts passes those deltas as `follow`). */
export const CAMERA_HOLD = .75;

/** What one camera axis carries to the next frame: the held whole-pixel offset and the unclamped camera it gave. */
export interface AxisHold { held: number; raw: number }

/**
 * One axis of the whole-pixel camera: the smoothed offset from the player, held in whole px and added to the player's
 * drawn (rounded) position, so the player and the world share one rounding and a steady walk keeps the player still on
 * screen. The offset must come from the UNROUNDED player: taken from Math.round(player) it is Math.round(smoothed)
 * again, the old trembling camera.
 *
 * `motion` is this frame's change of `smoothed`. The camera never steps against it, as Math.round(smoothed) never did:
 * while the lag builds at the start of a walk the offset shrinks in whole px as the player advances in whole px, and a
 * step back would shake the ground by 1 px. The camera waits a frame instead and the offset takes up the difference.
 *
 * Bounds are rounded, so a camera held at a map edge never wobbles with the player's fraction; when they cross, the
 * camera sits on their whole-pixel midpoint.
 */
export function snapAxis(smoothed: number, player: number, lo: number, hi: number, prev?: AxisHold, motion = 0): AxisHold & { at: number } {
  const o = smoothed - player, r = Math.round(player);
  const last = prev && Number.isFinite(prev.held) && Number.isFinite(prev.raw) ? prev : undefined;
  let h = last && Math.abs(o - last.held) <= CAMERA_HOLD ? last.held : Math.round(o);
  if (last && motion !== 0 && Math.sign(r + h - last.raw) === -Math.sign(motion)) h = last.raw - r;
  const l = Math.round(lo), u = Math.round(hi);
  return { at: l > u ? Math.round((lo + hi) / 2) : Math.min(u, Math.max(l, r + h)), held: h, raw: r + h };
}
