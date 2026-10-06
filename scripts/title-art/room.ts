/** Room layer: duty-room walls, ceiling beam, open door, poster pillar, window, floor and stores. */
import { Pix, bayer, hash } from './pix.ts';
import { R, A, c, type RampName } from './palette.ts';
import { LAYERS, OPENINGS, ANCHORS } from '../../src/title/layout.ts';
import { lamp, vignette } from './light.ts';

const VP = { x: 430, y: 196 };
export const FLOOR_Y = 392;
const D = OPENINGS.door, W = OPENINGS.window;

/** Vertical boards with seams, slight per-board value changes, sparse grain and nails. */
export function boards(p: Pix, ramp: RampName, level: number, x0: number, y0: number, x1: number, y1: number, width: number, salt: number, nails: number[] = []) {
    for (let x = x0, i = 0; x < x1; x += width, i++) {
        const bw = Math.min(width - (hash(i, salt) > .6 ? 1 : 0), x1 - x);
        const v = hash(i, salt + 1), lv = level + (v > .82 ? 1 : v < .18 ? -1 : 0);
        p.rect(c(ramp, lv), x, y0, bw, y1 - y0);
        p.vline(c(ramp, level - 2), x, y0, y1 - y0);
        if (bw > 4) p.vline(c(ramp, lv + 1), x + 1, y0, y1 - y0);
        for (let k = 0; k < (y1 - y0) / 34; k++) {
            if (hash(i * 31 + k, salt + 2) > .55) continue;
            const gy = y0 + Math.floor(hash(i * 31 + k, salt + 3) * (y1 - y0)), gx = x + 2 + Math.floor(hash(i * 31 + k, salt + 4) * Math.max(1, bw - 4));
            p.vline(c(ramp, lv - 1), gx, gy, 3 + Math.floor(hash(k, i + salt) * 8));
        }
        for (const ny of nails) { p.set(c(ramp, level - 2), x + 2, ny); p.set(c(ramp, lv + 2), x + 2, ny - 1); }
    }
}

function ceiling(p: Pix) {
    const L = LAYERS.room;
    for (let y = L.y, i = 0; y < 26; y += 7, i++) {
        p.rect(c('wood', 2 + (i & 1)), L.x, y, L.w, 7);
        p.hline(c('wood', 1), L.x, y + 6, L.w);
    }
    // Heavy beam above the door and window, with a lit lower arris and bolts.
    p.rect(c('wood', 3), 250, 4, 720, 18); p.hline(c('wood', 5), 250, 4, 720); p.rect(c('wood', 2), 250, 19, 720, 3);
    for (let x = 262; x < 966; x += 48) { p.rect(c('steel', 2), x, 9, 3, 3); p.set(c('steel', 6), x, 9); }
    for (let i = 0; i < 40; i++) p.hline(c('wood', 2), 250 + Math.floor(hash(i, 7) * 700), 8 + Math.floor(hash(i, 8) * 9), 6 + Math.floor(hash(i, 9) * 20));
    // Ceiling rose for the lamp cord.
    const { x, y } = ANCHORS.lampPivot;
    p.rect(c('steel', 3), x - 5, y + 6, 11, 3); p.hline(c('steel', 6), x - 4, y + 6, 9); p.rect(c('steel', 2), x - 1, y + 9, 3, 2);
    // Conduit along the beam to the rose.
    p.rect(c('steel', 3), 520, 23, x - 524, 2); p.hline(c('steel', 6), 520, 23, x - 524);
}

