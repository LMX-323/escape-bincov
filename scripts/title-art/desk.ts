/** Desk group (desk, radio, map, rifle, bag, mug), lamp frames, light pool, chair, foreground rope and FX sprites. */
import { Pix, bayer, hash } from './pix.ts';
import { R, A, c, type RampName } from './palette.ts';
import { LAYERS, ANCHORS } from '../../src/title/layout.ts';
import type { Placed } from './preview.ts';

/** Desk-top lamp pool (scene coordinates) in ramp steps. */
export const POOL = { x: 628, y: 366, rx: 196, ry: 96 };
const pool = (x: number, y: number, k = 4.4) => {
    const d = Math.hypot((x - POOL.x) / POOL.rx, (y - POOL.y) / POOL.ry);
    return d >= 1 ? -Math.min(1.6, (d - 1) * 1.6) : k * Math.pow(1 - d, 1.1);
};

const FRONT = (x: number) => 350 + (x - 404) * .351; // front edge of the desk top
const BACK = (x: number) => 338 - (x - 452) * .031;  // back edge (rises slightly to the right)
/** Point on the desk top: x along the front edge, t from front (0) to back (1). */
const on = (x: number, t: number): [number, number] => [x, Math.round(FRONT(x) - t * (FRONT(x) - BACK(x)))];

function deskBody(p: Pix) {
    const L = LAYERS.desk, right = L.x + L.w;
    // Top surface, planked along its length, then the front edge band and drawer face.
    p.poly(c('wood', 3), [[404, FRONT(404)], [452, BACK(452)], [right, BACK(right)], [right, FRONT(right)]]);
    for (let k = 1; k < 7; k++) {
        // Seams run parallel to the front edge, fanning slightly toward the back.
        for (let x = 404; x < right; x++) {
            const y = Math.round(FRONT(x) - k * (FRONT(x) - BACK(x)) / 7);
            if (y > BACK(x) + 1) p.set(c('wood', 2), x, y);
        }
    }
    for (let i = 0; i < 140; i++) {
        const x = 420 + Math.floor(hash(i, 11) * (right - 430)), t = hash(i, 12);
        const y = Math.round(FRONT(x) - t * (FRONT(x) - BACK(x)) + 1);
        const len = 6 + Math.floor(hash(i, 13) * 18);
        for (let k = 0; k < len; k++) { const xx = x + k, yy = Math.round(y + k * .351 * (1 - t)); if (yy > BACK(xx) + 1 && yy < FRONT(xx) - 1) p.set(c('wood', hash(i, 14) > .5 ? 3 : 5), xx, yy); }
    }
    p.line(c('wood', 2), 452, BACK(452), right, BACK(right));
    // Front edge band (6 px) with a bright arris.
    for (let x = 404; x < right; x++) {
        const y = Math.round(FRONT(x));
        p.vline(c('wood', 6), x, y, 6); p.set(c('wood', 8), x, y); p.set(c('wood', 3), x, y + 5);
    }
    // End panel at the left and the drawer face below the edge.
    p.rect(c('wood', 2), 396, 352, 8, 200); p.vline(c('wood', 4), 397, 352, 200); p.vline(c('wood', 1), 403, 356, 196);
    p.poly(c('wood', 3), [[404, FRONT(404) + 6], [right, FRONT(right) + 6], [right, 560], [404, 560]]);
    const drawerFace = (x0: number, x1: number, d0: number, d1: number) => {
        p.poly(c('wood', 4), [[x0, FRONT(x0) + d0], [x1, FRONT(x1) + d0], [x1, FRONT(x1) + d1], [x0, FRONT(x0) + d1]]);
        for (let x = x0; x < x1; x++) { p.set(c('wood', 6), x, Math.round(FRONT(x) + d0)); p.set(c('wood', 1), x, Math.round(FRONT(x) + d1)); }
        p.vline(c('wood', 6), x0, Math.round(FRONT(x0) + d0), d1 - d0); p.vline(c('wood', 1), x1 - 1, Math.round(FRONT(x1) + d0), d1 - d0);
        const hx = Math.round((x0 + x1) / 2), hy = Math.round(FRONT(hx) + (d0 + d1) / 2);
        p.rect(c('brass', 2), hx - 6, hy - 1, 12, 3); p.hline(c('brass', 5), hx - 5, hy - 1, 10);
    };
    drawerFace(410, 512, 12, 46); drawerFace(410, 512, 50, 86); drawerFace(410, 512, 90, 126); drawerFace(410, 512, 130, 170);
    p.poly(c('wood', 1), [[518, FRONT(518) + 10], [598, FRONT(598) + 10], [598, 560], [518, 560]]);
    p.vline(c('wood', 3), 517, Math.round(FRONT(517)) + 6, 200);
    drawerFace(604, 700, 12, 50); drawerFace(604, 700, 54, 92);
    p.vline(c('wood', 2), 600, Math.round(FRONT(600)) + 6, 200);
}

