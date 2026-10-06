/** Harbour layer (pier through the door, pilings through the window), boat and mooring line. */
import { Pix, bayer, hash } from './pix';
import { R, c } from './palette';
import { LAYERS, ANCHORS } from '../../src/title/layout';

const VP = { x: 430, y: 196 };
export const PIER_EDGE = 290;

/** Concrete pier seen through the doorway, wet and reflective. */
function pier(p: Pix) {
    const top = PIER_EDGE, bottom = 384, left = 326, right = 528;
    // Base wet concrete: lighter far away where it reflects the sky, darker near the door.
    p.each((x, y) => {
        const t = (y - top) / (bottom - top);
        const level = 6.2 - t * 3.2 + (bayer(x, y) - .5) * .5;
        return c('steel', Math.round(level));
    }, left, top, right - left, bottom - top);
    // Slab joints: lines toward the vanishing point and perspective-spaced cross joints.
    for (let k = -6; k <= 6; k++) {
        const bx = VP.x + k * 46;
        for (const [x, y] of Pix.linePoints(VP.x + (bx - VP.x) * ((top - VP.y) / (bottom + 40 - VP.y)), top, bx, bottom + 40)) if (y >= top + 2 && y < bottom) p.set(c('steel', 3), x, y);
    }
    for (let i = 1; i < 9; i++) {
        const y = Math.round(VP.y + (top - VP.y) * Math.pow(1.22, i * 1.25));
        if (y > top + 2 && y < bottom) p.hline(c('steel', 3), left, y, right - left);
    }
    // Sky sheen and puddles: horizontal broken reflections that widen toward the viewer.
    for (let i = 0; i < 90; i++) {
        const y = top + 4 + Math.floor(Math.pow(hash(i, 41), 1.4) * (bottom - top - 6));
        const t = (y - top) / (bottom - top), w = 3 + Math.floor(hash(i, 42) * (6 + t * 26));
        const x = left + Math.floor(hash(i, 43) * (right - left));
        p.hline(c('steel', 6 - Math.round(t * 2) + (hash(i, 44) > .7 ? 1 : 0)), x, y, w);
    }
    // Warm streaks under the wheelhouse windows and the masthead lamp.
    for (const [lx, len] of [[404, 46], [426, 54], [415, 30]] as const) {
        for (let y = top + 3, k = 0; y < top + len; y += 3 + (k++ % 3)) {
            const w = 1 + Math.floor(hash(k, lx) * (2 + (y - top) / 14));
            p.hline(R.brass[y - top < 16 ? 3 : 2], lx - (w >> 1) + Math.round((hash(k, lx + 3) - .5) * 4), y, w);
        }
    }
    // Pier edge: lit concrete lip with a rusty fender line and the dark drop to the water.
    p.rect(c('steel', 7), left, top - 3, right - left, 3);
    p.hline(c('steel', 9), left, top - 3, right - left);
    p.hline(c('steel', 4), left, top, right - left);
    for (let x = left + 6; x < right; x += 38) { p.rect(c('steel', 2), x, top - 1, 12, 4); p.hline(c('rust', 3), x + 1, top + 2, 10); }
    // Bollards (the right one carries the bow line).
    const bollard = (x: number, y: number) => {
        p.rect(c('steel', 2), x - 4, y - 8, 9, 9); p.rect(c('steel', 3), x - 5, y - 10, 11, 3);
        p.hline(c('steel', 7), x - 4, y - 10, 9); p.vline(c('steel', 5), x - 3, y - 7, 6);
        p.rect(c('steel', 1), x - 5, y, 11, 2);
    };
    bollard(ANCHORS.bollard.x, ANCHORS.bollard.y);
    bollard(352, PIER_EDGE + 2);
    // Chain rail posts on the pier edge, with drooping chain links.
    const posts = [366, 404, 488, 520];
    posts.forEach((x, i) => {
        const h = 26 - (i & 1) * 2;
        p.rect(c('wood', 2), x - 2, top - h, 5, h); p.vline(c('wood', 4), x - 1, top - h, h - 2);
        p.rect(c('steel', 6), x - 3, top - h - 2, 7, 2);
    });
    for (let i = 0; i + 1 < posts.length; i++) {
        const [a, b] = [posts[i], posts[i + 1]];
        if (b - a > 60) continue;
        for (let x = a + 3; x < b - 2; x++) {
            const t = (x - a) / (b - a), y = top - 18 + Math.round(Math.sin(t * Math.PI) * 7);
            p.set((x & 1) ? c('steel', 6) : c('steel', 3), x, y);
        }
    }
    // Coiled rope and a tyre fender lying on the pier.
    p.ellipse(c('wood', 3), 474, 330, 24, 9); p.ellipse(c('wood', 5), 476, 330, 20, 6); p.ellipse(c('wood', 3), 481, 332, 9, 3);
    for (let x = 476; x < 494; x += 3) p.set(c('wood', 7), x, 331);
    p.ellipse(c('steel', 1), 336, 352, 26, 11); p.ellipse(c('steel', 3), 341, 354, 14, 5);
    p.hline(c('steel', 5), 340, 352, 12);
}