function leftWall(p: Pix) {
    boards(p, 'slate', 2, LAYERS.room.x, 22, 338, FLOOR_Y, 15, 101, [60, 210, 360]);
    // Wainscot rail and lower panel.
    p.rect(c('slate', 1), LAYERS.room.x, 300, 344, 4); p.hline(c('slate', 5), LAYERS.room.x, 299, 344);
    // Pipes: a riser and a run under the ceiling, with brackets and a valve wheel.
    const pipe = (x: number, y: number, w: number, h: number) => {
        p.rect(c('steel', 3), x, y, w, h);
        if (w > h) { p.hline(c('steel', 6), x, y, w); p.hline(c('steel', 1), x, y + h - 1, w); }
        else { p.vline(c('steel', 6), x, y, h); p.vline(c('steel', 1), x + w - 1, y, h); }
    };
    pipe(LAYERS.room.x, 30, 330, 6); pipe(34, 30, 6, 360);
    for (const x of [70, 150, 230, 300]) { p.rect(c('steel', 2), x, 28, 4, 10); p.set(c('steel', 7), x + 1, 29); }
    for (const y of [110, 190, 270]) p.rect(c('steel', 2), 32, y, 10, 3);
    p.ellipse(c('rust', 4), 28, 148, 18, 18); p.ellipse(c('slate', 3), 32, 152, 10, 10); p.rect(c('rust', 6), 36, 150, 2, 6); p.rect(c('rust', 6), 33, 153, 8, 2);
    // Shelf with tins, bottles, a storm lantern and a cardboard box.
    p.rect(c('wood', 4), 54, 104, 214, 5); p.hline(c('wood', 7), 54, 104, 214); p.hline(c('wood', 2), 54, 109, 214);
    for (const x of [64, 250]) { p.rect(c('wood', 3), x, 109, 3, 12); p.line(c('wood', 3), x + 2, 120, x + 12, 109); }
    const tin = (x: number, w: number, h: number, ramp: RampName, lv: number) => {
        p.rect(c(ramp, lv), x, 104 - h, w, h); p.vline(c(ramp, lv + 2), x + 1, 104 - h + 1, h - 2);
        p.hline(c(ramp, lv + 1), x, 104 - h, w); p.hline(c(ramp, lv - 2), x, 104 - h + 3, w); p.vline(c(ramp, lv - 1), x + w - 1, 104 - h, h);
    };
    tin(70, 10, 14, 'rust', 4); tin(82, 8, 12, 'steel', 6); tin(92, 10, 17, 'cloth', 5);
    tin(110, 6, 22, 'teal', 4); p.rect(c('teal', 4), 111, 76, 4, 6); p.rect(c('teal', 6), 112, 85, 1, 9);
    tin(119, 6, 18, 'teal', 3);
    p.rect(c('paper', 2), 132, 80, 34, 24); p.rect(c('paper', 3), 132, 80, 34, 3); p.vline(c('paper', 1), 149, 83, 21); p.rect(c('paper', 4), 136, 88, 8, 5);
    // Storm lantern: wire cage, glass and brass cap.
    p.rect(c('brass', 2), 182, 72, 16, 3); p.rect(c('brass', 3), 186, 68, 8, 4); p.line(c('steel', 3), 184, 66, 196, 66);
    p.rect(c('teal', 2), 183, 75, 14, 22); p.rect(c('brass', 3), 187, 84, 5, 6); p.set(c('brass', 6), 189, 86);
    for (const x of [183, 189, 196]) p.vline(c('steel', 3), x, 75, 22);
    p.rect(c('brass', 2), 181, 97, 18, 7); p.hline(c('brass', 4), 181, 97, 18);
    tin(210, 12, 10, 'steel', 5); tin(224, 14, 9, 'rust', 3); tin(240, 9, 13, 'cloth', 4);
    // Coil of rope on a peg beside the door.
    p.rect(c('steel', 2), 246, 206, 6, 4);
    for (let r = 0; r < 4; r++) {
        const cx = 250 + r, w = 30 - r * 3, top = 210 + r * 2, h = 96 - r * 4;
        for (let k = 0; k < h; k++) {
            const t = k / h, half = (w / 2) * Math.sin(t * Math.PI) + 2;
            const lv = 4 + (r & 1) + ((k + r) % 4 === 0 ? 2 : 0);
            p.set(c('wood', lv), Math.round(cx - half), top + k); p.set(c('wood', lv - 1), Math.round(cx + half), top + k);
        }
    }
    p.rect(c('wood', 5), 246, 300, 8, 26); for (let y = 300; y < 326; y += 3) p.hline(c('wood', 7), 246, y, 8);
}