function radio(p: Pix) {
    // Field radio: olive steel case, inset front panel, backlit meter, knobs, speaker and switches.
    p.poly(c('cloth', 4), [[600, 268], [604, 259], [740, 259], [744, 268]]);
    p.hline(c('cloth', 6), 604, 259, 136);
    p.rect(c('cloth', 2), 600, 268, 144, 78); p.hline(c('cloth', 5), 600, 268, 144); p.vline(c('cloth', 1), 743, 268, 78);
    p.rect(c('steel', 2), 605, 273, 134, 68); p.hline(c('steel', 1), 605, 273, 134); p.hline(c('steel', 5), 605, 340, 134);
    // Speaker grille.
    p.rect(c('steel', 1), 610, 278, 32, 30);
    for (let y = 280; y < 306; y += 3) p.hline(c('steel', 4), 612, y, 28);
    // Meter: amber backlight with a printed scale; the needle is a separate animated sprite.
    const { x: dx, y: dy } = ANCHORS.radioDial;
    p.rect(c('steel', 0), dx - 21, dy - 15, 42, 24);
    p.rect(R.brass[5], dx - 19, dy - 13, 38, 20); p.rect(R.brass[6], dx - 17, dy - 12, 34, 7); p.hline(R.brass[7], dx - 15, dy - 11, 30);
    for (let i = 0; i < 9; i++) { const x = dx - 16 + i * 4; p.vline(R.brass[2], x, dy - 9 + (i % 4 === 0 ? 0 : 1), i % 4 === 0 ? 3 : 2); }
    p.hline(R.brass[3], dx - 16, dy - 6, 33); p.rect(R.rust[5], dx + 10, dy - 6, 7, 1);
    p.rect(R.brass[4], dx - 19, dy + 4, 38, 3);
    p.rect(c('steel', 6), dx - 21, dy - 15, 42, 1);
    // Knobs: dark bakelite with a lit rim and pointer.
    const knob = (x: number, y: number, r: number) => {
        p.ellipse(c('steel', 0), x - r, y - r + 1, r * 2, r * 2); p.ellipse(c('steel', 2), x - r, y - r, r * 2, r * 2);
        p.ellipse(c('steel', 4), x - r + 1, y - r, r * 2 - 3, r * 2 - 4); p.hline(c('steel', 7), x - r + 2, y - r, r);
        p.vline(c('paper', 4), x - 1, y - r + 1, r - 1);
    };
    knob(624, 322, 7); knob(645, 326, 5); knob(704, 300, 7); knob(726, 300, 6); knob(714, 324, 6); knob(732, 326, 4);
    // Toggle switches and label plates.
    for (let i = 0; i < 4; i++) { const x = 656 + i * 9; p.rect(c('steel', 1), x, 326, 5, 6); p.rect(c('steel', 7), x + 2, 322 + (i & 1) * 2, 1, 5); }
    p.rect(c('paper', 3), 612, 312, 26, 4); p.rect(c('paper', 3), 696, 286, 30, 3); p.rect(c('paper', 3), 652, 312, 32, 3);
    // Status lamp housing (the light itself is animated).
    p.rect(c('steel', 0), ANCHORS.radioLed.x - 2, ANCHORS.radioLed.y - 2, 5, 5); p.rect(R.rust[2], ANCHORS.radioLed.x - 1, ANCHORS.radioLed.y - 1, 3, 3);
    // Carry handles and corner guards.
    p.rect(c('steel', 3), 600, 262, 6, 84); p.rect(c('steel', 3), 738, 262, 6, 84); p.vline(c('steel', 6), 600, 262, 84); p.vline(c('steel', 6), 738, 262, 84);
    for (const x of [616, 712]) { p.rect(c('steel', 2), x, 252, 16, 3); p.rect(c('steel', 2), x, 252, 3, 8); p.rect(c('steel', 2), x + 13, 252, 3, 8); p.hline(c('steel', 6), x, 252, 16); }
    // Power unit on top with its own small dial.
    p.poly(c('steel', 5), [[632, 246], [636, 240], [682, 240], [686, 246]]);
    p.rect(c('steel', 3), 632, 246, 54, 14); p.hline(c('steel', 6), 632, 246, 54); p.vline(c('steel', 1), 685, 246, 14);
    p.rect(c('paper', 5), 640, 249, 12, 7); p.rect(c('steel', 1), 645, 251, 1, 4); p.ellipse(c('steel', 1), 662, 249, 8, 8); p.ellipse(c('steel', 4), 663, 250, 5, 5);
    p.rect(c('rust', 4), 674, 250, 6, 4);
    // Coiled handset cord to a handset lying left of the radio.
    for (let x = 572; x < 602; x++) { const y = 334 + Math.round(Math.sin(x * 1.2) * 2); p.set(c('steel', 1), x, y); p.set(c('steel', 4), x, y - 1); }
    p.rect(c('steel', 2), 548, 330, 26, 7); p.rect(c('steel', 1), 546, 328, 7, 11); p.rect(c('steel', 1), 568, 328, 7, 11); p.hline(c('steel', 6), 550, 330, 20);
    // Aerial lead climbing to the window frame.
    p.line(c('steel', 1), 742, 262, 752, 232); p.line(c('steel', 1), 752, 232, 760, 226);
}

