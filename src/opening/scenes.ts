/**
 * The painted shots (Sol's plates) rendered through the indexed compositor: camera moves on whole art pixels, torch
 * light in dithered steps between the plate's dark, mid and lit versions, lightning as a palette lift with a bolt,
 * two-layer rain with splashes, water glints, motes in the beam and drifting mist. Shots without plates keep the
 * placeholder painters in render.ts.
 */
import type { OpeningArt } from './assets';
import type { TimedShot } from './timeline';
import {
  CLEAR, Frame, H, Palette, W, bolt, flashLift, hash, mapped, mist, motes, noise1, rain, shade, shimmer, toIndexed, warmLift,
  type Indexed,
} from './pixel';

const ease = (p: number) => p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p);

export interface Prepared {
  pal: Palette;
  frame: Frame;
  image: ImageData;
  lut: { flash: Uint8Array; flashSoft: Uint8Array; glint: Uint8Array; fade: Uint8Array };
  ink: { rainFar: number; rainNear: number; rainLit: number; splash: number; mote: number; boltCore: number; boltGlow: number; mistSea: number; mistCity: number; drip: number };
  harbor: { sky: Indexed; mid: Indexed; breakwater: Indexed | null; near: Indexed; shipDark: Indexed; shipFlash: Indexed; glints: Int32Array; tops: Int16Array };
  hatch: { plate: Indexed[]; crew: Indexed[][]; far: Indexed[][] };
  roof: { sky: Indexed; mid: Indexed; near: Indexed; glow: Indexed[]; you: Indexed; glints: Int32Array };
}

/** First opaque row per column of a layer (layer coordinates), -1 where the column is empty. */
function columnTops(src: Indexed): Int16Array {
  const out = new Int16Array(src.w).fill(-1);
  for (let x = 0; x < src.w; x++) for (let y = 0; y < src.h; y++) if (src.px[y * src.w + x] !== CLEAR) { out[x] = y; break; }
  return out;
}
/** The brightest colours covering about `share` of a region's opaque pixels: candidates for glints. */
function brightest(src: Indexed, pal: Palette, y0: number, y1: number, share: number): Set<number> {
  const counts = new Map<number, number>(); let total = 0;
  for (let y = y0; y < Math.min(y1, src.h); y++) for (let x = 0; x < src.w; x++) {
    const v = src.px[y * src.w + x]; if (v === CLEAR) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1); total++;
  }
  const byLight = [...counts.keys()].sort((a, b) => pal.lab[b][0] - pal.lab[a][0]);
  const chosen = new Set<number>(); let covered = 0;
  for (const v of byLight) { if (covered >= total * share) break; chosen.add(v); covered += counts.get(v)!; }
  return chosen;
}
function pixelsIn(src: Indexed, colours: Set<number>, y0: number, y1: number): Int32Array {
  const list: number[] = [];
  for (let y = y0; y < Math.min(y1, src.h); y++) for (let x = 0; x < src.w; x++) if (colours.has(src.px[y * src.w + x])) list.push((y << 16) | x);
  return Int32Array.from(list);
}
/**
 * Nearest-neighbour reduction of a sprite. Stand-in only, for the farther figure in A11-A13 and A15 until Sol's
 * far versions exist; final art is never scaled.
 */
function reduced(src: Indexed, k: number): Indexed {
  const w = Math.max(1, Math.round(src.w * k)), h = Math.max(1, Math.round(src.h * k)), px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = src.px[Math.min(src.h - 1, Math.floor((y + 0.5) / k)) * src.w + Math.min(src.w - 1, Math.floor((x + 0.5) / k))];
  return { w, h, px };
}