function pillar(p: Pix) {
    boards(p, 'wood', 3, 516, 22, 606, FLOOR_Y, 13, 201, [70, 250]);
    // Poster: a faded portrait notice, pinned and curling.
    const notice = (x: number, y: number, w: number, h: number) => {
        p.rect(c('steel', 1), x + 2, y + 2, w, h);
        p.rect(c('paper', 4), x, y, w, h); p.rect(c('paper', 5), x + 1, y + 1, w - 3, 2);
        p.poly(c('paper', 3), [[x + w - 7, y + h], [x + w, y + h - 7], [x + w, y + h]]);
        p.rect(c('rust', 5), x + (w >> 1) - 1, y + 1, 2, 2);
    };
    notice(528, 132, 44, 58);
    p.rect(c('paper', 2), 534, 140, 32, 34); p.rect(c('paper', 1), 535, 141, 30, 32);
    p.ellipse(c('paper', 3), 543, 145, 14, 15); p.rect(c('paper', 3), 539, 159, 22, 14); p.rect(c('paper', 2), 547, 160, 6, 3);
    p.ellipse(c('paper', 2), 545, 147, 10, 8);
    for (let i = 0; i < 3; i++) p.hline(c('paper', 2), 534, 178 + i * 4, 18 + (i & 1) * 10);
    // Tide chart / route map with marked reaches.
    notice(526, 198, 48, 60);
    for (let i = 0; i < 6; i++) p.hline(c('paper', 3), 530, 204 + i * 9, 40);
    for (let i = 0; i < 5; i++) p.vline(c('paper', 3), 532 + i * 9, 202, 52);
    p.line(c('teal', 4), 530, 248, 546, 226); p.line(c('teal', 4), 546, 226, 568, 230); p.line(c('rust', 5), 538, 236, 562, 214);
    p.rect(c('rust', 6), 561, 213, 3, 3);
    // Key hooks and a clipboard lower on the pillar.
    p.rect(c('steel', 3), 588, 214, 12, 3); p.set(c('brass', 5), 590, 218); p.vline(c('brass', 4), 594, 218, 6); p.rect(c('brass', 5), 593, 224, 3, 3);
    p.rect(c('wood', 2), 580, 284, 22, 30); p.rect(c('paper', 4), 582, 290, 18, 22); p.rect(c('steel', 6), 586, 284, 10, 4);
    for (let i = 0; i < 4; i++) p.hline(c('paper', 2), 584, 294 + i * 4, 12 - (i & 1) * 4);
}

function windowWall(p: Pix) {
    boards(p, 'wood', 2, 606, 22, LAYERS.room.x + LAYERS.room.w, FLOOR_Y, 14, 301, [300, 360]);
    // Frame: jambs, head, mullion and transom in slate paint over wood.
    const frame = (x: number, y: number, w: number, h: number) => {
        p.rect(c('slate', 3), x, y, w, h);
        if (w > h) { p.hline(c('slate', 5), x, y, w); p.hline(c('slate', 1), x, y + h - 1, w); }
        else { p.vline(c('slate', 5), x, y, h); p.vline(c('slate', 1), x + w - 1, y, h); }
    };
    frame(W.x - 8, W.y - 10, W.w + 16, 10);
    frame(W.x - 8, W.y, 8, W.h); frame(W.x + W.w, W.y, 8, W.h);
    p.rect(0, W.x, W.y, W.w, W.h);
    frame(718, W.y, 10, W.h); frame(W.x, 44, W.w, 7);
    // Paint chips on the frame show wood beneath.
    for (let i = 0; i < 26; i++) {
        const onMullion = i % 2 === 0, x = onMullion ? 719 + Math.floor(hash(i, 5) * 7) : W.x - 7 + Math.floor(hash(i, 6) * 5);
        const y = W.y + 6 + Math.floor(hash(i, 7) * (W.h - 12));
        p.rect(c('wood', 5), x, y, 1 + (i % 3 === 0 ? 1 : 0), 2);
    }
    // Sill: lit top face, shadowed front face.
    p.rect(c('wood', 5), W.x - 14, W.y + W.h, W.w + 28, 7); p.hline(c('wood', 8), W.x - 14, W.y + W.h, W.w + 28);
    p.rect(c('wood', 3), W.x - 12, W.y + W.h + 7, W.w + 24, 9); p.hline(c('wood', 1), W.x - 12, W.y + W.h + 15, W.w + 24);
    p.rect(c('wood', 2), W.x - 12, W.y + W.h + 16, W.w + 24, 3);
}