function papers(p: Pix) {
    // Battery boxes and log books stacked left of the radio.
    const box = (x: number, y: number, w: number, h: number, lv: number) => {
        p.rect(c('paper', lv), x, y, w, h); p.hline(c('paper', lv + 2), x, y, w); p.vline(c('paper', lv - 2), x + w - 1, y, h); p.hline(c('paper', lv - 2), x, y + h - 1, w);
    };
    box(548, 304, 46, 22, 3); box(552, 290, 40, 15, 4); box(556, 278, 32, 13, 3);
    p.rect(c('rust', 4), 556, 312, 10, 6); p.hline(c('paper', 1), 570, 314, 18); p.hline(c('paper', 1), 570, 318, 14);
    p.rect(c('teal', 3), 560, 294, 8, 5);
    // Tin with cigarette ends.
    p.ellipse(c('steel', 2), 512, 336, 22, 9); p.rect(c('steel', 3), 512, 340, 22, 6); p.ellipse(c('steel', 5), 513, 335, 20, 7); p.ellipse(c('steel', 1), 516, 337, 14, 4);
    p.rect(c('paper', 5), 520, 337, 5, 1); p.rect(c('paper', 5), 526, 338, 4, 1); p.set(c('rust', 6), 524, 337);
}

function map(p: Pix) {
    const quad: [number, number][] = [[476, 350], [664, 344], [700, 404], [494, 410]];
    p.poly(c('paper', 3), quad);
    const inside = (x: number, y: number) => p.get(x, y) !== 0 && x > 480 && y > 336 && y < 450;
    // Sea and land areas, coast hatching, roads and grid folds, all lightly skewed with the sheet.
    p.each((x, y, col) => {
        if (col !== c('paper', 3)) return;
        const u = (x - 476 - (y - 350) * .3) / 190, v = (y - 350 + (x - 476) * .03) / 62;
        const coast = .42 + Math.sin(v * 7.3) * .07 + Math.sin(v * 17 + 1) * .03 - (v > .6 ? .12 : 0);
        if (u > coast + .32 && v < .55) return c('teal', 4);
        if (u < coast) return (Math.round(u * 60) + Math.round(v * 30)) % 9 === 0 ? c('paper', 3) : undefined;
        if (u < coast + .02) return c('teal', 3);
        return c('teal', 5);
    }, 480, 330, 230, 130);
    for (const f of [.33, .66]) for (let t = 0; t < 1; t += .004) {
        const ax = quad[0][0] + (quad[1][0] - quad[0][0]) * f, ay = quad[0][1] + (quad[1][1] - quad[0][1]) * f;
        const bx = quad[3][0] + (quad[2][0] - quad[3][0]) * f, by = quad[3][1] + (quad[2][1] - quad[3][1]) * f;
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
        if (inside(x, y)) p.set(c('paper', 2), x, y);
    }
    for (let x = 484; x < 690; x++) { const y = Math.round(377 - (x - 484) * .02 + (x - 484) * .0); if (inside(x, y)) p.set(c('paper', 2), x, y); }
    const route: [number, number][] = [[506, 398], [546, 380], [584, 388], [612, 368], [640, 364]];
    for (let i = 0; i + 1 < route.length; i++) p.line(c('rust', 4), ...route[i], ...route[i + 1]);
    p.line(c('steel', 3), 520, 368, 560, 360); p.line(c('steel', 3), 520, 368, 530, 402);
    p.rect(c('rust', 6), 639, 363, 4, 4); p.set(c('paper', 7), 640, 364);
    p.rect(c('rust', 5), 545, 379, 3, 3);
    // Folded corner; the part past the desk edge hangs down in shadow.
    p.poly(c('paper', 6), [[664, 344], [678, 352], [668, 358]]);
    p.each((x, y, col) => col && y > FRONT(x) + 1 && x > 470 && y < 440 ? c('paper', 1 + ((x + y) % 7 === 0 ? 1 : 0)) : undefined, 470, 340, 240, 100);
    for (let x = 476; x < 560; x++) { const y = Math.round(FRONT(x) + 1); if (p.get(x, y)) p.set(c('paper', 5), x, y); }
    // Pencil across the sheet.
    p.line(c('brass', 5), 566, 398, 610, 386, 2); p.set(c('rust', 5), 565, 399);
}

