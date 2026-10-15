/**
 * The painted shots (Sol's plates) rendered through the indexed compositor: camera moves on whole art pixels, torch
 * light in dithered steps between the plate's dark, mid and lit versions, lightning as Sol's flash plates or a palette
 * lift with a bolt, two-layer rain with splashes, water glints, motes in the beam and drifting mist. If the plates
 * cannot be loaded, the placeholder painters in render.ts stand in.
 */
import { OPENING_ASSET_META, type OpeningArt } from './assets';
import type { TimedShot } from './timeline';
import {
  CLEAR, Frame, H, Palette, W, bolt, flashLift, hash, mapped, mist, motes, noise1, rain, shade, shimmer, toIndexed, warmLift,
  type Indexed,
} from './pixel';

const ease = (p: number) => p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p);
/** A layer in four light levels for Frame.blitLit: dark, mid, lit, warm hot spot. */
type Versions = Indexed[];
type Point = [number, number];
interface Person { img: Indexed; dark: Indexed; at: Point }

export interface Prepared {
  pal: Palette;
  frame: Frame;
  image: ImageData;
  lut: { flash: Uint8Array; flashSoft: Uint8Array; glint: Uint8Array; fade: Uint8Array; black: Uint8Array };
  ink: {
    rainFar: number; rainNear: number; rainLit: number; splash: number; mote: number; boltCore: number; boltGlow: number;
    mistSea: number; mistCity: number; drip: number; screenBg: number; screenBar: number; screenText: number; screenDim: number;
    screenWarm: number; screenCard: number; screenThumb: number; screenShape: number; ripple: number;
  };
  phone: { hand: Indexed; body: Indexed; quad: Point[]; keep: Int32Array; screen: Indexed; clock: Record<string, Uint8Array>; news: Uint8Array };
  shed: { far: Indexed[]; shelter: Indexed[]; eave: Indexed[]; pose: Record<string, Person>; wangFlash: Indexed; phoneFx: Indexed[]; phoneAt: Point };
  harbor: { sky: Indexed; mid: Indexed; breakwater: Indexed; near: Indexed; shipDark: Indexed; shipFlash: Indexed; glints: Int32Array; tops: Int16Array };
  beach: { far: Versions; near: Versions; walkers: Person[] };
  bow: Versions;
  hatch: { plate: Versions; crew: Versions[]; crewAt: Point; farBack: Versions; farAt: Point; mid: Record<'turn' | 'step' | 'stop', Versions>; midAt: Point };
  face: { down: Versions; up: Versions };
  ship: { plate: Versions; flash: Indexed; shadows: Versions[]; shadowsFlash: Indexed[]; lunge: Versions; torch: Indexed[]; torchAt: Point; splash: Indexed[]; splashAt: Point };
  roof: { sky: Indexed; mid: Indexed; near: Indexed; glow: Indexed[]; you: Indexed; glints: Int32Array; glowAt: Point; youAt: Point; climb: Indexed; climbAt: Point };
  flood: { sky: Indexed; city: Indexed; water: Indexed; glints: Int32Array };
  street: { plate: Indexed; water: Indexed; stand: Indexed; sit: Indexed; standAt: Point; sitAt: Point; glints: Int32Array };
  dayHarbor: { sky: Indexed; mid: Indexed; breakwater: Indexed; near: Indexed; ship: Indexed; shipAt: Point; glints: Int32Array };
  hiding: { room: Indexed; cloth: Indexed; you: Indexed; youAt: Point };
  gap: { street: Indexed; mask: Indexed; looter: Indexed[]; looterAt: Point; fight: Indexed[]; fightAt: Point; drag: Indexed; dragAt: Point };
  bottles: Indexed[];
  close: { plate: Indexed; near: Indexed; glowLit: Indexed; glowAt: Point; glints: Int32Array };
  lane: { plate: Indexed; water: Indexed; wade: Indexed[]; at: Point; foot: Point; glints: Int32Array };
}