function doorway(p: Pix) {
    const post = (x: number) => {
        p.rect(c('slate', 3), x, D.y - 12, 12, FLOOR_Y - D.y + 12);
        p.vline(c('slate', 5), x, D.y - 12, FLOOR_Y - D.y + 12); p.vline(c('slate', 1), x + 11, D.y - 12, FLOOR_Y - D.y + 12);
        p.vline(c('slate', 4), x + 4, D.y, FLOOR_Y - D.y);
    };
    post(D.x - 12); post(D.x + D.w);
    p.rect(c('slate', 3), D.x - 12, D.y - 14, D.w + 24, 14); p.hline(c('slate', 5), D.x - 12, D.y - 14, D.w + 24); p.hline(c('slate', 1), D.x - 12, D.y - 1, D.w + 24);
    for (let i = 0; i < 18; i++) p.rect(c('wood', 5), D.x - 11 + Math.floor(hash(i, 9) * (D.w + 22)), D.y - 12 + Math.floor(hash(i, 10) * 10), 2, 1);
    p.rect(0, D.x, D.y, D.w, D.h);
    // Worn threshold board, lit by the outside.
    p.rect(c('wood', 5), D.x - 6, D.y + D.h, D.w + 12, 8); p.hline(c('wood', 8), D.x - 6, D.y + D.h, D.w + 12); p.hline(c('wood', 2), D.x - 6, D.y + D.h + 7, D.w + 12);
}

function floor(p: Pix) {
    const L = LAYERS.room, bottom = L.y + L.h;
    p.rect(c('wood', 2), L.x, FLOOR_Y, L.w, bottom - FLOOR_Y);
    // Baseboard.
    p.rect(c('wood', 2), L.x, FLOOR_Y - 6, L.w, 6); p.hline(c('wood', 4), L.x, FLOOR_Y - 6, L.w);
    p.rect(c('wood', 5), D.x - 6, D.y + D.h, D.w + 12, 8); p.hline(c('wood', 8), D.x - 6, D.y + D.h, D.w + 12);
    // Plank seams converge on the vanishing point; staggered butt joints.
    for (let k = -14; k <= 16; k++) {
        const bx = VP.x + k * 44;
        const t0 = (FLOOR_Y - VP.y) / (bottom - VP.y);
        const sx = VP.x + (bx - VP.x) * t0;
        for (const [x, y] of Pix.linePoints(sx, FLOOR_Y, bx, bottom)) p.set(c('wood', 1), x, y);
        for (const [x, y] of Pix.linePoints(sx + 1, FLOOR_Y, bx + 1, bottom)) if (y > FLOOR_Y + 30) p.set(c('wood', 4), x, y);
        for (let j = 0; j < 3; j++) {
            const y = FLOOR_Y + 8 + Math.floor(hash(k, 61 + j) * (bottom - FLOOR_Y - 12));
            const t = (y - VP.y) / (bottom - VP.y), x0 = VP.x + (bx - VP.x) * t, x1 = VP.x + (bx + 44 - VP.x) * t;
            p.hline(c('wood', 1), Math.round(x0) + 1, y, Math.max(2, Math.round(x1 - x0) - 1));
        }
    }
    // Daylight spills through the doorway onto the boards.
    p.light((x, y) => {
        if (y < FLOOR_Y) return 0;
        const t = (y - FLOOR_Y) / (bottom - FLOOR_Y), l = D.x - 4 - t * 120, r = D.x + D.w + 4 + t * 60;
        if (x < l || x > r) return 0;
        const edge = Math.min(x - l, r - x) / 18;
        return Math.min(1, edge) * (1.5 - t * 1.1);
    }, .4, L.x, FLOOR_Y, L.w, bottom - FLOOR_Y);
}