function bagMugCup(p: Pix) {
    // Canvas haversack: rounded body, flap, two straps and brass buckles.
    p.ellipse(c('cloth', 3), 724, 300, 112, 72);
    p.rect(c('cloth', 3), 728, 330, 104, 40);
    p.ellipse(c('cloth', 5), 732, 302, 96, 46);
    p.poly(c('cloth', 4), [[734, 312], [826, 312], [818, 348], [742, 350]]);
    p.line(c('cloth', 7), 736, 312, 824, 312); p.line(c('cloth', 2), 742, 350, 818, 348);
    for (const x of [758, 800]) {
        p.rect(c('cloth', 2), x, 304, 9, 56); p.vline(c('cloth', 6), x, 304, 56);
        p.rect(c('brass', 3), x - 1, 342, 11, 8); p.rect(c('cloth', 2), x + 2, 344, 5, 4); p.hline(c('brass', 6), x - 1, 342, 11);
    }
    for (let i = 0; i < 18; i++) p.set(c('cloth', 2), 736 + Math.floor(hash(i, 71) * 90), 352 + Math.floor(hash(i, 72) * 16));
    p.hline(c('cloth', 1), 730, 371, 100);
    // Pencil cup behind the mug.
    p.rect(c('steel', 3), 844, 314, 24, 34); p.ellipse(c('steel', 1), 844, 310, 24, 8); p.vline(c('steel', 7), 846, 316, 30); p.vline(c('steel', 1), 867, 314, 34);
    for (const [x, top, ramp] of [[849, 292, 'rust'], [854, 286, 'teal'], [858, 296, 'paper'], [862, 290, 'brass']] as const) {
        p.line(c(ramp, 4), x, 314, x + 2, top, 2); p.set(c(ramp as RampName, 6), x + 2, top);
    }
    // Enamel mug: white glaze, dark rim, chips; handle on the right.
    p.rect(c('paper', 5), 814, 350, 30, 36); p.ellipse(c('steel', 2), 814, 345, 30, 10); p.ellipse(c('steel', 0), 817, 347, 24, 6);
    p.hline(c('slate', 2), 814, 349, 30); p.vline(c('paper', 7), 818, 352, 30); p.vline(c('paper', 3), 842, 350, 36);
    p.rect(c('paper', 3), 814, 384, 30, 3); p.rect(c('steel', 2), 836, 362, 3, 4); p.rect(c('steel', 2), 822, 374, 2, 2);
    p.rect(c('paper', 4), 844, 358, 8, 3); p.rect(c('paper', 4), 849, 358, 4, 18); p.rect(c('paper', 4), 844, 373, 8, 3); p.rect(c('paper', 2), 852, 361, 1, 14);
}

