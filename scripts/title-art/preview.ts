/** Review helper: composite indexed layers to an RGBA PNG (not shipped; previews only). */
import { deflateSync, crc32 } from 'node:zlib';
import { Pix } from './pix';
import { PALETTE } from './palette';

export type Placed = { pix: Pix; x: number; y: number; frame?: number; frames?: number; alpha?: number; add?: boolean };

export function compose(w: number, h: number, layers: Placed[], background = [8, 17, 21]): Uint8Array {
    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { out[i * 4] = background[0]; out[i * 4 + 1] = background[1]; out[i * 4 + 2] = background[2]; out[i * 4 + 3] = 255; }
    for (const { pix, x, y, frame = 0, frames = 1, alpha = 1, add } of layers) {
        const fw = pix.w / frames;
        for (let yy = 0; yy < pix.h; yy++) for (let xx = 0; xx < fw; xx++) {
            const ci = pix.data[yy * pix.w + frame * fw + xx];
            if (!ci) continue;
            const sx = x + xx, sy = y + yy;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
            const col = PALETTE[ci], a = col.a / 255 * alpha, o = (sy * w + sx) * 4;
            for (const [k, v] of [[0, col.r], [1, col.g], [2, col.b]] as const) out[o + k] = add ? Math.min(255, out[o + k] + v * a) : out[o + k] * (1 - a) + v * a;
        }
    }
    return out;
}

export function rgbaPng(w: number, h: number, rgba: Uint8Array, scale = 1): Buffer {
    const W = w * scale, H = h * scale;
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) {
        raw[y * (W * 3 + 1)] = 0;
        for (let x = 0; x < W; x++) {
            const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4, d = y * (W * 3 + 1) + 1 + x * 3;
            raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
        }
    }
    const chunk = (type: string, body: Buffer) => {
        const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0);
        return Buffer.concat([head, body, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