function doorLeaf(p: Pix) {
    const top = (x: number) => 18 + (x - 276) * 10 / 58, bot = (x: number) => 398 - (x - 276) * 16 / 58;
    const outline: [number, number][] = [[276, 18], [334, 28], [334, 382], [276, 398]];
    p.poly(c('slate', 4), outline);
    // Painted vertical boards (perspective compresses the far ones).
    for (const x of [288, 299, 309, 318, 326]) for (let y = Math.ceil(top(x)) + 1; y < bot(x); y++) p.set(c('slate', 2), x, y);
    // Rails: horizontal ledges following the leaf's perspective.
    const rail = (f: number, h: number) => {
        for (let x = 277; x < 334; x++) {
            const y = Math.round(top(x) + (bot(x) - top(x)) * f);
            p.rect(c('slate', 5), x, y, 1, h); p.set(c('slate', 6), x, y); p.set(c('slate', 2), x, y + h);
        }
    };
    rail(.04, 4); rail(.5, 5); rail(.94, 4);
    // Glazed upper panel reflecting the dusk, with a cross bar.
    const glass = (x: number, y: number) => x > 286 && x < 326 && y > top(x) + 22 && y < top(x) + (bot(x) - top(x)) * .43;
    p.each((x, y) => glass(x, y) ? c('sky', 3 + (y - x * .5 > 30 && y - x * .5 < 40 ? 2 : (y - x * .5) % 31 < 3 ? 1 : 0)) : undefined, 284, 30, 44, 170);
    for (let x = 287; x < 326; x++) p.set(c('slate', 2), x, Math.round(top(x) + 22 + ((bot(x) - top(x)) * .43 - 22) / 2));
    for (let y = 50; y < 200; y++) if (glass(306, y)) p.set(c('slate', 2), 306, y);
    // Chipped paint showing wood and rust, clustered near edges and the handle.
    for (let i = 0; i < 70; i++) {
        const near = i < 30, x = near ? 277 + Math.floor(hash(i, 3) * 12) : 277 + Math.floor(hash(i, 4) * 56);
        const y = Math.round(top(x) + 4 + hash(i, 5) * (bot(x) - top(x) - 8));
        if (glass(x, y)) continue;
        p.rect(hash(i, 6) > .5 ? c('wood', 4) : c('rust', 4), x, y, 1 + (hash(i, 7) > .6 ? 1 : 0), 1 + (hash(i, 8) > .5 ? 1 : 0));
    }
    // Handle, lock plate and a kick plate.
    p.rect(c('steel', 3), 281, 218, 6, 16); p.rect(c('brass', 4), 284, 224, 7, 3); p.set(c('brass', 6), 285, 224); p.rect(c('steel', 1), 283, 229, 2, 3);
    p.poly(c('steel', 3), [[277, 360], [333, 352], [333, 374], [277, 384]]);
    p.line(c('steel', 6), 277, 360, 333, 352);
    // Thickness of the free edge and its shadow on the wall.
    p.rect(c('slate', 6), 272, 19, 4, 380); p.vline(c('slate', 8), 272, 20, 376);
    p.poly(c('slate', 1), [[262, 30], [272, 20], [272, 398], [262, 392]]);
}