function rifle(p: Pix) {
    // Old bolt-action hunting rifle lying across the desk, muzzle toward the radio, stock over the edge.
    const [x0, y0] = on(676, .78), [x1, y1] = [886, 478];
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
    // Profile: [start, end, thickness at start, thickness at end, ramp, base level].
    const parts: [number, number, number, number, RampName, number][] = [
        [0, .4, 3, 3, 'steel', 3], [.36, .58, 5, 6, 'wood', 5], [.56, .7, 6, 6, 'steel', 3], [.7, .78, 6, 9, 'wood', 5], [.78, 1, 9, 15, 'wood', 5],
    ];
    for (const [a, b, ta, tb, ramp, lv] of parts) for (let s = a * len; s <= b * len; s += .5) {
        const k = (s / len - a) / (b - a), t = ta + (tb - ta) * k;
        for (let q = 0; q < t; q += .5) {
            const x = x0 + ux * s - nx * q, y = y0 + uy * s - ny * q;
            const level = q < 1 ? lv + 3 : q < 2 ? lv + 1 : q > t - 1.5 ? lv - 2 : lv;
            p.set(c(ramp, level), x, y);
        }
    }
    const at = (f: number, q = 0): [number, number] => [x0 + ux * f * len - nx * q, y0 + uy * f * len - ny * q];
    // Bolt handle, trigger guard, magazine floor plate, butt plate and barrel band.
    p.line(c('steel', 3), ...at(.62, 5), ...at(.6, 10), 2); p.rect(c('steel', 6), ...at(.6, 11), 3, 3);
    p.line(c('steel', 2), ...at(.7, -1), ...at(.73, -5)); p.line(c('steel', 2), ...at(.73, -5), ...at(.77, -3));
    p.line(c('steel', 1), ...at(.62, -1), ...at(.69, -1), 2);
    p.line(c('wood', 1), ...at(.995, 0), ...at(.995, 15), 2);
    p.line(c('steel', 6), ...at(.38, 0), ...at(.38, 5), 2);
    p.rect(c('steel', 1), ...at(0, 0), 2, 3);
    // Sling: an olive strap from the swivels, draped off the edge.
    for (let t = 0; t <= 1; t += .008) {
        const [ax, ay] = at(.45, -2), [bx, by] = at(.88, -10);
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * 30);
        p.rect(c('cloth', 3), x, y, 2, 3); p.set(c('cloth', 6), x, y);
    }
    // Loose cartridges.
    for (const [x, t] of [[622, .3], [632, .26], [612, .2]] as const) { const [cx, cy] = on(x, t); p.rect(c('brass', 4), cx, cy, 6, 2); p.set(c('brass', 7), cx + 1, cy); p.rect(c('steel', 4), cx + 6, cy, 2, 2); }
}

