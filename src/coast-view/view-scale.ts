/**
 * Device px per world px for the 2.5D view; the village and the mall share it. fit is the largest scale that still shows the
 * design box (24 cells x 400 px, or 28 x 466 with ?view=28). Nothing is letterboxed, so wider windows see more world.
 * - 'whole' (default): the largest whole number not above fit, so a 1 px camera step moves the frame by exactly s device px
 *   and nothing shimmers. It never zooms in (bar the 0.08 snap) and shows at most 4/3 of the design box per axis
 *   (1920x1080: 2, 30x16.9 cells; 2560x1440: 3, 26.7x15). Where that is not enough (fit about 1.33-1.92 and 2.67-2.92:
 *   1280x720, 1366x768, some phones) it keeps the fractional fit, because 1x shows 40+ cells and 2x less than the
 *   combat ranges need (opus-playtest-20261008).
 * - 'near' (?crisp=1): the nearest whole number, closer included (2 at 1280x720, 3 at 1920x1080).
 * - 'fit' (?crisp=0): the previous rule, fit snapped only within 0.08 of a whole number (the old picture).
 */
export type ViewScaleMode = 'whole' | 'near' | 'fit';
/** 'whole' never shows more than 4/3 of the design box per axis. */
export const MAX_ZOOM_OUT = .75;

export function viewScale(W: number, H: number, viewTiles: 24 | 28, mode: ViewScaleMode = 'whole'): number {
  const fit = Math.max(1, Math.min(W / (viewTiles * 32), H / (viewTiles === 28 ? 466 : 400))), near = Math.round(fit);
  if (mode === 'near' || Math.abs(fit - near) < .08) return near;
  if (mode === 'fit') return fit;
  const down = Math.floor(fit);
  // fit is exactly 4/3 or 8/3 at W = 1024 / 2048 device px (1024-wide windows, iPad landscape @2): stay whole on every engine.
  return down >= MAX_ZOOM_OUT * fit - 1e-9 ? down : fit;
}