/** First opaque row per column of a layer (layer coordinates), -1 where the column is empty. */
function columnTops(src: Indexed): Int16Array {
  const out = new Int16Array(src.w).fill(-1);
  for (let x = 0; x < src.w; x++) for (let y = 0; y < src.h; y++) if (src.px[y * src.w + x] !== CLEAR) { out[x] = y; break; }
  return out;
}
/** The brightest colours covering about `share` of a region's opaque pixels: candidates for glints. */
function brightest(src: Indexed, pal: Palette, y0: number, y1: number, share: number, keep: (v: number) => boolean = () => true): Set<number> {
  const counts = new Map<number, number>(); let total = 0;
  for (let y = y0; y < Math.min(y1, src.h); y++) for (let x = 0; x < src.w; x++) {
    const v = src.px[y * src.w + x]; if (v === CLEAR || !keep(v)) continue;
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
/** Top-left of a sprite on its layer, as Sol registered it in the manifest. */
function placed(id: string): Point {
  const place = OPENING_ASSET_META[id]?.place;
  if (!place) throw new Error(`No placement registered for ${id}`);
  return place.xy;
}
/** White-on-transparent text rasterised in the pixel font, as a 0/1 mask. */
function textMask(text: string, w: number, h: number): Uint8Array {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff'; g.font = '16px "Bincov Text", monospace'; g.textBaseline = 'top'; g.fillText(text, 0, 0);
  const data = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  canvas.width = canvas.height = 0;
  return mask;
}

/** The phone's glass on op-bg02-phone, measured from the plate (slightly inside the bezel). */
const SCREEN_QUAD: Point[] = [[281, 40], [392, 50], [372, 246], [259, 236]];
const SCREEN_W = 112, SCREEN_H = 200;

/** Every plate indexed into one palette. */
export interface Indexing { pal: Palette; plates: Map<string, Indexed> }

/** Index the plates one at a time, calling pause() between them so the page keeps drawing and answering. */
export async function indexPlates(art: OpeningArt, pause: () => Promise<void>): Promise<Indexing> {
  const pal = new Palette(), plates = new Map<string, Indexed>();
  for (const [id, image] of Object.entries(art)) { plates.set(id, toIndexed(image, pal)); await pause(); }
  return { pal, plates };
}

export function prepare(art: OpeningArt, indexed?: Indexing): Prepared {
  const pal = indexed?.pal ?? new Palette();
  const get = (id: string) => {
    const done = indexed?.plates.get(id); if (done) return done;
    const image = art[id]; if (!image) throw new Error(`Opening plate missing: ${id}`); return toIndexed(image, pal);
  };
  // Decode every plate first so the palette is complete before any lookup table is built.
  const harborSky = get('op-bg03-harbor-sky-night'), harborMid = get('op-bg03-harbor-mid-night'), harborNear = get('op-bg03-harbor-near-night');
  const shipDark = get('op-sp01-ship-dark'), shipFlash = get('op-sp01-ship-flash'), breakwater = get('op-bg03-harbor-breakwater-night');
  const hatchDark = get('op-bg05-hatch-dark'), hatchLit = get('op-bg05-hatch-lit');
  const crew = [get('op-ch03-near-f0'), get('op-ch03-near-f1')];
  const roofSky = get('op-bg13-roof-sky'), roofMid = get('op-bg13-roof-mid'), roofNear = get('op-bg13-roof-near');
  const glow = [get('op-bg13-glow-f0'), get('op-bg13-glow-f1')], you = get('op-ch04-sit-f0');
  const hand = get('op-bg02-hand'), phoneBody = get('op-bg02-phone');
  const shedFar = [get('op-bg01-far-dark'), get('op-bg01-far-flash')], shelter = [get('op-bg01-shelter-dark'), get('op-bg01-shelter-flash')];
  const eave = [get('op-bg01-eave-dark'), get('op-bg01-eave-flash')];
  const poses = ['op-ch01-sit-f0', 'op-ch01-startled-f0', 'op-ch01-pickup-f0', 'op-ch01-look-f0', 'op-ch01-raincoat-f0',
    'op-ch02-stand-f0', 'op-ch02-approach-f0', 'op-ch02-lookback-f0', 'op-ch02-phone-f0'].map(id => [id, get(id)] as const);
  const wangFlash = get('op-ch02-stand-flash-f0'), phoneFx = [get('op-fx-phone-f0'), get('op-fx-phone-f1')];
  const beachFar = [get('op-bg04-far-dark'), get('op-bg04-far-lit')], beachNear = [get('op-bg04-near-dark'), get('op-bg04-near-lit')];
  const walkers = [get('op-ch01-far-walk-f0'), get('op-ch02-far-walk-f0')];
  const bow = [get('op-bg05b-bow-dark'), get('op-bg05b-bow-lit')];
  const farBack = get('op-ch03-far-back-f0'), midTurn = get('op-ch03-mid-turn-f0'), midStep = get('op-ch03-mid-step-f0'), midStop = get('op-ch03-mid-stop-f0');
  const faceDown = [get('op-bg06-head-down-dark'), get('op-bg06-head-down-lit')], faceUp = [get('op-bg06-head-up-dark'), get('op-bg06-head-up-lit')];
  const ship17 = [get('op-bg07-ship-dark'), get('op-bg07-ship-flash')];
  const shadows = ['deck', 'porthole', 'hatch'].map(k => [get(`op-bg07-shadow-${k}-dark-f0`), get(`op-bg07-shadow-${k}-flash-f0`)]);
  const lunge = get('op-ch03-lunge-f0'), torch = [get('op-fx-flashlight-f0'), get('op-fx-flashlight-f1')], splash = [get('op-fx-splash-f0'), get('op-fx-splash-f1')];
  const floodSky = get('op-bg08-sky-day'), floodCity = get('op-bg08-city-day'), floodWater = get('op-bg08-water-day');
  const streetPlate = get('op-bg09-street-day'), streetWater = get('op-bg09-water-day'), crowdStand = get('op-bg09-crowd-stand-f0'), crowdSit = get('op-bg09-crowd-sit-f0');
  const daySky = get('op-bg03-harbor-sky-day'), dayMid = get('op-bg03-harbor-mid-day'), dayBreakwater = get('op-bg03-harbor-breakwater-day');
  const dayNear = get('op-bg03-harbor-near-day'), dayShip = get('op-sp01-ship-day');
  const room = get('op-bg10-room-night'), roomCloth = get('op-bg10-cloth-night'), crouch = get('op-ch04-crouch-night-f0');
  const gapStreet = get('op-bg11-street-night'), gapMask = get('op-bg11-cloth-mask-night'), drag = get('op-bg11-drag-f0');
  const looter = [get('op-bg11-looter-f0'), get('op-bg11-looter-f1')], fight = [get('op-bg11-fight-f0'), get('op-bg11-fight-f1'), get('op-bg11-fallen-f0')];
  const bottleFrames = [get('op-bg12-bottle-f0'), get('op-bg12-bottle-f1')], climb = get('op-ch04-climb-f0');
  const closePlate = get('op-bg13b-sky-city-night'), closeNear = get('op-bg13b-hero-tank-near');
  const lanePlate = get('op-bg14-lane-day'), laneWater = get('op-bg14-water-day'), wade = [get('op-ch04-wade-f0'), get('op-ch04-wade-f1')];

  // Effect colours are picked from the plates' own palette, never added.
  const ink = {
    rainFar: pal.nearest('#34505c'), rainNear: pal.nearest('#7d98a2'), rainLit: pal.nearest('#d9cdb0'), splash: pal.nearest('#a9bec2'),
    mote: pal.nearest('#e2d6b8'), boltCore: pal.nearest('#f2f4ee'), boltGlow: pal.nearest('#9fb8c8'), mistSea: pal.nearest('#263942'),
    mistCity: pal.nearest('#1c2c35'), drip: pal.nearest('#c9d2d0'), screenBg: pal.nearest('#16232c'), screenBar: pal.nearest('#3f6f73'),
    screenText: pal.nearest('#e8e2cf'), screenDim: pal.nearest('#7d8f93'), screenWarm: pal.nearest('#c9a65e'), screenCard: pal.nearest('#25404a'),
    screenThumb: pal.nearest('#3b5653'), screenShape: pal.nearest('#8f9a8a'), ripple: pal.nearest('#c5cacc'),
  };
  const lutMid = pal.lut(shade(0.5)), lutHot = pal.lut(warmLift(0.07));
  const lutDark = pal.lut(c => [c[0] * 0.3, c[1] * 0.3 - 0.004, c[2] * 0.3 - 0.016]);
  // Sol's tone for people standing in the dark shed (export-batch2.py, kind 'human').
  const lutHuman = pal.lutRgb(([r, g, b]) => [r * 0.62 + 2, g * 0.62 + 5, b * 0.62 + 8]);
  const versions = (lit: Indexed, dark?: Indexed, mid = lutMid): Versions => [dark ?? mapped(lit, lutDark), mapped(lit, mid), lit, mapped(lit, lutHot)];
  // The mudflat (A10) sits at the mid level outside the beams, so its mid level is a lighter shade.
  const lutMudflat = pal.lut(shade(0.72));
  const person = (id: string, img: Indexed): Person => ({ img, dark: mapped(img, lutHuman), at: placed(id) });

  // Water drops on the glass stay over the screen content: the bright pixels of the phone plate inside the glass.
  const keep: number[] = [];
  const [qx0, qx1] = [Math.min(...SCREEN_QUAD.map(p => p[0])), Math.max(...SCREEN_QUAD.map(p => p[0]))];
  const [qy0, qy1] = [Math.min(...SCREEN_QUAD.map(p => p[1])), Math.max(...SCREEN_QUAD.map(p => p[1]))];
  for (let y = qy0; y <= qy1; y++) for (let x = qx0; x <= qx1; x++) {
    const v = phoneBody.px[y * phoneBody.w + x]; if (v === CLEAR) continue;
    if (pal.lab[v][0] > 0.62) keep.push(y * W + x, v);
  }

  // Water glints: bright bluish or grey colours only, so sand, wood and rust never twinkle.
  const water = (v: number) => pal.lab[v][2] < 0.005;
  const glintsOf = (src: Indexed, y0: number, share: number) => pixelsIn(src, brightest(src, pal, y0, H, share, water), y0, H);
  // C05's backdrop is r2's roof at camera x=320 with the glow's first frame baked in (Sol). The flicker patches in the
  // second frame where the city does not cover it, and the sky where only the first frame had light.
  const glowWorld = placed('op-bg13-glow-f0'), closeGlowAt: Point = [glowWorld[0] - 320, glowWorld[1]];
  const glowLit = { w: glow[1].w, h: glow[1].h, px: new Uint8Array(glow[1].w * glow[1].h) };
  for (let y = 0; y < glowLit.h; y++) for (let x = 0; x < glowLit.w; x++) {
    const sx = closeGlowAt[0] + x, sy = closeGlowAt[1] + y, wx = sx + 320;
    let v = closePlate.px[sy * closePlate.w + sx];
    if (roofMid.px[sy * roofMid.w + wx] === CLEAR) {
      const lit = glow[1].px[y * glow[1].w + x], base = x < glow[0].w && y < glow[0].h ? glow[0].px[y * glow[0].w + x] : CLEAR;
      if (lit !== CLEAR) v = lit; else if (base !== CLEAR) v = roofSky.px[sy * roofSky.w + wx];
    }
    glowLit.px[y * glowLit.w + x] = v;
  }
  const wadeAt = placed('op-ch04-wade-f0'), wadeAnchor = OPENING_ASSET_META['op-ch04-wade-f0'].anchor ?? [24, 60];

  return {
    pal, frame: new Frame(), image: new ImageData(W, H),
    lut: { flash: pal.lut(flashLift(0.2)), flashSoft: pal.lut(flashLift(0.09)), glint: pal.lut(flashLift(0.1)), fade: pal.lut(shade(0.45)), black: pal.lut(() => [0, 0, 0]) },
    ink,
    phone: {
      hand, body: phoneBody, quad: SCREEN_QUAD, keep: Int32Array.from(keep),
      screen: { w: SCREEN_W, h: SCREEN_H, px: new Uint8Array(SCREEN_W * SCREEN_H) },
      clock: { news: textMask('02:51', 48, 16), videos: textMask('02:53', 48, 16) }, news: textMask('新闻', 32, 16),
    },
    shed: {
      far: shedFar, shelter, eave, wangFlash, phoneFx, phoneAt: placed('op-fx-phone-f0'),
      pose: Object.fromEntries(poses.map(([id, img]) => [id.replace(/^op-ch0\d-|-f0$/g, '') + (id.startsWith('op-ch01') ? '@zhang' : '@wang'), person(id, img)])),
    },
    harbor: {
      sky: harborSky, mid: harborMid, breakwater, near: harborNear, shipDark, shipFlash,
      glints: pixelsIn(harborMid, brightest(harborMid, pal, 215, 360, 0.06), 215, 360), tops: columnTops(harborNear),
    },
    beach: {
      far: versions(beachFar[1], beachFar[0], lutMudflat), near: versions(beachNear[1], beachNear[0], lutMudflat),
      walkers: [person('op-ch01-far-walk-f0', walkers[0]), person('op-ch02-far-walk-f0', walkers[1])],
    },
    bow: versions(bow[1], bow[0]),
    hatch: {
      plate: versions(hatchLit, hatchDark), crew: crew.map(c => versions(c)), crewAt: placed('op-ch03-near-f0'),
      farBack: versions(farBack), farAt: placed('op-ch03-far-back-f0'),
      mid: { turn: versions(midTurn), step: versions(midStep), stop: versions(midStop) }, midAt: placed('op-ch03-mid-turn-f0'),
    },
    face: { down: versions(faceDown[1], faceDown[0]), up: versions(faceUp[1], faceUp[0]) },
    ship: {
      plate: versions(ship17[1], ship17[0]), flash: ship17[1], shadows: shadows.map(([dark, lit]) => versions(lit, dark)), shadowsFlash: shadows.map(s => s[1]),
      lunge: versions(lunge, mapped(lunge, lutHuman)), torch, torchAt: placed('op-fx-flashlight-f0'), splash, splashAt: placed('op-fx-splash-f0'),
    },
    roof: {
      sky: roofSky, mid: roofMid, near: roofNear, glow, you, glints: pixelsIn(roofMid, brightest(roofMid, pal, 236, 360, 0.04), 236, 360),
      glowAt: placed('op-bg13-glow-f0'), youAt: placed('op-ch04-sit-f0'), climb, climbAt: placed('op-ch04-climb-f0'),
    },
    flood: { sky: floodSky, city: floodCity, water: floodWater, glints: glintsOf(floodWater, 150, 0.05) },
    street: {
      plate: streetPlate, water: streetWater, stand: crowdStand, sit: crowdSit, standAt: placed('op-bg09-crowd-stand-f0'), sitAt: placed('op-bg09-crowd-sit-f0'),
      glints: glintsOf(streetWater, 200, 0.05),
    },
    dayHarbor: { sky: daySky, mid: dayMid, breakwater: dayBreakwater, near: dayNear, ship: dayShip, shipAt: placed('op-sp01-ship-day'), glints: glintsOf(dayMid, 215, 0.05) },
    hiding: { room, cloth: roomCloth, you: crouch, youAt: placed('op-ch04-crouch-night-f0') },
    gap: {
      street: gapStreet, mask: gapMask, looter, looterAt: placed('op-bg11-looter-f0'), fight, fightAt: placed('op-bg11-fight-f0'),
      drag, dragAt: placed('op-bg11-drag-f0'),
    },
    bottles: bottleFrames,
    close: { plate: closePlate, near: closeNear, glowLit, glowAt: closeGlowAt, glints: pixelsIn(closePlate, brightest(closePlate, pal, 236, 360, 0.04), 236, 360) },
    lane: { plate: lanePlate, water: laneWater, wade, at: wadeAt, foot: [wadeAt[0] + wadeAnchor[0], wadeAt[1] + wadeAnchor[1]], glints: glintsOf(laneWater, 240, 0.05) },
  };
}

interface Look { calm: boolean; flash: number }
interface Beam { x: number; y: number; rx: number; ry: number; hot: number }

/**
 * Light from torch beams on 4x4 blocks aligned with the dither cells. Levels for four versions: 0 dark, 1/3 mid,
 * 2/3 lit (the plateau inside a beam), 1 warm hot spot at a beam's centre; Frame.blitLit dithers per art pixel.
 */
function beamField(f: Frame, beams: readonly Beam[], ambient = 0): void {
  const L = f.light;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    let v = ambient;
    for (const b of beams) {
      const dx = (x + 2 - b.x) / b.rx, dy = (y + 2 - b.y) / b.ry, d2 = dx * dx + dy * dy;
      if (d2 >= 1.2544) continue;
      const d = Math.sqrt(d2);
      const edge = Math.min(1, (1.12 - d) * 7), core = Math.min(1, Math.max(0, (0.5 - d) * 3.5)) * b.hot;
      const l = (edge * 2 + core) / 3;
      if (l > v) v = l;
    }
    for (let r = 0, i = y * W + x; r < 4; r++, i += W) { L[i] = L[i + 1] = L[i + 2] = L[i + 3] = v; }
  }
}
/** Two hand-held torches aimed at one spot, flickering and trembling. */
function torchField(f: Frame, t: number, cx: number, cy: number, rx: number, ry: number, tremble: number, power: number, calm: boolean): void {
  beamField(f, [0, 1].map(k => {
    const jx = calm ? 0 : (noise1(t / 170, 11 + k) - 0.5) * 2 * tremble, jy = calm ? 0 : (noise1(t / 210, 21 + k) - 0.5) * 2 * tremble;
    const flicker = calm ? 1 : 0.8 + 0.2 * noise1(t / 55, 31 + k);
    return { x: cx + (k ? 26 : -22) + jx, y: cy + (k ? 8 : -6) + jy, rx: rx * (k ? 0.86 : 1), ry: ry * (k ? 0.86 : 1), hot: power * flicker };
  }));
}
function strikeBolt(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look, x: number, top: number, bottom: number): void {
  const strike = (shot.flashes ?? []).findIndex(at => t >= at && t < at + 220);
  if (o.flash >= 1 && strike >= 0) bolt(f, x + strike * 70, top, bottom, 77 + strike + shot.start, a.ink.boltCore, a.ink.boltGlow);
}

// --- Part one ---------------------------------------------------------------------------------------------------

/** What the phone shows: the news flash (A02) or the two short videos scrolling by (A04). No fake words. */
function screen(a: Prepared, kind: 'news' | 'videos', t: number, calm: boolean): Indexed {
  const s = a.phone.screen, k = a.ink, w = s.w;
  const rect = (x: number, y: number, rw: number, rh: number, c: number) => {
    for (let yy = Math.max(0, y); yy < Math.min(s.h, y + rh); yy++) s.px.fill(c, yy * w + Math.max(0, x), yy * w + Math.min(w, x + rw));
  };
  const stamp = (mask: Uint8Array, mw: number, x: number, y: number, c: number) => {
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const xx = x + (i % mw), yy = y + Math.floor(i / mw); if (xx < w && yy < s.h) s.px[yy * w + xx] = c; }
  };
  s.px.fill(k.screenBg);
  stamp(a.phone.clock[kind], 48, 6, 3, k.screenDim);
  rect(w - 16, 7, 10, 6, k.screenDim);
  if (kind === 'news') {
    rect(0, 22, w, 18, k.screenBar); stamp(a.phone.news, 32, 6, 23, k.screenText);
    rect(4, 44, w - 8, 76, k.screenCard);
    rect(42, 62, 26, 24, k.screenShape); rect(32, 86, 46, 34, k.screenThumb);
    rect(4, 124, w - 8, 14, k.screenWarm);
    const scroll = calm ? 0 : Math.floor(t * 0.03) % 40;
    for (let x = -40 + (40 - scroll); x < w; x += 20) rect(x, 129, 12, 4, k.screenBg);
    for (let row = 0; row < 3; row++) rect(6, 148 + row * 14, w - 30 - row * 18, 5, k.screenDim);
  } else {
    const off = calm ? 0 : Math.round(ease(t / 2600) * 96);
    for (let i = 0; i < 3; i++) {
      const y = 24 + i * 96 - off;
      rect(4, y, w - 8, 88, k.screenCard); rect(10, y + 6, w - 20, 52, k.screenThumb);
      if (i === 1) { rect(36, y + 24, 30, 12, k.screenShape); rect(30, y + 28, 6, 4, k.screenShape); rect(66, y + 22, 8, 16, k.screenShape); }
      rect(10, y + 64, w - 40, 5, k.screenText); rect(10, y + 74, w - 60, 5, k.screenDim);
    }
  }
  return s;
}
function phone(f: Frame, a: Prepared, kind: 'news' | 'videos', t: number, o: Look): void {
  f.copy(a.phone.hand, 0, 0);
  f.blit(a.phone.body, 0, 0);
  f.quad(screen(a, kind, t, o.calm), a.phone.quad, a.phone.keep);
}