export function prepare(art: OpeningArt): Prepared {
  const pal = new Palette();
  const ix = (image: HTMLImageElement) => toIndexed(image, pal);
  const harborSky = ix(art.harborSky), harborMid = ix(art.harborMid), harborNear = ix(art.harborNear);
  const shipDark = ix(art.shipDark), shipFlash = ix(art.shipFlash);
  const breakwater = art.harborBreakwater ? ix(art.harborBreakwater) : null;
  const hatchDark = ix(art.hatchDark), hatchLit = ix(art.hatchLit);
  const crew = [ix(art.crewNear0), ix(art.crewNear1)];
  const roofSky = ix(art.roofSky), roofMid = ix(art.roofMid), roofNear = ix(art.roofNear);
  const glow = [ix(art.glow0), ix(art.glow1)], you = ix(art.youSit);
  // Effect colours are picked from the plates' own palette, never added.
  const ink = {
    rainFar: pal.nearest('#34505c'), rainNear: pal.nearest('#7d98a2'), rainLit: pal.nearest('#d9cdb0'), splash: pal.nearest('#a9bec2'),
    mote: pal.nearest('#e2d6b8'), boltCore: pal.nearest('#f2f4ee'), boltGlow: pal.nearest('#9fb8c8'), mistSea: pal.nearest('#263942'),
    mistCity: pal.nearest('#1c2c35'), drip: pal.nearest('#c9d2d0'),
  };
  const mid = shade(0.5), dark = (c: [number, number, number]): [number, number, number] => [c[0] * 0.3, c[1] * 0.3 - 0.004, c[2] * 0.3 - 0.016];
  const lutMid = pal.lut(mid), lutDark = pal.lut(dark), lutHot = pal.lut(warmLift(0.07));
  const crewVersions = crew.map(c => [mapped(c, lutDark), mapped(c, lutMid), c, mapped(c, lutHot)]);
  const far = [0.3, 0.42, 0.56].map(k => { const r = reduced(crew[0], k); return [mapped(r, lutDark), mapped(r, lutMid)]; });
  return {
    pal, frame: new Frame(), image: new ImageData(W, H),
    lut: { flash: pal.lut(flashLift(0.2)), flashSoft: pal.lut(flashLift(0.09)), glint: pal.lut(flashLift(0.1)), fade: pal.lut(shade(0.45)) },
    ink,
    harbor: {
      sky: harborSky, mid: harborMid, breakwater, near: harborNear, shipDark, shipFlash,
      glints: pixelsIn(harborMid, brightest(harborMid, pal, 215, 360, 0.06), 215, 360), tops: columnTops(harborNear),
    },
    hatch: { plate: [hatchDark, mapped(hatchLit, lutMid), hatchLit, mapped(hatchLit, lutHot)], crew: crewVersions, far },
    roof: { sky: roofSky, mid: roofMid, near: roofNear, glow, you, glints: pixelsIn(roofMid, brightest(roofMid, pal, 236, 360, 0.04), 236, 360) },
  };
}

interface Look { calm: boolean; flash: number }

/** A08: the unlit freighter drifts in from the right; the camera follows from x=320 to 0 (Sol's registration). */
function harbor(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const h = a.harbor, p = t / shot.ms;
  const drift = ease(p / 0.85), shipX = 720 - drift * 500, cam = o.calm ? 0 : Math.round(0.64 * (shipX - 220));
  const grounded = p > 0.85, bob = o.calm || grounded ? 0 : Math.round(Math.sin(t / 650) * 1.2);
  const settle = grounded ? Math.round(ease((p - 0.85) / 0.08) * 2) : 0;
  f.copy(h.sky, -Math.round(cam * 0.6), 0);
  f.blit(h.mid, -cam, 0);
  shimmer(f, t, h.glints, -cam, 0, a.lut.glint, 0.07, o.calm);
  f.blit(o.flash > 0 ? h.shipFlash : h.shipDark, Math.round(shipX) - cam, 88 + bob + settle);
  if (h.breakwater) f.blit(h.breakwater, -cam, 0);
  f.blit(h.near, -cam, 0);
  rain(f, t, { far: 190, near: 70, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, wind: 16, seed: 3 }, o.calm);
  // Splashes on the dock: the near layer's top edge under the current camera.
  if (!o.calm) {
    const slot = Math.floor(t / 70);
    for (let c = 0; c < 106; c++) for (let back = 0; back < 3; back++) {
      const s = slot - back; if (hash(c, s * 31 + 5) > 0.05) continue;
      const sx = c * 6 + Math.floor(hash(c, s + 15) * 6), y = h.tops[sx + cam];
      if (y < 0) continue;
      if (back === 0) f.put(sx, y - 1, a.ink.splash); else { f.put(sx - back, y - 1 - back, a.ink.splash); f.put(sx + back, y - 1 - back, a.ink.splash); }
    }
  }
  if (o.flash > 0) {
    f.map(o.flash >= 1 ? a.lut.flash : a.lut.flashSoft);
    const strike = (shot.flashes ?? []).findIndex(at => t >= at && t < at + 220);
    if (o.flash >= 1 && strike >= 0) bolt(f, strike ? 150 : 430, 0, 175, 77 + strike, a.ink.boltCore, a.ink.boltGlow);
  }
}

/**
 * Torch light from two beams (the men stand below the frame), flickering and trembling. Levels for four versions:
 * 0 dark, 1/3 mid, 2/3 lit (the plateau inside a beam), 1 warm hot spot at a beam's centre. Computed on a half-size
 * grid; the ordered dither in Frame.blitLit works on full art pixels, so the steps stay crisp.
 */
function torchField(f: Frame, t: number, cx: number, cy: number, rx: number, ry: number, tremble: number, power: number, calm: boolean): void {
  const L = f.light;
  const beams = [0, 1].map(k => {
    const jx = calm ? 0 : (noise1(t / 170, 11 + k) - 0.5) * 2 * tremble, jy = calm ? 0 : (noise1(t / 210, 21 + k) - 0.5) * 2 * tremble;
    const flicker = calm ? 1 : 0.8 + 0.2 * noise1(t / 55, 31 + k);
    return { x: cx + (k ? 26 : -22) + jx, y: cy + (k ? 8 : -6) + jy, rx: rx * (k ? 0.86 : 1), ry: ry * (k ? 0.86 : 1), hot: power * flicker };
  });
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let v = 0;
    for (const b of beams) {
      const dx = (x + 1 - b.x) / b.rx, dy = (y + 1 - b.y) / b.ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1.12) continue;
      const edge = Math.min(1, (1.12 - d) * 7), core = Math.min(1, Math.max(0, (0.5 - d) * 3.5)) * b.hot;
      const l = (edge * 2 + core) / 3;
      if (l > v) v = l;
    }
    const i = y * W + x;
    L[i] = L[i + 1] = L[i + W] = L[i + W + 1] = v;
  }
}

