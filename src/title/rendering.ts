import { SCENE_W, SCENE_H } from './layout';

/**
 * Only the title uses a denser render surface: the 960x540 artwork is drawn at a whole number of 16:9 units, so a
 * subpixel move stays smooth when title.css scales the canvas to cover the window. Matches that fixed-size crop on tall
 * phones, and caps at 1080p so a high-DPR phone or 4K display cannot create an unbounded render target.
 */
export function titleSurface(width = innerWidth, height = innerHeight, dpr = devicePixelRatio) {
    const portrait = width <= 600 && width / height <= .75;
    const cssScale = portrait ? 1 : Math.max(width / SCENE_W, height / SCENE_H);
    const units = Math.min(120, Math.max(60, Math.ceil(60 * cssScale * dpr)));
    return { w: units * 16, h: units * 9 };
}
