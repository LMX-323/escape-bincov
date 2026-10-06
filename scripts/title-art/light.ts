/** Shared lighting model for the static paint: one warm lamp, cool daylight through the openings. */
import { ANCHORS } from '../../src/title/layout.ts';

export const LAMP = { x: ANCHORS.lampBulb.x, y: ANCHORS.lampBulb.y + 2 };

/** Warm lamp contribution in ramp steps: elliptical falloff, stronger below the shade. */
export function lamp(x: number, y: number, strength = 4, rx = 190, ry = 170): number {
    // The enamel shade blocks light above its rim; only a soft bounce reaches the beam.
    if (y < LAMP.y - 6) strength *= Math.max(.12, 1 - (LAMP.y - 6 - y) / 14);
    const d = Math.hypot((x - LAMP.x) / rx, (y - LAMP.y) / ry);
    return d >= 1 ? 0 : strength * Math.pow(1 - d, 1.25);
}

/** Interior falloff: the far left corner and the ceiling sink into shadow. */
export function vignette(x: number, y: number): number {
    const left = x < 300 ? -(300 - x) / 120 : 0;
    const top = y < 60 ? -(60 - y) / 50 : 0;
    const bottom = y > 470 ? -(y - 470) / 80 : 0;
    return Math.max(-2.4, left + top + bottom);
}