function stores(p: Pix) {
    // Steel footlocker with latches, an ammunition can on top, and a wooden supply crate.
    const box = (x: number, y: number, w: number, h: number, depth: number, ramp: RampName, lv: number) => {
        p.poly(c(ramp, lv + 2), [[x, y], [x + w, y], [x + w - depth, y - depth], [x - depth + depth, y - depth]]);
        p.rect(c(ramp, lv), x, y, w, h);
        p.hline(c(ramp, lv + 3), x, y, w); p.vline(c(ramp, lv - 1), x + w - 1, y, h); p.hline(c(ramp, lv - 2), x, y + h - 1, w);
    };
    box(-6, 330, 124, 104, 12, 'steel', 4);
    p.rect(c('steel', 3), -6, 346, 124, 3); p.rect(c('steel', 3), -6, 408, 124, 3);
    for (const x of [24, 78]) { p.rect(c('steel', 6), x, 340, 10, 12); p.rect(c('steel', 2), x + 3, 346, 4, 4); }
    p.rect(c('steel', 2), 44, 370, 28, 6); p.hline(c('steel', 7), 44, 370, 28);
    p.rect(c('paper', 4), 8, 384, 22, 10); p.hline(c('paper', 2), 10, 388, 16);
    box(16, 290, 64, 40, 8, 'cloth', 4);
    p.rect(c('cloth', 2), 16, 300, 64, 2); p.rect(c('cloth', 6), 38, 284, 18, 3); p.rect(c('paper', 4), 26, 310, 14, 6);
    box(118, 352, 108, 96, 10, 'wood', 5);
    for (let y = 366; y < 446; y += 16) p.hline(c('wood', 3), 118, y, 108);
    p.line(c('wood', 4), 120, 354, 224, 446, 3); p.line(c('wood', 7), 120, 352, 224, 444);
    p.rect(c('wood', 3), 118, 352, 6, 96); p.rect(c('wood', 3), 220, 352, 6, 96);
    for (let i = 0; i < 6; i++) p.set(c('rust', 5), 140 + i * 13, 360 + (i & 1) * 2);
    p.rect(c('paper', 3), 150, 392, 40, 16); p.rect(c('rust', 4), 154, 396, 8, 8); p.hline(c('paper', 1), 166, 398, 20); p.hline(c('paper', 1), 166, 402, 14);
    // Jerrycan by the crate.
    p.rect(c('rust', 3), 228, 404, 26, 44); p.rect(c('rust', 5), 228, 404, 26, 3); p.rect(c('rust', 2), 232, 410, 18, 2);
    p.line(c('rust', 2), 232, 418, 250, 440); p.line(c('rust', 2), 250, 418, 232, 440);
    p.rect(c('rust', 4), 236, 398, 10, 6); p.rect(c('steel', 4), 246, 396, 6, 5);
}

/** Dusty glass and a few rain beads on the window panes, drawn last over the opening. */
function glass(p: Pix) {
    for (const [x0, y0, w, h] of [[W.x, 52, 106, W.h - 24], [728, 52, W.x + W.w - 728, W.h - 24], [W.x, W.y, W.w, 16]] as const) {
        p.each((x, y, col) => {
            if (col) return;
            const corner = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + h - 1 - y);
            if (corner < 3 && bayer(x, y) < .5) return A.mist[1];
            if (corner < 7 && bayer(x, y) < .25 && y > y0 + h * .55) return A.mist[0];
        }, x0, y0, w, h);
    }
    for (let i = 0; i < 46; i++) {
        const x = W.x + 2 + Math.floor(hash(i, 81) * (W.w - 4)), y = 56 + Math.floor(hash(i, 82) * (W.h - 34));
        if (x >= 718 && x < 728) continue;
        p.set(A.mist[3], x, y); if (hash(i, 83) > .5) p.set(A.mist[2], x, y + 1);
        if (hash(i, 84) > .78) for (let k = 2; k < 6 + Math.floor(hash(i, 85) * 10); k++) p.set(A.mist[1], x, y + k);
    }
}

export function paintRoom(): Pix {
    const L = LAYERS.room, p = new Pix(L.w, L.h).origin(L.x, L.y);
    leftWall(p);
    pillar(p);
    windowWall(p);
    ceiling(p);
    floor(p);
    doorway(p);
    doorLeaf(p);
    stores(p);
    // Lighting: warm lamp pool around the shade, cool fall-off into the left corner.
    p.light((x, y) => lamp(x, y, 3.6) + vignette(x, y));
    glass(p);
    return p;
}
