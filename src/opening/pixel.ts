/**
 * A small indexed-colour compositor for the painted shots. Every frame is built from palette indices on the
 * 640x360 art grid, so light, lightning and fades step through the plates' own colours: no alpha blending, no blur,
 * no colours the artist did not choose. Pure data in, pixels out; the only DOM use is decoding images and present().
 */
export const W = 640, H = 360;
/** Index used for transparent pixels in layers. */
export const CLEAR = 255;

export interface Indexed { readonly w: number; readonly h: number; readonly px: Uint8Array }

type Lab = [number, number, number];
function oklab(r: number, g: number, b: number): Lab {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** The colours of the loaded plates, in first-seen order; at most 255 (index 255 is transparent). */
export class Palette {
  /** Pixel values for an ImageData Uint32 view (little-endian ABGR). */
  readonly rgba = new Uint32Array(256);
  readonly lab: Lab[] = [];
  private readonly lookup = new Map<number, number>();

  index(r: number, g: number, b: number): number {
    const key = (r << 16) | (g << 8) | b;
    let i = this.lookup.get(key);
    if (i === undefined) {
      i = this.lab.length;
      if (i >= CLEAR) throw new Error('Opening palette exceeds 255 colours.');
      this.lookup.set(key, i);
      this.lab.push(oklab(r, g, b));
      this.rgba[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    return i;
  }
  get size(): number { return this.lab.length; }
  /** Nearest existing colour to a target in OKLab. */
  nearestLab(target: Lab, except = -1): number {
    let best = 0, bestD = Infinity;
    this.lab.forEach((c, i) => {
      if (i === except) return;
      const d = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }
  nearest(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return this.nearestLab(oklab((n >> 16) & 255, (n >> 8) & 255, n & 255));
  }
  /** A lookup table moving every colour through fn (in OKLab) to its nearest palette colour; CLEAR stays CLEAR. */
  lut(fn: (c: Lab) => Lab): Uint8Array {
    const table = new Uint8Array(256).fill(CLEAR);
    this.lab.forEach((c, i) => { table[i] = this.nearestLab(fn(c)); });
    return table;
  }
}

/** Darker by a factor of lightness (chroma follows a little less, so shadows keep their hue). */
export const shade = (k: number) => (c: Lab): Lab => [c[0] * k, c[1] * (0.4 + 0.6 * k), c[2] * (0.4 + 0.6 * k)];
/** Lightning: lift lightness and push slightly toward cold white. */
export const flashLift = (amount: number) => (c: Lab): Lab => [Math.min(1, c[0] + amount), c[1] * 0.75 - 0.004, c[2] * 0.75 - 0.012];

/** Torchlight: a little lighter and warmer. */
export const warmLift = (amount: number) => (c: Lab): Lab => [Math.min(1, c[0] + amount), c[1] + amount * 0.05, c[2] + amount * 0.18];

/** Decode an image into palette indices (alpha below 128 is transparent). */
export function toIndexed(image: HTMLImageElement, palette: Palette): Indexed {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, image.width, image.height).data;
  const px = new Uint8Array(image.width * image.height);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = data[j + 3] < 128 ? CLEAR : palette.index(data[j], data[j + 1], data[j + 2]);
  canvas.width = canvas.height = 0;
  return { w: image.width, h: image.height, px };
}

/** Apply a LUT to a whole layer, for derived versions (darker sprite, mid-light plate). */
export function mapped(src: Indexed, table: Uint8Array): Indexed {
  const px = new Uint8Array(src.px.length);
  for (let i = 0; i < px.length; i++) px[i] = table[src.px[i]];
  return { w: src.w, h: src.h, px };
}

/** 4x4 ordered-dither thresholds in (0, 1). */
const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)];

/** Stable hash noise in [0, 1). */
export function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 1D value noise in [0, 1). */
export function noise1(t: number, seed = 0): number {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

export class Frame {
  readonly px = new Uint8Array(W * H);
  /** Light level 0..1 per pixel, for scenes lit by a torch. */
  readonly light = new Float32Array(W * H);

  fill(i: number): void { this.px.fill(i); }

  /** Copy an opaque layer whose top-left sits at (x, y); rows are copied whole. */
  copy(src: Indexed, x: number, y: number): void {
    x = Math.round(x); y = Math.round(y);
    const sx0 = Math.max(0, -x), sx1 = Math.min(src.w, W - x), sy0 = Math.max(0, -y), sy1 = Math.min(src.h, H - y);
    if (sx1 <= sx0) return;
    for (let sy = sy0; sy < sy1; sy++) this.px.set(src.px.subarray(sy * src.w + sx0, sy * src.w + sx1), (sy + y) * W + sx0 + x);
  }

  /** Draw a layer with transparency, optionally through a LUT. */
  blit(src: Indexed, x: number, y: number, table?: Uint8Array): void {
    x = Math.round(x); y = Math.round(y);
    const sx0 = Math.max(0, -x), sx1 = Math.min(src.w, W - x), sy0 = Math.max(0, -y), sy1 = Math.min(src.h, H - y);
    for (let sy = sy0; sy < sy1; sy++) {
      let s = sy * src.w + sx0, d = (sy + y) * W + sx0 + x;
      for (let sx = sx0; sx < sx1; sx++, s++, d++) {
        const v = src.px[s];
        if (v !== CLEAR) this.px[d] = table ? table[v] : v;
      }
    }
  }

  /**
   * Draw one of several versions of a layer (darkest first) per pixel, chosen by this.light and ordered dithering,
   * so light falls off in crisp steps on the art grid.
   */
  blitLit(versions: readonly Indexed[], x: number, y: number): void {
    x = Math.round(x); y = Math.round(y);
    const top = versions.length - 1, first = versions[0];
    const sx0 = Math.max(0, -x), sx1 = Math.min(first.w, W - x), sy0 = Math.max(0, -y), sy1 = Math.min(first.h, H - y);
    for (let sy = sy0; sy < sy1; sy++) {
      const dy = sy + y;
      let s = sy * first.w + sx0, d = dy * W + sx0 + x;
      for (let sx = sx0; sx < sx1; sx++, s++, d++) {
        if (first.px[s] === CLEAR) continue;
        const q = this.light[d] * top, base = q | 0;
        const level = Math.min(top, base + (q - base > bayer(sx + x, dy) ? 1 : 0));
        this.px[d] = versions[level].px[s];
      }
    }
  }

  /** Run every pixel through a LUT (lightning, fades). */
  map(table: Uint8Array): void { for (let i = 0; i < this.px.length; i++) this.px[i] = table[this.px[i]]; }

  /** Step between LUTs per pixel with ordered dithering: amount 0 = from, 1 = to (used for smooth palette fades). */
  mapDithered(from: Uint8Array | null, to: Uint8Array, amount: number): void {
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const v = this.px[i];
      this.px[i] = amount > bayer(x, y) ? to[v] : from ? from[v] : v;
    }
  }

  put(x: number, y: number, i: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < W && y >= 0 && y < H) this.px[y * W + x] = i;
  }
  get(x: number, y: number): number { return x >= 0 && x < W && y >= 0 && y < H ? this.px[(y | 0) * W + (x | 0)] : CLEAR; }

  /** A 1-pixel line (Bresenham), for lightning bolts. */
  line(x0: number, y0: number, x1: number, y1: number, i: number): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.put(x0, y0, i);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }

  present(g: CanvasRenderingContext2D, image: ImageData, palette: Palette): void {
    const out = new Uint32Array(image.data.buffer);
    for (let i = 0; i < out.length; i++) out[i] = palette.rgba[this.px[i]];
    g.putImageData(image, 0, 0);
  }
}