/** Wooden pilings and swagged chain beyond the window, with wet lit caps. */
function pilings(p: Pix) {
    const row: [number, number, number][] = [
        [618, 226, 9], [652, 214, 10], [690, 230, 8], [712, 222, 9], [748, 208, 11], [778, 228, 8], [806, 216, 10],
        [842, 204, 13], [872, 222, 9], [904, 212, 11], [930, 220, 10],
    ];
    for (const [x, top, w] of row) {
        p.rect(c('wood', 2), x, top, w, 270 - top);
        p.rect(c('wood', 3), x + 1, top + 2, Math.max(2, w - 5), 268 - top);
        p.vline(c('wood', 4), x + 2, top + 3, 260 - top);
        p.rect(c('steel', 6), x, top, w, 2); p.hline(c('steel', 8), x + 1, top, w - 3);
        for (let y = top + 9; y < 268; y += 11 + (x & 3)) p.hline(c('wood', 1), x + 1, y, w - 2);
        p.vline(c('steel', 1), x + w - 1, top + 2, 268 - top);
    }
    for (let i = 0; i + 1 < row.length; i++) {
        const [ax, at, aw] = row[i], [bx, bt] = row[i + 1];
        const sx = ax + aw - 1, sy = Math.max(at, bt) + 8, ex = bx, sag = 4 + ((bx - sx) >> 4);
        for (let x = sx; x <= ex; x++) {
            const t = (x - sx) / Math.max(1, ex - sx), y = sy + Math.round(Math.sin(t * Math.PI) * sag);
            p.set(x % 3 === 0 ? c('steel', 6) : c('steel', 2), x, y);
            if (x % 3 === 1) p.set(c('steel', 3), x, y + 1);
        }
    }
}

export function paintHarbor(): Pix {
    const L = LAYERS.harbor, p = new Pix(L.w, L.h).origin(L.x, L.y);
    pilings(p);
    pier(p);
    return p;
}

