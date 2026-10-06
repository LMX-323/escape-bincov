/** Far layer: overcast dusk, fogged coast, cranes, ships and open water. */
import { Pix, bayer, hash } from './pix.ts';
import { R, c } from './palette.ts';
import { LAYERS, ANCHORS, FAR_LIGHTS } from '../../src/title/layout.ts';

const H = ANCHORS.horizon;

/** Fractional ramp level → whole level with a narrow ordered-dither seam. */
function step(level: number, x: number, y: number, band = .34) {
    const base = Math.floor(level), f = level - base, t = (f - (.5 - band / 2)) / band;
    return base + (t <= 0 ? 0 : t >= 1 ? 1 : bayer(x, y) < t ? 1 : 0);
}

function cloud(p: Pix, x: number, y: number, w: number, rows: number, salt: number, dark: number, sky: (y: number) => number) {
    for (let r = 0; r < rows; r++) {
        const bulge = Math.sin((r + .5) / rows * Math.PI);
        const half = w / 2 * (.55 + .45 * bulge) + (hash(r, salt) - .5) * 10;
        const off = (hash(r, salt + 7) - .5) * 14;
        const yy = y + r, x0 = Math.round(x - half + off), x1 = Math.round(x + half + off);
        for (let xx = x0; xx < x1; xx++) {
            const edge = Math.min(xx - x0, x1 - xx);
            const shade = r === rows - 1 ? 1 : edge < 3 && bayer(xx, yy) > .5 ? 0 : -dark;
            p.set(c('sky', step(sky(yy), xx, yy) + shade), xx, yy);
        }
    }
}

/** Luffing crane: braced tower, lattice jib, counter-jib and machinery house. */
function crane(p: Pix, x: number, base: number, top: number, jib: number, tone: number, lattice: boolean, flip = 1) {
    const col = c('sky', tone), dark = c('sky', tone - 1);
    p.rect(col, x - 3, top, 6, base - top);
    p.line(col, x - 3, base, x - 14, base + 2, 2); p.line(col, x + 3, base, x + 14, base + 2, 2);
    if (lattice) for (let y = top + 6; y < base - 2; y += 8) { p.line(dark, x - 2, y, x + 2, y + 4); p.line(dark, x + 2, y + 4, x - 2, y + 8); }
    p.rect(col, x - 8, top - 10, 16, 11); p.rect(dark, x - 6, top - 7, 4, 3);
    const tipX = x + flip * jib, tipY = top - Math.round(jib * .62);
    p.line(col, x, top - 9, tipX, tipY, 2); p.line(col, x, top - 2, tipX, tipY + 1);
    if (lattice) for (let i = 4; i < jib; i += 7) {
        const ax = x + flip * i, ay = top - 9 - Math.round(i * .62 * (jib - 0) / jib) + Math.round(i * 0);
        p.line(dark, ax, ay + 2, ax + flip * 4, ay + 6 - Math.round(4 * .62));
    }
    p.line(col, x, top - 10, x - flip * Math.round(jib * .32), top - 5, 2);
    p.rect(col, x - flip * Math.round(jib * .32) - 4, top - 6, 8, 6);
    p.line(col, x, top - 22, tipX, tipY, 1); p.line(col, x, top - 22, x - flip * Math.round(jib * .3), top - 6);
    p.rect(col, x - 1, top - 24, 3, 15);
    const hook = Math.round(jib * .9);
    p.line(c('sky', tone + 1), x + flip * hook, top - Math.round(hook * .62) + 2, x + flip * hook, top + 26);
}

function gantry(p: Pix, x: number, w: number, base: number, top: number, tone: number) {
    const col = c('sky', tone), dark = c('sky', tone - 1);
    p.rect(col, x, top, 4, base - top); p.rect(col, x + w - 4, top, 4, base - top);
    p.rect(col, x - 22, top - 4, w + 60, 5); p.rect(dark, x - 22, top + 1, w + 60, 1);
    for (let i = 0; i < w + 54; i += 6) p.line(dark, x - 20 + i, top - 3, x - 17 + i, top);
    p.rect(col, x + 6, top + 6, 14, 9);
    p.line(col, x + 2, top + 18, x + w - 2, top + 30, 1); p.line(col, x + w - 2, top + 18, x + 2, top + 30, 1);
    p.line(c('sky', tone + 1), x + w + 22, top + 5, x + w + 22, top + 30);
}