export interface RainStyle {
  /** Drops per layer: far (short, dim, slow) and near (long, bright, fast). */
  far: number; near: number;
  farColour: number; nearColour: number;
  /** Colour of drops passing through light (this.light > 0.35); omit to ignore light. */
  litColour?: number;
  /** Horizontal drift per 100 px of fall. */
  wind: number;
  seed: number;
}
/** Rain on the art grid: two layers of streaks, deterministic in time (frozen when calm). */
export function rain(frame: Frame, t: number, style: RainStyle, calm: boolean): void {
  const time = calm ? 0 : t / 1000;
  for (const [count, len, speed, colour, layer] of [[style.far, 3, 260, style.farColour, 0], [style.near, 7, 520, style.nearColour, 1]] as const) {
    for (let i = 0; i < count; i++) {
      const v = speed * (0.85 + 0.3 * hash(i, style.seed + layer)), span = H + 40;
      const fall = (hash(i, style.seed + 7 + layer) * span + v * time) % span - 20;
      const drift = style.wind * fall / 100;
      const x = (((hash(i, style.seed + 13 + layer) * (W + 80) + drift - 40) % (W + 80)) + W + 80) % (W + 80) - 40;
      for (let k = 0; k < len; k++) {
        const px = Math.round(x - style.wind * k / 100), py = Math.round(fall + k);
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const lit = style.litColour !== undefined && frame.light[py * W + px] > 0.35;
        frame.px[py * W + px] = lit ? style.litColour! : colour;
      }
    }
  }
}

/**
 * Splashes along surfaces: per column, the screen y where rain lands (or -1). Each splash is a three-frame sprite
 * (dot, then two droplets jumping apart), scheduled by hash so the pattern never visibly repeats.
 */