/** Fishing boat moored bow-left: steel hull, wheelhouse with lit windows, two masts. */
export function paintBoat(): Pix {
    const L = LAYERS.boat, p = new Pix(L.w, L.h).origin(L.x, L.y);
    const wl = 288; // waterline (mostly hidden by the pier lip)
    // Hull: sheer line rises toward the bow on the left.
    const sheer = (x: number) => 236 - Math.round(Math.max(0, 404 - x) * .2);
    p.poly(c('teal', 2), [[358, sheer(358) - 3], [500, 240], [494, wl], [394, wl], [370, 256]]);
    p.each((x, y, col) => {
        if (col !== c('teal', 2)) return;
        if (y < sheer(x) + 3) return c('teal', 4);
        if (y < sheer(x) + 5) return c('teal', 3);
        if (y > wl - 9) return c('rust', 2);
        if (y > wl - 12) return c('steel', 1);
        return y > 262 ? c('teal', 1) : undefined;
    });
    p.line(c('teal', 5), 362, sheer(362) - 2, 498, 239);
    // Rust runs below scuppers and a painted hull number.
    for (let i = 0; i < 9; i++) {
        const x = 378 + i * 13 + Math.floor(hash(i, 51) * 5), y = 245 + (i & 1);
        p.rect(c('teal', 1), x, y, 2, 2);
        for (let k = 0; k < 4 + (i % 3) * 3; k++) p.set(k % 2 ? c('rust', 4) : c('rust', 3), x + (k > 3 ? 1 : 0), y + 2 + k);
    }
    p.rect(c('paper', 4), 446, 252, 3, 6); p.rect(c('paper', 4), 451, 252, 4, 1); p.rect(c('paper', 4), 453, 253, 2, 2); p.rect(c('paper', 4), 451, 255, 4, 1); p.rect(c('paper', 4), 451, 256, 1, 2);
    // Tyre fenders hanging on the hull side.
    for (const x of [392, 424, 470]) { p.ellipse(c('steel', 1), x, 255, 9, 11); p.ellipse(c('steel', 3), x + 2, 258, 5, 5); p.set(c('steel', 5), x + 3, 256); p.vline(c('wood', 4), x + 4, 246, 9); }
    // Bulwark rail.
    for (let x = 366; x < 496; x += 7) p.vline(c('steel', 4), x, sheer(x) - 7, 6);
    p.line(c('steel', 6), 364, sheer(364) - 8, 496, 233);
    // Wheelhouse: two storeys, warm windows, darker roof and searchlight.
    p.rect(c('slate', 4), 398, 198, 54, 38); p.rect(c('slate', 5), 398, 198, 54, 3); p.rect(c('slate', 2), 448, 201, 4, 35);
    p.rect(c('slate', 3), 406, 182, 38, 17); p.rect(c('slate', 6), 404, 180, 42, 3);
    for (const [x, y, w] of [[403, 206, 9], [415, 206, 9], [427, 206, 9], [410, 186, 8], [422, 186, 8], [434, 186, 6]] as const) {
        p.rect(c('slate', 1), x - 1, y - 1, w + 2, 9);
        p.rect(R.brass[5], x, y, w, 7); p.rect(R.brass[6], x + 1, y + 1, w - 3, 2); p.hline(R.brass[3], x, y + 6, w);
    }
    p.rect(c('slate', 2), 440, 214, 7, 22); p.rect(c('brass', 4), 445, 224, 1, 2);
    p.rect(c('steel', 6), 430, 174, 6, 6); p.rect(c('paper', 6), 431, 175, 3, 2);
    for (let y = 202; y < 236; y += 6) p.hline(c('slate', 3), 399, y + 14, 3);
    // Masts, stays, crosstrees, rigging lamps.
    p.rect(c('steel', 3), 414, 92, 3, 90); p.vline(c('steel', 6), 414, 92, 88);
    p.rect(c('steel', 4), 404, 120, 22, 2); p.rect(c('steel', 4), 408, 136, 14, 2);
    p.rect(c('steel', 3), 478, 150, 2, 86); p.rect(c('steel', 4), 472, 170, 14, 2);
    p.line(c('steel', 5), 415, 94, 362, sheer(362) - 6); p.line(c('steel', 5), 416, 94, 479, 152); p.line(c('steel', 5), 479, 152, 500, 234);
    p.line(c('steel', 4), 405, 121, 384, 226); p.line(c('steel', 4), 425, 121, 455, 196);
    p.rect(c('rust', 6), 414, 88, 3, 3); p.set(c('rust', 7), 415, 88);
    p.rect(c('brass', 6), 478, 146, 2, 2);
    // Net drum, boom and gear on the aft deck.
    p.line(c('steel', 4), 478, 172, 504, 206, 2);
    p.rect(c('cloth', 3), 458, 224, 18, 10); p.rect(c('cloth', 5), 459, 224, 16, 2); p.vline(c('cloth', 2), 466, 226, 8);
    p.ellipse(c('rust', 3), 372, 224, 14, 10); p.ellipse(c('rust', 5), 374, 225, 8, 6);
    return p;
}

/** Bow line from the pier bollard to the boat's bow cleat, one frame per boat offset (−1, 0, +1). */
export function paintMooring(): Pix[] {
    return [-1, 0, 1].map(dy => {
        const p = new Pix(120, 80).origin(350, 222);
        const ax = 371, ay = 236 + dy, bx = ANCHORS.bollard.x - 2, by = ANCHORS.bollard.y - 9;
        let last = ay;
        for (let x = ax; x <= bx; x++) {
            const t = (x - ax) / (bx - ax), y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * 10);
            for (let yy = Math.min(last, y); yy <= Math.max(last, y); yy++) p.set(c('wood', (x + yy) % 3 === 0 ? 6 : 4), x, yy);
            last = y;
        }
        return p;
    });
}