/** A11-A15 inside the light of two torches at the open hatch. */
function hatch(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const h = a.hatch, p = t / shot.ms, beat = shot.scene === 'bow' ? 'bow' : shot.scene === 'hatch-near' ? 'near' : shot.scene === 'retreat' ? 'retreat' : shot.beat ?? 'shout';
  // Where the beams land and how hard the hands shake, per beat.
  const back = beat === 'retreat' ? ease(p) : 0;
  const aim = beat === 'bow' ? { x: 110 + ease(p / 0.65) * 230, y: 170, r: 160 + ease(p / 0.65) * 50, shake: 2 }
    : beat === 'near' ? { x: 352, y: 150, r: 205 + ease(p / 0.5) * 35, shake: 3 + 2 * p }
    : beat === 'retreat' ? { x: 352 - back * 30, y: 170 + back * 20, r: 215 - back * 70, shake: 6 }
    : { x: 344, y: 165, r: 215, shake: beat === 'turn' ? 2.5 : 1.5 };
  f.light.fill(0);
  torchField(f, t, aim.x, aim.y, aim.r * 1.12, aim.r, aim.shake, 1 - back * 0.25, o.calm);
  f.blitLit(h.plate, 0, 0);
  const frame = !o.calm && Math.floor(t / 430 + noise1(t / 900, 4) * 0.6) % 2 ? 1 : 0;
  if (beat === 'near') {
    const lurch = o.calm ? 0 : Math.round(Math.max(0, Math.sin(t / 430 * Math.PI)) * 2);
    f.blitLit(h.crew[frame], 272, 4 + lurch);
  } else if (beat !== 'bow' || p > 0.55) {
    // Farther figure: smallest when it first shows, a step closer per beat (stand-in sizes, see reduced()).
    const step = beat === 'turn' ? (p < 0.35 ? 0 : p < 0.7 ? 1 : 2) : beat === 'retreat' ? 2 : 0;
    const v = h.far[step], img = v[0];
    const floor = [222, 246, 272][step];
    f.blitLit(v, 352 - img.w / 2, floor - img.h);
  }
  // Salt dust in the beam and drips from the frame above the hatch.
  motes(f, t, 46, a.ink.mote, { x: 150, y: 20, w: 420, h: 260 }, 61, o.calm);
  if (!o.calm) for (let k = 0; k < 4; k++) {
    const period = 900 + k * 170, at = (t + k * 333) % period, x = 262 + k * 41 + Math.round(hash(k, 9) * 20), y = 18 + at * 0.32;
    if (y < 300 && f.light[Math.round(y) * W + x] > 0.3) { f.put(x, y, a.ink.drip); f.put(x, y + 1, a.ink.drip); }
  }
  rain(f, t, { far: 60, near: 26, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, litColour: a.ink.rainLit, wind: 10, seed: 9 }, o.calm);
}

/** C04: from the water tank to the light in the south-west; the near roof slides a little faster than the city. */
function roof(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const r = a.roof, p = t / shot.ms;
  const cam = o.calm ? (p < 0.5 ? 0 : 320) : Math.round(ease((p - 0.22) / 0.78) * 320);
  f.copy(r.sky, -cam, 0);
  const lit = !o.calm && noise1(t / 260, 3) > 0.62 ? 1 : 0;
  f.blit(r.glow[lit], 869 - cam, 202);
  mist(f, t, 226, 258, a.ink.mistCity, 0.55, 0.05, o.calm);
  f.blit(r.mid, -cam, 0);
  shimmer(f, t, r.glints, -cam, 0, a.lut.glint, 0.05, o.calm);
  const near = Math.round(cam * 1.15);
  f.blit(r.near, -near, 0);
  f.blit(r.you, 215 - near, 108);
}

/** Paint a painted shot; returns false when the shot has no plates yet. */
export function paintPlates(g: CanvasRenderingContext2D, a: Prepared, shot: TimedShot, t: number, calm: boolean, flash: number): boolean {
  const scene = shot.scene;
  if (scene !== 'harbor' && scene !== 'bow' && scene !== 'hatch' && scene !== 'hatch-near' && scene !== 'retreat' && scene !== 'roof') return false;
  const f = a.frame;
  f.light.fill(0);
  const o: Look = { calm, flash };
  if (scene === 'harbor') harbor(f, a, shot, t, o);
  else if (scene === 'roof') roof(f, a, shot, t, o);
  else hatch(f, a, shot, t, o);
  // Fade up from black through the palette, in dithered steps.
  if (shot.fadeIn && t < 500) f.mapDithered(null, a.lut.fade, 1 - t / 500);
  f.present(g, a.image, a.pal);
  return true;
}