export function splashes(frame: Frame, t: number, surface: Int16Array, colour: number, density: number, seed: number, calm: boolean): void {
  if (calm) return;
  const slot = Math.floor(t / 70), cells = Math.floor(W / 6);
  for (let c = 0; c < cells; c++) {
    for (let back = 0; back < 3; back++) {
      const s = slot - back;
      if (hash(c, s * 31 + seed) > density) continue;
      const x = c * 6 + Math.floor(hash(c, s + seed * 3) * 6), y = surface[x];
      if (y < 0) continue;
      if (back === 0) frame.put(x, y - 1, colour);
      else { frame.put(x - back, y - 1 - back, colour); frame.put(x + back, y - 1 - back, colour); }
    }
  }
}

/** For each screen column, the first opaque row of a layer at (x, y), or -1. */
export function surfaceOf(src: Indexed, x: number, y: number, minY = 0): Int16Array {
  const out = new Int16Array(W).fill(-1);
  for (let sx = 0; sx < W; sx++) {
    const lx = sx - Math.round(x);
    if (lx < 0 || lx >= src.w) continue;
    for (let ly = Math.max(0, minY - y); ly < src.h; ly++) if (src.px[ly * src.w + lx] !== CLEAR) { out[sx] = ly + y; break; }
  }
  return out;
}

/** Pixels of a layer whose colour is one of `colours`, as packed layer coordinates (for shimmer). */
export function pixelsOf(src: Indexed, colours: Set<number>, region: { y0: number; y1: number }): Int32Array {
  const list: number[] = [];
  for (let y = Math.max(0, region.y0); y < Math.min(src.h, region.y1); y++)
    for (let x = 0; x < src.w; x++) if (colours.has(src.px[y * src.w + x])) list.push((y << 16) | x);
  return Int32Array.from(list);
}

/** Twinkle a fraction of the given pixels to another colour (water glints, wet highlights). */
export function shimmer(frame: Frame, t: number, pixels: Int32Array, x: number, y: number, table: Uint8Array, rate: number, calm: boolean): void {
  if (calm) return;
  const slot = Math.floor(t / 110);
  for (let k = 0; k < pixels.length; k++) {
    if (hash(k, slot) > rate) continue;
    const px = (pixels[k] & 0xffff) + Math.round(x), py = (pixels[k] >> 16) + Math.round(y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    const d = py * W + px;
    frame.px[d] = table[frame.px[d]];
  }
}

/** A forked lightning bolt from (x, top) down to y1, stable for one strike (seed). */
export function bolt(frame: Frame, x: number, top: number, y1: number, seed: number, core: number, glow: number): void {
  let px = x, py = top, branch = 0;
  while (py < y1) {
    const nx = px + Math.round((hash(py, seed) - 0.5) * 10), ny = py + 4 + Math.floor(hash(py, seed + 1) * 6);
    frame.line(px + 1, py, nx + 1, ny, glow); frame.line(px, py, nx, ny, core);
    if (branch < 2 && hash(py, seed + 2) > 0.8) {
      branch++;
      let bx = nx, by = ny;
      const dir = hash(py, seed + 3) > 0.5 ? 1 : -1;
      for (let k = 0; k < 4; k++) { const ex = bx + dir * (3 + Math.floor(hash(k, seed + by) * 6)), ey = by + 3 + Math.floor(hash(k + 9, seed) * 4); frame.line(bx, by, ex, ey, glow); bx = ex; by = ey; }
    }
    px = nx; py = ny;
  }
}

/** Drifting motes, drawn only where the light is strong enough to catch them. */
export function motes(frame: Frame, t: number, count: number, colour: number, area: { x: number; y: number; w: number; h: number }, seed: number, calm: boolean): void {
  const time = calm ? 0 : t / 1000;
  for (let i = 0; i < count; i++) {
    const x = area.x + ((hash(i, seed) * area.w + time * (4 + 6 * hash(i, seed + 1))) % area.w);
    const y = area.y + ((hash(i, seed + 2) * area.h + Math.sin(time * 0.9 + i) * 3 + time * 2) % area.h);
    const d = Math.round(y) * W + Math.round(x);
    if (x >= 0 && x < W && y >= 0 && y < H && frame.light[d] > 0.55 && hash(i, Math.floor(t / 240)) > 0.25) frame.px[d] = colour;
  }
}

/** Low mist: a dithered band of one colour drifting sideways, densest at its centre line. */
export function mist(frame: Frame, t: number, y0: number, y1: number, colour: number, density: number, speed: number, calm: boolean): void {
  const time = calm ? 0 : t / 1000;
  const mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const fall = 1 - Math.abs(y - mid) / half;
    for (let x = 0; x < W; x++) {
      const n = noise1(x / 46 + time * speed + y * 0.07, 5) * noise1(x / 17 - time * speed * 0.6, 9 + (y >> 3));
      if (n * fall * density > bayer(x, y) * 0.5 + 0.18) frame.px[y * W + x] = colour;
    }
  }
}