export function paintSky(): Pix {
    const L = LAYERS.sky, p = new Pix(L.w, L.h).origin(L.x, L.y);
    // Overcast dusk: darker cloud ceiling, luminous band just above the far coast.
    const sky = (y: number) => y < 0 ? 3 : 3 + Math.pow(Math.min(1, y / H), 1.7) * 6.4;
    p.each((x, y) => y < H ? c('sky', step(sky(y), x, y)) : undefined);
    const clouds: [number, number, number, number, number][] = [
        [420, 28, 260, 7, 2], [760, 18, 300, 9, 2], [520, 62, 220, 6, 2], [880, 70, 200, 6, 1], [660, 96, 260, 5, 1],
        [420, 112, 150, 4, 1], [800, 126, 240, 4, 1], [470, 142, 120, 3, 1], [700, 150, 180, 3, 1], [860, 158, 120, 3, 1],
    ];
    clouds.forEach(([x, y, w, rows, dark], i) => cloud(p, x, y, w, rows, i * 31 + 5, dark, sky));
    // Distant headland and the city along the far quay, all in fogged low-contrast values.
    p.poly(c('sky', 7), [[300, H], [300, 186], [380, 183], [450, 186], [520, 181], [600, 184], [690, 180], [780, 183], [870, 179], [970, 182], [970, H]]);
    for (let i = 0; i < 70; i++) {
        const x = 300 + Math.floor(hash(i, 3) * 670), h = 4 + Math.floor(hash(i, 4) * 12), w = 6 + Math.floor(hash(i, 5) * 22);
        p.rect(c('sky', 6), x, H - h, w, h);
        if (hash(i, 6) > .6) p.rect(c('sky', 6), x + 2, H - h - 3, 3, 3);
    }
    // Container ship and freighter hulls moored along the far quay.
    const hull = (x: number, w: number, h: number, tone: number, bridge: number) => {
        p.rect(c('sky', tone), x, H - h, w, h); p.rect(c('sky', tone + 1), x, H - h, w, 1);
        p.rect(c('sky', tone), x + bridge, H - h - 9, 14, 9); p.rect(c('sky', tone), x + bridge + 4, H - h - 15, 4, 6);
        for (let i = 6; i < w - 8; i += 9) if (i < bridge - 4 || i > bridge + 18) p.rect(c('sky', tone + 1), x + i, H - h - 4, 7, 4);
    };
    hull(640, 120, 7, 5, 92); hull(820, 140, 8, 4, 18); hull(430, 70, 6, 5, 50);
    // Cranes recede in value: lighter and simpler with distance.
    crane(p, 470, H - 4, 96, 40, 6, false, 1);
    crane(p, 424, H - 4, 120, 26, 7, false, -1);
    gantry(p, 690, 30, H - 4, 104, 6);
    crane(p, 776, H - 3, 74, 62, 5, true, 1);
    crane(p, 870, H - 3, 92, 56, 5, true, -1);
    crane(p, 640, H - 4, 118, 30, 6, false, 1);
    // Water: bright skyline reflection at the horizon, darkening toward the near harbour.
    const sea = (y: number) => 8.6 - Math.pow((y - H) / 210, .7) * 5.8;
    p.each((x, y) => y >= H ? c('steel', step(sea(y), x, y)) : undefined);
    p.hline(c('sky', 9), 300, H, 670);
    // Hand-placed ripple dashes: short and dense near the horizon, longer and sparse up close.
    for (let row = H + 2, i = 0; row < L.y + L.h; row += 2 + Math.floor((row - H) / 26), i++) {
        const near = (row - H) / 220, count = 34 - Math.floor(near * 18);
        for (let k = 0; k < count; k++) {
            const x = 290 + Math.floor(hash(k, i * 13 + 1) * 690), w = 3 + Math.floor(hash(k, i * 13 + 2) * (4 + near * 22));
            const base = Math.floor(sea(row));
            p.hline(c('steel', base + (hash(k, i * 13 + 3) > .35 ? 1 : -1)), x, row, w);
        }
    }
    // Warm reflections beneath the shore lights: broken, widening columns.
    for (const [lx, ly, kind] of FAR_LIGHTS) {
        if (ly > H) continue;
        const warm = kind === 'warm';
        const depth = warm ? 34 : 18;
        for (let k = 0, y = H + 2 + (lx & 1); y < H + depth; y += 2 + (k & 1), k++) {
            const spread = 1 + Math.floor((y - H) / 9), w = 1 + Math.floor(hash(k, lx) * (spread + 2));
            const x = lx - Math.floor(w / 2) + Math.round((hash(k, lx + 9) - .5) * spread);
            p.hline(warm ? R.brass[(y - H) < 12 ? 4 : 3] : R.rust[4], x, y, w);
        }
    }
    return p;
}

/** Seamless fog band: periodic in x, stepped alpha bands, darker underside. */
export function paintFog(key: 'fogHigh' | 'fogLow'): Pix {
    const L = LAYERS[key], p = new Pix(L.w, L.h);
    const period = L.w, mist = (k: number) => [0, 1, 2, 3][k];
    const salt = key === 'fogHigh' ? 11 : 23;
    const wave = (x: number, f: number, s: number) => Math.sin((x / period) * Math.PI * 2 * f + hash(s, salt) * 6.283);
    for (let x = 0; x < L.w; x++) {
        const centre = L.h / 2 + wave(x, 2, 1) * 5 + wave(x, 5, 2) * 2;
        const thick = (L.h / 2 - 6) * (.65 + .35 * wave(x, 3, 3)) + wave(x, 7, 4) * 2;
        for (let y = 0; y < L.h; y++) {
            const d = Math.abs(y - centre) / Math.max(4, thick);
            if (d >= 1) continue;
            const v = (1 - d) * 3.6, level = Math.floor(v) + (bayer(x, y) < v - Math.floor(v) - .3 ? 1 : 0);
            if (level > 0) p.data[y * L.w + x] = A_MIST[mist(Math.min(3, level - 1))];
        }
    }
    return p;
}
import { A } from './palette.ts';
const A_MIST = A.mist;