/** A03-A09 under the loading shed: rain only outside, people darkened like Sol's previews until lightning shows them. */
function shed(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const s = a.shed, p = t / shot.ms, beat = shot.beat ?? 'sitting', lit = o.flash > 0 ? 1 : 0;
  f.copy(s.far[lit], 0, 0);
  strikeBolt(f, a, shot, t, o, 470, 18, 165);
  rain(f, t, { far: 130, near: 30, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, wind: 14, seed: 21 }, o.calm);
  f.blit(s.shelter[lit], 0, 0);
  const zhang = ({ sitting: 'sit', appear: 'startled', pickup: 'pickup', look: 'look', call: 'raincoat' } as Record<string, string>)[beat];
  const wang = ({ appear: 'stand', pickup: 'approach', look: 'lookback', call: 'phone' } as Record<string, string>)[beat];
  const draw = (who: Person | undefined, flashImg?: Indexed) => { if (who) f.blit(lit ? flashImg ?? who.img : who.dark, who.at[0], who.at[1]); };
  if (beat === 'appear' && t >= 500) f.blit(s.phoneFx[t < 760 ? 0 : 1], s.phoneAt[0], s.phoneAt[1]);
  if (beat === 'pickup' && p < 0.35) f.blit(s.phoneFx[1], s.phoneAt[0], s.phoneAt[1]);
  draw(s.pose[`${zhang}@zhang`]);
  if (wang) draw(s.pose[`${wang}@wang`], wang === 'stand' ? s.wangFlash : undefined);
  f.blit(s.eave[lit], 0, 0);
}

