/** Indexed pixel canvas: whole-pixel primitives, ramp lighting and a deterministic PNG encoder. */
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PALETTE, RAMP_OF, shift } from './palette';

export type Pt = readonly [number, number];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
/** Ordered-dither threshold in (0, 1) for a pixel position. */
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** Small deterministic hash noise; decoration never touches gameplay RNG. */
export function hash(n: number, salt = 0): number {
    let v = Math.imul((n | 0) + Math.imul(salt, 0x9e3779b1), 374761393);
    v = Math.imul(v ^ v >>> 13, 1274126177);
    return ((v ^ v >>> 16) >>> 0) / 4294967296;
}
export const hash2 = (x: number, y: number, salt = 0) => hash(Math.imul(x, 73856093) ^ Math.imul(y, 19349663), salt);

export class Pix {
    readonly data: Uint8Array;
    constructor(readonly w: number, readonly h: number) { this.data = new Uint8Array(w * h); }
    /** Offset all drawing so callers can use scene coordinates. */
    ox = 0; oy = 0;
    origin(x: number, y: number) { this.ox = x; this.oy = y; return this; }

    get(x: number, y: number) {
        x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
        return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[y * this.w + x];
    }
    set(c: number, x: number, y: number) {
        x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
    }
    rect(c: number, x: number, y: number, w: number, h: number) {
        x = Math.round(x); y = Math.round(y);
        const x2 = x + Math.round(w), y2 = y + Math.round(h);
        for (let yy = y; yy < y2; yy++) for (let xx = x; xx < x2; xx++) this.set(c, xx, yy);
    }
    hline(c: number, x: number, y: number, w: number) { this.rect(c, x, y, w, 1); }
    vline(c: number, x: number, y: number, h: number) { this.rect(c, x, y, 1, h); }
    /** Bresenham line; width > 1 stamps a square brush. */
    line(c: number, x0: number, y0: number, x1: number, y1: number, width = 1) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        const o = Math.floor((width - 1) / 2);
        for (;;) {
            if (width === 1) this.set(c, x0, y0); else this.rect(c, x0 - o, y0 - o, width, width);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    /** Points along a line, for ropes, chains and rails. */
    static linePoints(x0: number, y0: number, x1: number, y1: number): Pt[] {
        const pts: Pt[] = [];
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
            pts.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return pts;
    }
    /** Scanline polygon with pixel-centre sampling, like src/art/pixel.ts. */
    poly(c: number | ((x: number, y: number) => number), pts: readonly Pt[]) {
        const ys = pts.map(p => p[1]);
        const min = Math.floor(Math.min(...ys)), max = Math.ceil(Math.max(...ys));
        for (let y = min; y < max; y++) {
            const edges: number[] = [];
            pts.forEach(([x1, y1], i) => {
                const [x2, y2] = pts[(i + 1) % pts.length];
                if ((y1 <= y + .5 && y2 > y + .5) || (y2 <= y + .5 && y1 > y + .5)) edges.push(x1 + (y + .5 - y1) * (x2 - x1) / (y2 - y1));
            });
            edges.sort((a, b) => a - b);
            for (let i = 0; i + 1 < edges.length; i += 2) {
                const s = Math.ceil(edges[i] - .5), e = Math.ceil(edges[i + 1] - .5);
                for (let x = s; x < e; x++) this.set(typeof c === 'number' ? c : c(x, y), x, y);
            }
        }
    }
    ellipse(c: number, x: number, y: number, w: number, h: number) {
        for (let row = 0; row < h; row++) {
            const half = w * .5 * Math.sqrt(Math.max(0, 1 - ((row + .5 - h / 2) / (h / 2)) ** 2));
            const s = Math.ceil(w / 2 - half - .5), e = Math.ceil(w / 2 + half - .5);
            this.rect(c, x + s, y + row, e - s, 1);
        }
    }
    /** Visit every pixel of a rectangle in scene coordinates. */
    each(fn: (x: number, y: number, c: number) => number | void, x = this.ox, y = this.oy, w = this.w, h = this.h) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
            const lx = xx - this.ox, ly = yy - this.oy;
            if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) continue;
            const r = fn(xx, yy, this.data[ly * this.w + lx]);
            if (typeof r === 'number') this.data[ly * this.w + lx] = r;
        }
    }
    /** Fill a rectangle choosing between two colours with an ordered-dither ratio function. */
    dither(a: number, b: number, ratio: (x: number, y: number) => number, x: number, y: number, w: number, h: number) {
        this.each((xx, yy) => bayer(xx, yy) < ratio(xx, yy) ? b : a, x, y, w, h);
    }
    /**
     * Ramp lighting: each opaque pixel moves `light(x, y)` steps along its material ramp.
     * Fractions become ordered dither only in a narrow band around each step, so light
     * reads as stepped pools with designed edges instead of noisy gradients.
     */
    light(light: (x: number, y: number, c: number) => number, band = .3, x = this.ox, y = this.oy, w = this.w, h = this.h) {
        this.each((xx, yy, c) => {
            if (!c) return;
            const v = light(xx, yy, c);
            if (!v) return;
            const base = Math.floor(v), f = v - base;
            const t = (f - (.5 - band / 2)) / band;
            const step = base + (t <= 0 ? 0 : t >= 1 ? 1 : bayer(xx, yy) < t ? 1 : 0);
            return step ? shift(c, step) : undefined;
        }, x, y, w, h);
    }
    /** Copy another canvas (transparent pixels skipped), placed in this canvas's scene coordinates. */
    blit(src: Pix, x = src.ox, y = src.oy) {
        for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) {
            const c = src.data[yy * src.w + xx];
            if (c) this.set(c, x + xx, y + yy);
        }
    }
    /** Draw a one-pixel outline of colour `c` around every pixel matching `inside`. */
    outline(c: number, inside: (c: number) => boolean, diagonal = false) {
        const marks: [number, number][] = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (this.data[y * this.w + x]) continue;
            const at = (dx: number, dy: number) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && inside(this.data[yy * this.w + xx]); };
            if (at(1, 0) || at(-1, 0) || at(0, 1) || at(0, -1) || (diagonal && (at(1, 1) || at(-1, -1) || at(1, -1) || at(-1, 1)))) marks.push([x, y]);
        }
        for (const [x, y] of marks) this.data[y * this.w + x] = c;
    }
    /** Replace colours inside a rectangle through a mapping function. */
    map(fn: (c: number, x: number, y: number) => number, x = this.ox, y = this.oy, w = this.w, h = this.h) {
        this.each((xx, yy, c) => fn(c, xx, yy), x, y, w, h);
    }
    clone() { const p = new Pix(this.w, this.h).origin(this.ox, this.oy); p.data.set(this.data); return p; }
    /** Horizontal strip of frames into one sprite sheet. */
    static sheet(frames: Pix[]) {
        const w = frames[0].w, h = frames[0].h, sheet = new Pix(w * frames.length, h);
        frames.forEach((f, i) => { for (let y = 0; y < h; y++) sheet.data.set(f.data.subarray(y * w, y * w + w), y * sheet.w + i * w); });
        return sheet;
    }
    pixelHash() { return createHash('sha256').update(new Uint8Array(new Uint32Array([this.w, this.h]).buffer)).update(this.data).digest('hex'); }
    colours() { return new Set(this.data).size - (this.data.includes(0) ? 1 : 0); }
    opaqueBounds() {
        let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.data[y * this.w + x]) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    /** Indexed PNG (colour type 3) with the shared palette and tRNS. Bytes depend only on pixels and zlib. */
    png(): Buffer {
        let max = 0;
        for (const c of this.data) if (c > max) max = c;
        const count = max + 1;
        const chunk = (type: string, body: Buffer) => {
            const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
            const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0);
            return Buffer.concat([head, body, crc]);
        };
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 3;
        const plte = Buffer.alloc(count * 3), trns = Buffer.alloc(count);
        for (let i = 0; i < count; i++) { const p = PALETTE[i]; plte[i * 3] = p.r; plte[i * 3 + 1] = p.g; plte[i * 3 + 2] = p.b; trns[i] = p.a; }
        const raw = Buffer.alloc((this.w + 1) * this.h);
        for (let y = 0; y < this.h; y++) { raw[y * (this.w + 1)] = 0; raw.set(this.data.subarray(y * this.w, (y + 1) * this.w), y * (this.w + 1) + 1); }
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
    }
    /** Decode a PNG written by png() back to palette indices (used by tests). */
    static decode(png: Buffer): Pix {
        let off = 8, w = 0, h = 0; const idat: Buffer[] = [];
        while (off < png.length) {
            const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8), body = png.subarray(off + 8, off + 8 + len);
            if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); if (body[9] !== 3 || body[8] !== 8) throw new Error('Not an 8-bit indexed PNG'); }
            if (type === 'IDAT') idat.push(body);
            off += 12 + len;
        }
        const raw = inflateSync(Buffer.concat(idat)), p = new Pix(w, h);
        for (let y = 0; y < h; y++) { if (raw[y * (w + 1)] !== 0) throw new Error('Unexpected PNG filter'); p.data.set(raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1)), y * w); }
        return p;
    }
}
export { RAMP_OF };
