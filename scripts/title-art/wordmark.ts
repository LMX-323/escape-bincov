/**
 * Title wordmark. Built from the embedded Bincov Text glyphs (寒蝉点阵体 16px, SIL OFL 1.1;
 * see assets/fonts) so it shares the game's lettering: integer upscale, half-step bolding,
 * filled diagonal stairs, a few deterministic chips and a hard shadow. Interactive text stays HTML.
 */
import { Pix, hash } from './pix';
import { c } from './palette';

/** 16-row bitmaps sampled from assets/fonts/bincov-text.woff2 at its native 16 px ('#' = ink). */
export const GLYPHS: Record<string, string[]> = {
    '逃': [
        '.........#.#.....',
        '...#.....#.#.....',
        '....#.#..#.#..#..',
        '....#..#.#.#.#...',
        '........##.##....',
        '.........#.#.....',
        '.####...##.##....',
        '....#..#.#.#.#...',
        '....#.#..#.#..#..',
        '....#...#..#.....',
        '....#...#..#..#..',
        '....#..#...#..#..',
        '....#.#.....###..',
        '...#.#...........',
        '..#...##########.',
        '.................',
    ],
    '离': [
        '.......#.........',
        '........#........',
        '.###############.',
        '.................',
        '....#.#...#.#....',
        '....#..###..#....',
        '....#.#...#.#....',
        '....#########....',
        '........#........',
        '..#############..',
        '..#....#......#..',
        '..#...#...#...#..',
        '..#..#######..#..',
        '..#...#....#..#..',
        '..#.........#.#..',
        '..#..........#...',
    ],
    '滨': [
        '.........#.......',
        '...#......#......',
        '....#.##########.',
        '....#.#........#.',
        '.#...#......#.#..',
        '..#....#####.....',
        '..#..#.#.........',
        '.....#.#.........',
        '....#..########..',
        '....#..#....#....',
        '.###...#....#....',
        '...#.###########.',
        '...#.............',
        '...#....#...#....',
        '...#...#.....#...',
        '......#.......#..',
    ],
    '科': [
        '.....#......#....',
        '....###.#...#....',
        '.####....#..#....',
        '....#....#..#....',
        '....#.......#....',
        '.######.#...#....',
        '....#....#..#....',
        '...###...#..#....',
        '...##.#.....#....',
        '..#.#.......####.',
        '..#.#..######....',
        '.#..#.......#....',
        '....#.......#....',
        '....#.......#....',
        '....#.......#....',
        '....#.......#....',
    ],
    '夫': [
        '........#........',
        '........#........',
        '........#........',
        '........#........',
        '...###########...',
        '........#........',
        '........#........',
        '........#........',
        '.###############.',
        '.......#.#.......',
        '......#...#......',
        '......#...#......',
        '.....#.....#.....',
        '....#.......#....',
        '...#.........#...',
        '.##...........##.',
    ],
};

/** One glyph at `scale`: solid blocks, chunky diagonal joints, then bolding right/down. */
function glyphMask(ch: string, scale: number, boldX: number, boldY: number) {
    const rows = GLYPHS[ch], h = rows.length, w = rows[0].length, S = scale;
    const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] === '#';
    const W = w * S + boldX, H = h * S + boldY, base = new Uint8Array(W * H);
    const put = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < W && y < H) base[y * W + x] = 1; };
    const block = (x: number, y: number) => { for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) put(x + xx, y + yy); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!ink(x, y)) continue;
        block(x * S, y * S);
        // Diagonal neighbours without a shared side: bridge the stair with half-block steps.
        for (const dx of [-1, 1]) if (ink(x + dx, y + 1) && !ink(x + dx, y) && !ink(x, y + 1)) {
            const half = Math.ceil(S / 2);
            block(x * S + dx * half, y * S + half);
        }
    }
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let on = 0;
        for (let dy = 0; dy <= boldY && !on; dy++) for (let dx = 0; dx <= boldX && !on; dx++) if (x - dx >= 0 && y - dy >= 0 && base[(y - dy) * W + x - dx]) on = 1;
        m[y * W + x] = on;
    }
    return { m, W, H };
}

function line(text: string, scale: number, gap: number, boldX: number, boldY: number) {
    const masks = [...text].map(ch => glyphMask(ch, scale, boldX, boldY));
    const W = masks.reduce((s, g) => s + g.W, 0) + gap * (masks.length - 1), H = masks[0].H, m = new Uint8Array(W * H);
    let ox = 0;
    masks.forEach((g, i) => {
        for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.m[y * g.W + x]) m[y * W + ox + x] = 1;
        // Chips: knock single pixels out of exposed stroke corners, never more than four per glyph.
        let chips = 0;
        for (let k = 0; k < 400 && chips < 4; k++) {
            const x = Math.floor(hash(k, i * 17 + scale) * g.W), y = Math.floor(hash(k, i * 17 + scale + 5) * g.H);
            const at = (dx: number, dy: number) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < g.W && yy < g.H && g.m[yy * g.W + xx]; };
            if (!at(0, 0)) continue;
            const open = [at(1, 0), at(-1, 0), at(0, 1), at(0, -1)].filter(v => !v).length;
            if (open === 2 && !(at(1, 0) && at(-1, 0)) && !(at(0, 1) && at(0, -1))) { m[y * W + ox + x] = 0; chips++; }
        }
        ox += g.W + gap;
    });
    return { m, W, H };
}

export function paintWordmark(): Pix {
    const top = line('逃离', 2, 4, 1, 1), main = line('滨科夫', 3, 4, 2, 1), shadow = 2, lead = 9;
    const W = Math.max(top.W, main.W) + shadow, H = top.H + lead + main.H + shadow;
    const p = new Pix(W, H), face = new Uint8Array(W * H);
    const stamp = (g: { m: Uint8Array; W: number; H: number }, ox: number, oy: number) => {
        for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.m[y * g.W + x]) face[(oy + y) * W + ox + x] = 1;
    };
    stamp(top, 1, 0); stamp(main, 0, top.H + lead);
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && face[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!at(x, y) && (at(x - shadow, y - shadow) || at(x - 1, y - shadow) || at(x - shadow, y - 1))) p.set(c('steel', 1), x, y);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!at(x, y)) continue;
        // Cream face, a cooler shade on lower/right edges, the odd worn pixel.
        const edge = !at(x + 1, y) || !at(x, y + 1);
        p.set(c('paper', edge ? 4 : 6), x, y);
    }
    const b = p.opaqueBounds()!, out = new Pix(b.w, b.h);
    for (let y = 0; y < b.h; y++) out.data.set(p.data.subarray((b.y + y) * W + b.x, (b.y + y) * W + b.x + b.w), y * b.w);
    return out;
}