function books(p: Pix) {
    const book = (x: number, y: number, w: number, h: number, ramp: RampName, lv: number) => {
        p.poly(c(ramp, lv + 1), [[x, y], [x + w, y + w * .351], [x + w, y + w * .351 + 3], [x, y + 3]]);
        p.poly(c(ramp, lv), [[x, y + 3], [x + w, y + w * .351 + 3], [x + w, y + w * .351 + h], [x, y + h]]);
        p.line(c('paper', 5), x + 1, y + h - 2, x + w - 1, y + w * .351 + h - 2);
    };
    book(...on(712, .42), 96, 10, 'teal', 2); book(...on(720, .5), 82, 9, 'rust', 3);
    const n = on(728, .58); p.poly(c('paper', 5), [n, [n[0] + 64, n[1] + 22], [n[0] + 58, n[1] + 27], [n[0] - 6, n[1] + 5]]);
    book(906, 396, 62, 12, 'cloth', 3); book(914, 388, 54, 9, 'steel', 4);
}

export function paintDesk(): Pix {
    const L = LAYERS.desk, p = new Pix(L.w, L.h).origin(L.x, L.y);
    deskBody(p);
    p.light((x, y) => y < FRONT(x) + 2 && x > 404 ? pool(x, y) : pool(x, y, 2.2) - .6 - Math.max(0, (y - FRONT(x)) / 60));
    const props = new Pix(L.w, L.h).origin(L.x, L.y);
    papers(props); radio(props); map(props); bagMugCup(props); books(props); rifle(props);
    props.light((x, y) => pool(x, y, 2.6) - .4 - (x > 800 ? (x - 800) / 80 : 0));
    p.blit(props);
    return p;
}

export function paintLamp(): Pix[] {
    const L = LAYERS.lamp;
    return [-2, -1, 0, 1, 2].map(s => {
        const p = new Pix(L.w, L.h).origin(L.x, L.y);
        const cx = ANCHORS.lampBulb.x + s, rim = 98;
        p.line(c('steel', 1), ANCHORS.lampPivot.x, ANCHORS.lampPivot.y + 10, cx, 56);
        p.line(c('steel', 4), ANCHORS.lampPivot.x + 1, ANCHORS.lampPivot.y + 12, cx + 1, 56);
        // Socket and cap.
        p.rect(c('steel', 3), cx - 4, 54, 9, 8); p.vline(c('steel', 6), cx - 3, 55, 6);
        // Enamel dome: dark green-teal, cool highlight on the upper left, warm bounce on the rim.
        const dome: [number, number][] = [];
        for (let a = 0; a <= 32; a++) {
            const t = a / 32, x = cx - 56 + t * 112, h = Math.pow(Math.sin(t * Math.PI), .55);
            dome.push([x, rim - h * 36]);
        }
        dome.push([cx + 56, rim + 2], [cx - 56, rim + 2]);
        p.poly(c('teal', 2), dome);
        p.each((x, y, col) => {
            if (col !== c('teal', 2)) return;
            const u = (x - cx) / 56, v = (rim - y) / 36;
            if (y >= rim) return c('brass', 3);
            if (u < -.15 && u > -.62 && v > .25 && v < .75) return c('teal', 4);
            if (u < -.05 && u > -.72 && v > .15 && v < .85) return bayer(x, y) < .5 ? c('teal', 3) : undefined;
            if (u > .45) return c('teal', 1);
            if (v < .1) return c('teal', 3);
        }, cx - 58, 60, 118, 44);
        p.hline(c('brass', 5), cx - 54, rim, 108); p.hline(c('brass', 4), cx - 56, rim + 1, 112); p.hline(c('teal', 5), cx - 30, rim - 34, 34);
        for (let i = 0; i < 9; i++) p.rect(c('rust', hash(i, 91) > .5 ? 4 : 3), cx - 48 + Math.floor(hash(i, 92) * 96), rim - 4 - Math.floor(hash(i, 93) * 26), 2, 1 + (i & 1));
        // Underside glow and the bulb.
        p.rect(c('brass', 6), cx - 44, rim + 2, 88, 2); p.rect(c('brass', 7), cx - 26, rim + 2, 52, 2);
        p.ellipse(c('brass', 7), cx - 7, rim - 2, 14, 14); p.ellipse(c('brass', 8), cx - 4, rim + 1, 8, 8);
        p.set(c('brass', 5), cx - 7, rim + 4); p.set(c('brass', 5), cx + 6, rim + 4);
        return p;
    });
}