/** A08: the unlit freighter drifts in from the right behind the breakwater; ship [720,108] to [220,108], camera x=320 to 0 (Sol r2). */
function harbor(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const h = a.harbor, p = t / shot.ms;
  const drift = ease(p / 0.85), shipX = 720 - drift * 500, cam = o.calm ? 0 : Math.round(0.64 * (shipX - 220));
  const grounded = p > 0.85, bob = o.calm || grounded ? 0 : Math.round(Math.sin(t / 650) * 1.2);
  const settle = grounded ? Math.round(ease((p - 0.85) / 0.08) * 2) : 0;
  f.copy(h.sky, -Math.round(cam * 0.6), 0);
  f.blit(h.mid, -cam, 0);
  shimmer(f, t, h.glints, -cam, 0, a.lut.glint, 0.07, o.calm);
  f.blit(o.flash > 0 ? h.shipFlash : h.shipDark, Math.round(shipX) - cam, 108 + bob + settle);
  f.blit(h.breakwater, -cam, 0);
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

/** A10: down the breakwater onto the mudflat; the camera pans toward the ship, the torches light the mud ahead. */
function beach(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const b = a.beach, p = t / shot.ms, cam = o.calm ? 160 : Math.round(ease(p) * 320);
  const slide = o.calm ? 0 : Math.round(ease(p) * 28), bob = o.calm ? 0 : Math.floor(t / 280) % 2;
  beamField(f, b.walkers.map((w, k) => {
    const jx = o.calm ? 0 : (noise1(t / 150, 41 + k) - 0.5) * 6;
    return { x: w.at[0] + slide - cam + 92 + k * 16 + jx, y: w.at[1] + 66, rx: 140, ry: 40, hot: 0.9 };
  }), 1 / 3);
  f.blitLit(b.far, -cam, 0);
  f.blitLit(b.near, -cam, 0);
  for (const w of b.walkers) f.blit(w.dark, w.at[0] + slide - cam, w.at[1] + bob);
  rain(f, t, { far: 170, near: 60, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, litColour: a.ink.rainLit, wind: 16, seed: 31 }, o.calm);
}

/** A11, first half: the beam sweeps along the bow until 远汐 shows. */
function bowSweep(f: Frame, a: Prepared, t: number, span: number, o: Look): void {
  const p = t / span;
  torchField(f, t, 120 + ease(p / 0.85) * 210, 165, 175, 150, 2, 1, o.calm);
  f.blitLit(a.bow, 0, 0);
  rain(f, t, { far: 70, near: 24, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, litColour: a.ink.rainLit, wind: 10, seed: 13 }, o.calm);
}

/** A11-A15 at the open hatch, lit by the two torches: far figure, then turning, stepping and stopping, then the near frames. */
function hatch(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const h = a.hatch, p = t / shot.ms, beat = shot.scene === 'bow' ? 'far' : shot.scene === 'hatch-near' ? 'near' : shot.scene === 'retreat' ? 'retreat' : shot.beat ?? 'shout';
  const back = beat === 'retreat' ? ease(p) : 0;
  const aim = beat === 'near' ? { x: 352, y: 150, r: 205 + ease(p / 0.5) * 35, shake: 3 + 2 * p }
    : beat === 'retreat' ? { x: 352 - back * 30, y: 170 + back * 20, r: 215 - back * 70, shake: 6 }
    : beat === 'far' ? { x: 330, y: 170, r: 190, shake: 1.5 }
    : { x: 344, y: 165, r: 215, shake: beat === 'turn' ? 2.5 : 1.5 };
  torchField(f, t, aim.x, aim.y, aim.r * 1.12, aim.r, aim.shake, 1 - back * 0.25, o.calm);
  f.blitLit(h.plate, 0, 0);
  if (beat === 'near') {
    const frame = !o.calm && Math.floor(t / 430 + noise1(t / 900, 4) * 0.6) % 2 ? 1 : 0;
    const lurch = o.calm ? 0 : Math.round(Math.max(0, Math.sin(t / 430 * Math.PI)) * 2);
    f.blitLit(h.crew[frame], h.crewAt[0], h.crewAt[1] + lurch);
  } else if (beat === 'far' || beat === 'shout') {
    f.blitLit(h.farBack, h.farAt[0], h.farAt[1]);
  } else {
    const pose = beat === 'retreat' ? h.mid.stop : p < 0.35 ? h.mid.turn : h.mid.step;
    f.blitLit(pose, h.midAt[0], h.midAt[1]);
  }
  // Salt dust in the beam and drips from the frame above the hatch.
  motes(f, t, 46, a.ink.mote, { x: 150, y: 20, w: 420, h: 260 }, 61, o.calm);
  if (!o.calm) for (let k = 0; k < 4; k++) {
    const period = 900 + k * 170, at = (t + k * 333) % period, x = 262 + k * 41 + Math.round(hash(k, 9) * 20), y = 18 + at * 0.32;
    if (y < 300 && f.light[Math.round(y) * W + x] > 0.3) { f.put(x, y, a.ink.drip); f.put(x, y + 1, a.ink.drip); }
  }
  rain(f, t, { far: 60, near: 26, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, litColour: a.ink.rainLit, wind: 10, seed: 9 }, o.calm);
}

/** A16: the head lifts into the torchlight; the hands holding the torches shake harder once the eyes show. */
function face(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const up = t / shot.ms >= 0.45;
  torchField(f, t, 320, 140, 300, 250, up ? 6 : 3, 1, o.calm);
  f.blitLit(up ? a.face.up : a.face.down, 0, 0);
  motes(f, t, 30, a.ink.mote, { x: 120, y: 10, w: 400, h: 260 }, 71, o.calm);
}

/** Where the torches point in A17: along the deck to a porthole and the hatch as the shadows rise, then at the lunge. */
const SHIP_AIM: [number, number, number][] = [[0, 200, 190], [0.1, 231, 175], [0.2, 428, 227], [0.3, 340, 220], [0.45, 320, 200], [0.7, 320, 210]];
function aimAt(p: number): [number, number] {
  let k = 0; while (k < SHIP_AIM.length - 2 && p >= SHIP_AIM[k + 1][0]) k++;
  const [p0, x0, y0] = SHIP_AIM[k], [p1, x1, y1] = SHIP_AIM[k + 1], u = ease((p - p0) / (p1 - p0));
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
}

/** A17: the torches sweep the ship while shadows rise at the deck, a porthole and the hatch; it lunges; the torch drops. */
function shipFull(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const s = a.ship, p = t / shot.ms;
  if (p >= 0.9) { f.fill(a.lut.black[0]); return; }
  const [ax, ay] = aimAt(Math.min(p, 0.72)), drop = ease((p - 0.72) / 0.1);
  // Lightning lights everything; otherwise the torches do, until the one that falls swings down and goes out.
  if (o.flash > 0) f.light.fill(2 / 3);
  else torchField(f, t, ax, ay + drop * 160, 150 * (1 - drop * 0.6), 120 * (1 - drop * 0.6), p > 0.45 ? 7 : 3, 1, o.calm);
  f.blitLit(s.plate, 0, 0);
  strikeBolt(f, a, shot, t, o, 520, 0, 120);
  s.shadows.forEach((shadow, k) => { if (p >= 0.1 + k * 0.1) f.blitLit(shadow, 0, 0); });
  rain(f, t, { far: 150, near: 50, farColour: a.ink.rainFar, nearColour: a.ink.rainNear, litColour: a.ink.rainLit, wind: 16, seed: 41 }, o.calm);
  if (p >= 0.45 && p < 0.8) {
    const rise = ease((p - 0.45) / 0.18), y = Math.round((1 - rise) * 90 + (o.calm ? 0 : Math.sin(t / 60) * rise));
    f.blitLit(s.lunge, 0, y);
  }
  if (p >= 0.72 && p < 0.82) f.blit(s.torch[0], s.torchAt[0], s.torchAt[1] + Math.round(ease((p - 0.72) / 0.1) * 18));
  if (p >= 0.8 && p < 0.9) f.blit(s.splash[p < 0.85 ? 0 : 1], s.splashAt[0], s.splashAt[1]);
  if (p >= 0.82 && p < 0.9) f.blit(s.torch[1], s.torchAt[0], s.torchAt[1] + 18);
  // The light goes out with the torch.
  if (p >= 0.84) f.mapDithered(null, a.lut.black, Math.min(1, (p - 0.84) / 0.05));
}

// --- Part two ---------------------------------------------------------------------------------------------------

/** B02: the low town under grey daylight, the roads out under water; the water glints. */
function flood(f: Frame, a: Prepared, t: number, o: Look): void {
  const s = a.flood;
  f.copy(s.sky, 0, 0);
  f.blit(s.city, 0, 0);
  f.blit(s.water, 0, 0);
  shimmer(f, t, s.glints, 0, 0, a.lut.glint, 0.06, o.calm);
}

/** B03: salt lines on the walls, people crowded on a roof and at the bridgehead; the water glints. */
function street(f: Frame, a: Prepared, t: number, o: Look): void {
  const s = a.street;
  f.copy(s.plate, 0, 0);
  f.blit(s.stand, s.standAt[0], s.standAt[1]);
  f.blit(s.sit, s.sitAt[0], s.sitAt[1]);
  f.blit(s.water, 0, 0);
  shimmer(f, t, s.glints, 0, 0, a.lut.glint, 0.06, o.calm);
}

/** B04: the same harbour by day, the ship aground where A08 left it; the camera drifts back to A08's last framing. */
function dayHarbor(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const d = a.dayHarbor, cam = o.calm ? 0 : Math.round((1 - ease(t / shot.ms)) * 160);
  f.copy(d.sky, -Math.round(cam * 0.6), 0);
  f.blit(d.mid, -cam, 0);
  shimmer(f, t, d.glints, -cam, 0, a.lut.glint, 0.05, o.calm);
  f.blit(d.ship, d.shipAt[0] - cam, d.shipAt[1]);
  f.blit(d.breakwater, -cam, 0);
  f.blit(d.near, -cam, 0);
}

// --- Part three -------------------------------------------------------------------------------------------------

/** C01: crouched by the bagged-up window of the unfinished building, a hand at the gap. */
function hiding(f: Frame, a: Prepared): void {
  const h = a.hiding;
  f.copy(h.room, 0, 0);
  f.blit(h.you, h.youAt[0], h.youAt[1]);
  f.blit(h.cloth, 0, 0);
}

/** When the two in C02 change holds, until one goes down at 3 s and stays down. */
const FIGHT_HOLDS = [450, 800, 1300, 1650, 2150, 2600];
/** C02 through the gap: a looter at the smashed shutter makes off with a bag, two fight over one until one stays down, a hunched figure drags something away up the flooded lane. Light rain. */
function throughGap(f: Frame, a: Prepared, t: number, o: Look): void {
  const g = a.gap, carry = t >= 2400;
  f.copy(g.street, 0, 0);
  const slide = carry && !o.calm ? Math.round(Math.min(1, (t - 2400) / 3600) * 8) : 0;
  f.blit(g.looter[carry ? 1 : 0], g.looterAt[0] + slide, g.looterAt[1]);
  const pose = t >= 3000 ? 2 : o.calm ? (t < 1500 ? 0 : 1) : FIGHT_HOLDS.filter(at => t >= at).length % 2;
  f.blit(g.fight[pose], g.fightAt[0], g.fightAt[1]);
  const away = o.calm ? 0 : t / 6000;
  f.blit(g.drag, g.dragAt[0] + Math.round(away * 2), g.dragAt[1] - Math.round(away * 8));
  rain(f, t, { far: 46, near: 0, farColour: a.ink.rainFar, nearColour: a.ink.rainFar, wind: 6, seed: 51 }, o.calm);
  f.blit(g.mask, 0, 0);
}

/** C03: the row of empty bottles; the last one is crushed on the cue. */
function bottles(f: Frame, a: Prepared, shot: TimedShot, t: number): void {
  const crush = shot.cues?.find(c => c.cue === 'crush')?.at ?? 2200;
  f.copy(a.bottles[t < crush ? 0 : 1], 0, 0);
}

/** C04: from the water tank to the light in the south-west; the near roof slides a little faster than the city. */
function roof(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const r = a.roof, p = t / shot.ms;
  const cam = o.calm ? (p < 0.5 ? 0 : 320) : Math.round(ease((p - 0.22) / 0.78) * 320);
  f.copy(r.sky, -cam, 0);
  const lit = !o.calm && noise1(t / 260, 3) > 0.62 ? 1 : 0;
  f.blit(r.glow[lit], r.glowAt[0] - cam, r.glowAt[1]);
  mist(f, t, 226, 258, a.ink.mistCity, 0.55, 0.05, o.calm);
  f.blit(r.mid, -cam, 0);
  shimmer(f, t, r.glints, -cam, 0, a.lut.glint, 0.05, o.calm);
  const near = Math.round(cam * 1.15);
  f.blit(r.near, -near, 0);
  // Up the ladder a rung at a time, then sitting on the tank as the camera starts to move.
  if (p < 0.2) f.blit(r.climb, r.climbAt[0] - near, r.climbAt[1] - (o.calm ? 0 : Math.min(2, Math.floor(p / 0.07)) * 2));
  else f.blit(r.you, r.youAt[0] - near, r.youAt[1]);
}

/** C05: close on you sitting on the tank, watching the light; it flickers as in C04 and the far water glints. */
function closeOnTank(f: Frame, a: Prepared, t: number, o: Look): void {
  const c = a.close;
  f.copy(c.plate, 0, 0);
  if (!o.calm && noise1(t / 260, 3) > 0.62) f.copy(c.glowLit, c.glowAt[0], c.glowAt[1]);
  shimmer(f, t, c.glints, 0, 0, a.lut.glint, 0.05, o.calm);
  f.blit(c.near, 0, 0);
}

/** A ring spreading on the water from a step: the front half of a flat ellipse, thinning as it fades. */
function ripple(f: Frame, x: number, y: number, age: number, colour: number): void {
  if (age < 0 || age > 900) return;
  const u = age / 900, rx = 4 + u * 16, ry = 1 + u * 3, n = Math.round(rx * 2.4);
  for (let k = 0; k <= n; k++) {
    if (u > 0.45 && (k + Math.floor(age / 120)) % 2) continue;
    const th = (k / n) * Math.PI;
    f.put(Math.round(x + Math.cos(th) * rx), Math.round(y + Math.sin(th) * ry), colour);
  }
}

/** C06: first light in a flooded lane; you wade off toward the glow, one key pose per step, a ripple at each. */
function lane(f: Frame, a: Prepared, shot: TimedShot, t: number, o: Look): void {
  const l = a.lane, steps = (shot.cues ?? []).filter(c => c.cue === 'wade').map(c => c.at);
  const n = steps.filter(at => t >= at).length;
  f.copy(l.plate, 0, 0);
  f.blit(l.wade[n % 2], l.at[0], l.at[1]);
  f.blit(l.water, 0, 0);
  shimmer(f, t, l.glints, 0, 0, a.lut.glint, 0.05, o.calm);
  // The water line at the knees (Sol: y=240 here).
  if (!o.calm && n > 0) ripple(f, l.foot[0], 240, t - steps[n - 1], a.ink.ripple);
}

const PAINTED = new Set([
  'phone-news', 'phone-videos', 'shed', 'harbor', 'beach', 'bow', 'hatch', 'hatch-near', 'retreat', 'face', 'ship-full',
  'flood', 'street', 'ship-day', 'shelter', 'gap', 'bottles', 'roof', 'roof-sit', 'lane',
]);

/** Paint a painted shot; returns false when the shot has no plates yet. */
export function paintPlates(g: CanvasRenderingContext2D, a: Prepared, shot: TimedShot, t: number, calm: boolean, flash: number): boolean {
  if (!PAINTED.has(shot.scene)) return false;
  const f = a.frame, o: Look = { calm, flash };
  switch (shot.scene) {
    case 'phone-news': phone(f, a, 'news', t, o); break;
    case 'phone-videos': phone(f, a, 'videos', t, o); break;
    case 'shed': shed(f, a, shot, t, o); break;
    case 'harbor': harbor(f, a, shot, t, o); break;
    case 'beach': beach(f, a, shot, t, o); break;
    // A11 opens on the bow and cuts into the hatch for the far figure.
    case 'bow': if (t < shot.ms * 0.48) bowSweep(f, a, t, shot.ms * 0.48, o); else hatch(f, a, shot, t, o); break;
    case 'face': face(f, a, shot, t, o); break;
    case 'ship-full': shipFull(f, a, shot, t, o); break;
    case 'flood': flood(f, a, t, o); break;
    case 'street': street(f, a, t, o); break;
    case 'ship-day': dayHarbor(f, a, shot, t, o); break;
    case 'shelter': hiding(f, a); break;
    case 'gap': throughGap(f, a, t, o); break;
    case 'bottles': bottles(f, a, shot, t); break;
    case 'roof': roof(f, a, shot, t, o); break;
    case 'roof-sit': closeOnTank(f, a, t, o); break;
    case 'lane': lane(f, a, shot, t, o); break;
    default: hatch(f, a, shot, t, o);
  }
  // Fade up from black through the palette, in dithered steps.
  if (shot.fadeIn && t < 500) f.mapDithered(null, a.lut.fade, 1 - t / 500);
  f.present(g, a.image, a.pal);
  return true;
}