/** Additive warm overlay: faint cone under the shade and the stepped desk pool; slides with the lamp. */
export function paintLight(): Pix {
    const L = LAYERS.light, p = new Pix(L.w, L.h).origin(L.x, L.y);
    p.each((x, y) => {
        const d = Math.hypot((x - POOL.x) / (POOL.rx * .8), (y - POOL.y) / (POOL.ry * .7));
        const edge = (r: number) => d < r - .03 || (d < r + .03 && bayer(x, y) < (r + .03 - d) / .06);
        if (edge(.34)) return A.glow[2];
        if (edge(.62)) return A.glow[1];
        if (edge(.92)) return A.glow[0];
        // A tight glow just under the shade.
        const g = Math.hypot((x - ANCHORS.lampBulb.x) / 70, (y - ANCHORS.lampBulb.y - 6) / 26);
        if (y > ANCHORS.lampBulb.y && g < .6) return A.glow[1];
        if (y > ANCHORS.lampBulb.y - 2 && g < 1) return A.glow[0];
    });
    return p;
}

export function paintChair(): Pix {
    const L = LAYERS.chair, p = new Pix(L.w, L.h).origin(L.x, L.y);
    // Tubular steel office chair seen from behind: curved back panel, seat, splayed legs.
    const tube = (pts: [number, number][], lv = 2) => { for (let i = 0; i + 1 < pts.length; i++) { p.line(c('teal', lv), pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4); p.line(c('teal', lv + 2), pts[i][0] + 1, pts[i][1] - 1, pts[i + 1][0] + 1, pts[i + 1][1] - 1); } };
    // Seat (toward the desk) and front legs.
    p.poly(c('teal', 1), [[300, 470], [420, 462], [436, 478], [314, 490]]); p.line(c('teal', 3), 300, 470, 420, 462);
    p.poly(c('teal', 0), [[314, 490], [436, 478], [436, 484], [314, 496]]);
    tube([[424, 480], [432, 548]], 2); tube([[322, 494], [314, 548]], 2);
    // Back legs.
    tube([[276, 384], [270, 470], [258, 548]]); tube([[396, 378], [400, 462], [410, 548]]);
    // Back panel: rounded top, painted metal with rust and a lit right edge.
    const panel: [number, number][] = [];
    for (let a = 0; a <= 20; a++) { const t = a / 20; panel.push([274 + t * 126, 386 - Math.sin(t * Math.PI) * 10 - t * 6]); }
    panel.push([398, 436], [278, 444]);
    p.poly(c('teal', 2), panel);
    p.each((x, y, col) => {
        if (col !== c('teal', 2)) return;
        if (x > 390) return c('teal', 4);
        if (x < 284) return c('teal', 1);
        if (y < 386 - Math.sin((x - 274) / 126 * Math.PI) * 10 - (x - 274) / 21 + 3) return c('teal', 3);
    }, 270, 360, 132, 90);
    for (let i = 0; i < 22; i++) p.rect(c('rust', hash(i, 3) > .5 ? 2 : 3), 282 + Math.floor(hash(i, 4) * 108), 380 + Math.floor(hash(i, 5) * 56), 1 + (i % 3 === 0 ? 1 : 0), 1 + (i & 1));
    p.rect(c('teal', 1), 278, 440, 120, 4);
    for (const x of [300, 372]) { p.rect(c('steel', 2), x, 412, 3, 3); p.set(c('steel', 6), x, 412); }
    // Cross brace.
    p.line(c('teal', 1), 272, 470, 400, 462, 3);
    return p;
}

export function paintFore(): Pix[] {
    const L = LAYERS.fore;
    return [-2, -1, 0, 1, 2].slice(0, L.frames).map(s => {
        const p = new Pix(L.w, L.h).origin(L.x, L.y);
        // Oilskin coat hanging at the right edge, mostly silhouette with a warm rim.
        const coat: [number, number][] = [[940, -6], [974, -6], [974, 546], [926, 546], [918, 420], [930, 300], [924, 160]];
        p.poly(c('cloth', 1), coat);
        p.each((x, y, col) => {
            if (col !== c('cloth', 1)) return;
            const fold = Math.sin(y * .045 + x * .2) > .7;
            const left = x < 932 - (y > 420 ? (y - 420) * .1 : 0);
            return left ? c('brass', 2) : fold ? c('cloth', 2) : undefined;
        });
        // Thick hawser rope hanging from the ceiling; only the free end sways.
        for (let y = -6; y < 546; y++) {
            const t = Math.max(0, (y - 40) / 506), sway = Math.round(s * 2 * t * t);
            const cx = 896 + Math.round(Math.sin(y * .006) * 6) + sway, w = 26;
            for (let x = cx - w / 2; x < cx + w / 2; x++) {
                const u = (x - (cx - w / 2)) / w;
                const strand = ((y + Math.round(x * 1.1)) % 13 + 13) % 13;
                let lv = strand < 2 ? 1 : strand < 7 ? 4 : strand < 11 ? 5 : 3;
                if (u < .18) lv += 1; if (u > .78) lv -= 2;
                p.set(c('wood', Math.max(1, lv)), x, y);
            }
            p.set(c('wood', 0), cx + w / 2, y);
        }
        return p;
    });
}

/** Tiny sprites: glints, lamps, dust, rain streaks and the radio's needle/status lamp. */
export function paintSparks(): Pix[] {
    const f = () => new Pix(8, 4);
    const frames = Array.from({ length: 8 }, f);
    frames[0].set(R.brass[7], 3, 1);
    frames[1].rect(R.brass[6], 3, 1, 2, 1);
    frames[2].rect(R.sky[10], 2, 1, 3, 1);
    frames[3].rect(R.sky[9], 1, 1, 5, 1); frames[3].set(R.sky[11], 3, 1);
    frames[4].rect(R.brass[5], 2, 1, 4, 1);
    frames[5].rect(R.brass[4], 1, 1, 6, 1); frames[5].rect(R.brass[6], 3, 1, 2, 1);
    frames[6].rect(R.rust[6], 3, 1, 2, 2); frames[6].set(R.rust[7], 3, 1);
    frames[7].set(A.glow[4], 3, 1);
    return frames;
}
export function paintRain(): Pix[] {
    return [[1, 5, A.mist[2]], [1, 9, A.mist[3]], [2, 13, A.mist[4]]].map(([w, h, col]) => {
        const p = new Pix(6, 16);
        for (let k = 0; k < h; k++) p.rect(col, 4 - Math.floor(k / 4), 1 + k, w, 1);
        return p;
    });
}
export function paintRadioFx(): Pix[] {
    return [-5, 0, 4, 99].map(tip => {
        const p = new Pix(16, 8);
        if (tip === 99) { p.rect(R.rust[6], 6, 2, 3, 3); p.set(R.rust[7], 7, 3); return p; }
        p.line(R.steel[1], 8, 7, 8 + tip, 1);
        return p;
    });
}

/** Preview helper: the desk group at rest. */
export function previewDesk(): Placed[] {
    const lamp = Pix.sheet(paintLamp()), fore = Pix.sheet(paintFore()), fx = Pix.sheet(paintRadioFx());
    return [
        { pix: lamp, x: LAYERS.lamp.x, y: LAYERS.lamp.y, frame: 2, frames: 5 },
        { pix: paintDesk(), x: LAYERS.desk.x, y: LAYERS.desk.y },
        { pix: fx, x: ANCHORS.radioDial.x - 8, y: ANCHORS.radioDial.y - 9, frame: 1, frames: 4 },
        { pix: fx, x: ANCHORS.radioLed.x - 7, y: ANCHORS.radioLed.y - 3, frame: 3, frames: 4 },
        { pix: paintLight(), x: LAYERS.light.x, y: LAYERS.light.y, add: true },
        { pix: paintChair(), x: LAYERS.chair.x, y: LAYERS.chair.y },
        { pix: fore, x: LAYERS.fore.x, y: LAYERS.fore.y, frame: 2, frames: LAYERS.fore.frames },
    ];
}
