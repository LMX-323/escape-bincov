/**
 * P0 animatic painter: every shot as flat colour blocks and silhouettes on the 640x360 art grid, so the cut can be
 * timed in the browser before the real art existed. Sol's plates (scenes.ts) now paint every shot; these are the
 * fallback when the plates cannot load. paint(ctx, shot, t, options) fills the whole canvas for shot-local time t.
 */
import type { TimedShot } from './timeline';
import { paintPlates, type Prepared } from './scenes';

export const W = 640, H = 360;
type G = CanvasRenderingContext2D;
export interface PaintOptions { calm: boolean; plates?: Prepared | null }

const K = {
  black: '#000000', sky0: '#05090b', sky1: '#0a1317', sky2: '#111e24', sea0: '#08121a', sea1: '#0d1b22', foam: '#28404a',
  ground: '#0c1113', concrete: '#1b2326', concreteL: '#273235', roof: '#141b1e', roofL: '#1f292d', post: '#10171a',
  boxA: '#22343a', boxB: '#352b26', boxAL: '#2c4249', boxBL: '#43362f', rain: '#3d5864', lamp: '#c9a65e', lampD: '#6e5530',
  hull: '#0b1417', hullL: '#141f23', rust: '#7c6c5c', rustL: '#9a8b78', rustD: '#4d4038', torch: '#d8cfb2', torchD: '#8f866f',
  crystal: '#b8ae98', crystalL: '#d2cbb6', flesh: '#4a3836', fleshL: '#5f4541', eye: '#c8574a', blood: '#4e2a26', teeth: '#cfc6b0',
  zhang: '#2d4153', zhangL: '#3b5469', wang: '#28362b', wangL: '#36483a', you: '#5d6148', youL: '#727759', pack: '#75634e',
  skin: '#8c7262', hair: '#16130f', screen: '#1d3442', screenL: '#3f6f73', glow: '#a7c4c0',
  dawn0: '#59656a', dawn1: '#7b878a', water: '#3e4b4c', waterL: '#56645f', wall: '#2b302f', wallL: '#3a403e', salt: '#a3946a',
  day0: '#8a9496', day1: '#a7aeac', sand: '#c4bba3', sea: '#56676b', bag: '#8e8a78', bagL: '#a8a491', bagD: '#5c5a4e', bottle: '#7f9599',
  scav: '#6b5443', mask: '#8c4a3a', warm: '#e0b25e', warmL: '#f2d38c',
};

const R = Math.round;
function rect(g: G, c: string, x: number, y: number, w: number, h: number) { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); }
function poly(g: G, c: string, pts: number[]) {
  g.fillStyle = c; g.beginPath(); g.moveTo(R(pts[0]), R(pts[1]));
  for (let i = 2; i < pts.length; i += 2) g.lineTo(R(pts[i]), R(pts[i + 1]));
  g.closePath(); g.fill();
}
function bands(g: G, colours: string[], y0: number, y1: number, x = 0, w = W) {
  const h = (y1 - y0) / colours.length;
  colours.forEach((c, i) => rect(g, c, x, y0 + i * h, w, h + 1));
}
/** Stable pseudo-random numbers, so placements do not flicker between frames. */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const ease = (p: number) => p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p);
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

type Pose = 'stand' | 'walk' | 'sit' | 'crouch' | 'arms-up' | 'phone' | 'back';
/** A standing figure of height h with its feet at (x, y): head, torso, legs and arms as blocks. */
function person(g: G, x: number, y: number, h: number, coat: string, coatL: string, pose: Pose = 'stand', phase = 0, face = 1) {
  const u = h / 10, head = u * 1.6, sit = pose === 'sit' || pose === 'crouch';
  const legH = sit ? u * 2.2 : u * 4.4, torsoH = u * 3.6, top = y - legH - torsoH - head;
  const step = pose === 'walk' ? Math.sin(phase) * u * 0.9 : 0;
  // Legs.
  if (pose === 'sit') { rect(g, '#1d1e1c', x - u * 1.3, y - legH, u * 2.6, legH); rect(g, '#1d1e1c', x + face * u * 1.2 - u * 0.6, y - u, u * 1.4, u); }
  else if (pose === 'crouch') { rect(g, '#1d1e1c', x - u * 1.4, y - legH, u * 2.8, legH); }
  else { rect(g, '#1d1e1c', x - u * 1.1 + step, y - legH, u * 1, legH); rect(g, '#1d1e1c', x + u * 0.1 - step, y - legH, u * 1, legH); }
  // Torso, shaded on the lit side.
  const tx = x - u * 1.5 + (pose === 'crouch' ? face * u * 0.8 : 0), ty = y - legH - torsoH;
  rect(g, coat, tx, ty, u * 3, torsoH); rect(g, coatL, face > 0 ? tx + u * 2 : tx, ty, u, torsoH);
  // Head.
  const hx = x - head / 2 + (pose === 'crouch' ? face * u * 1.2 : 0), hy = pose === 'crouch' ? ty - head + u * 0.4 : top;
  rect(g, pose === 'back' ? K.hair : K.skin, hx, hy, head, head); rect(g, K.hair, hx, hy, head, head * 0.35);
  // Arms.
  if (pose === 'arms-up') { rect(g, coat, tx - u * 0.8, ty - u * 2, u * 0.9, u * 3); rect(g, coat, tx + u * 2.9, ty - u * 2, u * 0.9, u * 3); }
  else if (pose === 'phone') { rect(g, coat, tx + (face > 0 ? u * 2.4 : -u * 0.4), ty - u * 0.6, u * 0.9, u * 2); rect(g, K.glow, hx + (face > 0 ? head : -u * 0.5), hy + head * 0.4, u * 0.5, u * 0.8); }
  else { const swing = pose === 'walk' ? -step * 0.6 : 0; rect(g, coat, tx - u * 0.6 + swing, ty + u * 0.3, u * 0.8, u * 3); rect(g, coat, tx + u * 2.8 - swing, ty + u * 0.3, u * 0.8, u * 3); }
}
/** The salt-crusted crew member: hunched, swollen arms, white crystals; eyes only when it lifts its head. */
function creature(g: G, x: number, y: number, h: number, opts: { lit?: boolean; sway?: number; eyes?: boolean; dark?: string } = {}) {
  const u = h / 10, s = opts.sway ?? 0, body = opts.dark ?? (opts.lit ? K.fleshL : K.flesh), shade = opts.dark ?? K.flesh;
  rect(g, shade, x - u * 1.4 + s, y - u * 4, u * 1.1, u * 4); rect(g, shade, x + u * 0.3 + s, y - u * 4, u * 1.1, u * 4);
  poly(g, body, [x - u * 2.2 + s, y - u * 4, x + u * 2.2 + s, y - u * 4, x + u * 2.6 + s, y - u * 7.4, x + s, y - u * 8.6, x - u * 2.6 + s, y - u * 7.6]);
  rect(g, shade, x - u * 3.4 + s, y - u * 7.4, u * 1.4, u * 4.6); rect(g, shade, x + u * 2 + s, y - u * 7.4, u * 1.4, u * 4.6);
  rect(g, body, x - u * 1 + s * 1.3, y - u * 9.4, u * 2, u * 1.6);
  rect(g, K.hair, x - u * 1.1 + s * 1.3, y - u * 9.6, u * 2.2, u * 1.4);
  if (opts.eyes) { rect(g, K.eye, x - u * 0.6 + s, y - u * 8.9, u * 0.35, u * 0.3); rect(g, K.eye, x + u * 0.25 + s, y - u * 8.9, u * 0.35, u * 0.3); }
  if (opts.dark) return;
  const r = rng(7);
  for (let i = 0; i < 14; i++) {
    const cx = x + (r() - 0.5) * u * 6 + s, cy = y - u * (4.5 + r() * 4);
    rect(g, K.crystal, cx, cy, u * 0.5, u * 0.5); rect(g, K.crystalL, cx, cy - u * 0.3, u * 0.3, u * 0.3);
  }
}
function rain(g: G, t: number, level: number, calm: boolean, x0 = 0, x1 = W, y0 = 0, y1 = H) {
  if (level <= 0) return;
  const r = rng(11), n = Math.round(160 * level), time = calm ? 0 : t;
  g.fillStyle = K.rain;
  for (let i = 0; i < n; i++) {
    const sx = r() * (x1 - x0 + 80), speed = 0.45 + r() * 0.25, len = 5 + R(r() * 4);
    const y = (r() * (y1 - y0) + time * speed) % (y1 - y0) + y0, x = x0 + ((sx - (time * speed) * 0.25) % (x1 - x0 + 80) + (x1 - x0 + 80)) % (x1 - x0 + 80) - 40;
    for (let k = 0; k < len; k += 2) g.fillRect(R(x - k / 4), R(y + k), 1, 2);
  }
}
/** Lightning: two quick pulses per strike; at most three bright frames a second by construction. */
export function flashLevel(shot: TimedShot, t: number, calm: boolean): number {
  if (calm || !shot.flashes) return 0;
  for (const f of shot.flashes) { const d = t - f; if (d >= 0 && d < 70) return 1; if (d >= 130 && d < 200) return 0.6; }
  return 0;
}
/** Clip to an ellipse of torchlight and paint the lit version inside it. */
function torchlit(g: G, cx: number, cy: number, rx: number, ry: number, paintLit: () => void) {
  g.save(); g.beginPath(); g.ellipse(R(cx), R(cy), R(rx), R(ry), 0, 0, Math.PI * 2); g.clip(); paintLit(); g.restore();
}
function crystals(g: G, seed: number, x: number, y: number, w: number, h: number, n: number, dim = false) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = x + r() * w, cy = y + r() * h, s = 2 + R(r() * 4);
    rect(g, dim ? K.torchD : K.crystal, cx, cy, s, s); rect(g, dim ? K.crystal : K.crystalL, cx, cy - 2, Math.max(1, s - 2), 2);
  }
}
function text(g: G, c: string, s: string, x: number, y: number, size = 16) {
  g.fillStyle = c; g.font = `${size}px "Bincov Text", monospace`; g.textBaseline = 'top'; g.fillText(s, R(x), R(y));
}

// --- Part one -------------------------------------------------------------------------------------------------------

function phone(g: G, t: number, kind: 'news' | 'videos', o: PaintOptions) {
  bands(g, [K.sky0, K.sky1, K.post], 0, H);
  rain(g, t, 0.6, o.calm);
  rect(g, K.skin, 250, 250, 140, 110); rect(g, '#6f5a4d', 250, 250, 20, 110);
  rect(g, '#0a0d0e', 240, 40, 160, 250); rect(g, K.screen, 248, 52, 144, 226);
  text(g, K.glow, kind === 'news' ? '02:51' : '02:53', 256, 56);
  if (kind === 'news') {
    rect(g, K.screenL, 248, 78, 144, 14);
    rect(g, '#2b4b57', 256, 100, 128, 110); rect(g, '#5d6b6b', 300, 128, 40, 30); rect(g, '#4a5656', 290, 158, 60, 52);
    const scroll = o.calm ? 0 : (t * 0.06) % 200;
    for (let i = 0; i < 6; i++) rect(g, K.glow, 392 - scroll + i * 36 - 20, 222, 24, 6);
    rect(g, '#0a0d0e', 240, 214, 8, 20); rect(g, '#0a0d0e', 392, 214, 8, 20);
  } else {
    const off = o.calm ? 0 : R(ease(t / 2500) * 104);
    g.save(); g.beginPath(); g.rect(248, 76, 144, 202); g.clip();
    for (let i = 0; i < 3; i++) {
      const y = 80 + i * 104 - off;
      rect(g, '#253b44', 254, y, 132, 96); rect(g, '#3b5653', 262, y + 10, 116, 56);
      if (i === 1) poly(g, '#7f8a7a', [290, y + 40, 330, y + 26, 350, y + 40, 330, y + 54]);
      rect(g, K.glow, 262, y + 72, 90, 5); rect(g, '#6f8a8a', 262, y + 82, 60, 5);
    }
    g.restore();
  }
  const r = rng(5); for (let i = 0; i < 9; i++) rect(g, '#5e7f8a', 252 + r() * 136, 60 + r() * 210, 2, 3);
}

/** The loading shed: corrugated roof, containers, the black sea beyond the posts. */
function shed(g: G, t: number, beat: string, o: PaintOptions, flash: number) {
  bands(g, [K.sky0, K.sky1], 0, 150);
  rect(g, K.sea0, 0, 150, W, 120); for (let i = 0; i < 8; i++) rect(g, K.foam, (i * 97 + (o.calm ? 0 : t * 0.01)) % W, 170 + (i % 3) * 30, 34, 2);
  rain(g, t, 0.9, o.calm, 0, W, 40, 300);
  rect(g, K.concrete, 0, 262, W, 98); rect(g, K.concreteL, 0, 262, W, 3);
  rect(g, K.boxA, 0, 120, 190, 142); rect(g, K.boxAL, 0, 120, 190, 6); for (let x = 8; x < 190; x += 12) rect(g, '#1a2a2f', x, 128, 3, 130);
  rect(g, K.boxB, 30, 30, 170, 92); rect(g, K.boxBL, 30, 30, 170, 5);
  for (const x of [210, 430, 620]) rect(g, K.post, x, 30, 10, 232);
  rect(g, K.roof, 0, 0, W, 34); for (let x = 0; x < W; x += 16) rect(g, K.roofL, x, 0, 6, 30);
  rect(g, K.lampD, 300, 34, 20, 6); rect(g, K.lamp, 304, 40, 12, 3);
  rect(g, '#1b2224', 220, 250, 44, 14);
  const zx = 240, wx = beat === 'appear' ? 520 : beat === 'pickup' ? 430 : 400;
  if (beat === 'sitting') { person(g, zx, 262, 70, K.zhang, K.zhangL, 'sit', 0, 1); rect(g, K.glow, zx + 8, 214, 6, 4); }
  if (beat === 'appear') {
    person(g, zx, 262, 70, K.zhang, K.zhangL, 'arms-up', 0, 1); rect(g, K.glow, zx + 26, 258, 8, 4);
    const c = flash > 0 ? K.wangL : K.wang; person(g, wx, 300, 92, c, c, 'stand', 0, -1);
  }
  if (beat === 'pickup') { person(g, zx + 20, 262, 70, K.zhang, K.zhangL, 'crouch', 0, 1); person(g, wx, 296, 88, K.wang, K.wangL, 'stand', 0, -1); }
  if (beat === 'look') { person(g, zx + 30, 270, 76, K.zhang, K.zhangL, 'back', 0, 1); person(g, wx, 292, 86, K.wang, K.wangL, 'back', 0, -1); }
  if (beat === 'call') { person(g, zx + 30, 270, 76, K.zhang, K.zhangL, 'arms-up', 0, 1); person(g, wx, 292, 86, K.wang, K.wangL, 'phone', 0, -1); }
}

/** A08: the unlit freighter drifting in from the right; the camera follows it across a 960-wide harbour. */
function harbor(g: G, t: number, ms: number, o: PaintOptions, flash: number) {
  const p = t / ms, shipX = 840 - ease(p / 0.85) * 560, cam = o.calm ? 0 : R(Math.max(0, Math.min(320, shipX - 300)));
  bands(g, [K.sky0, K.sky1, K.sky2], 0, 190);
  rect(g, K.sea0, 0, 190, W, 170);
  for (let i = 0; i < 14; i++) rect(g, K.foam, ((i * 131 - cam * 0.6) % 980 + 980) % 980 - 20, 205 + (i % 4) * 26, 40, 2);
  // Breakwater and the shoal outside it.
  rect(g, '#141c1f', 0 - cam, 236, 300, 18); rect(g, '#1e282b', 0 - cam, 236, 300, 3); rect(g, '#1a2427', 280 - cam, 222, 26, 32);
  rect(g, '#2c3a3b', 150 - cam, 268, 330, 6);
  rect(g, K.lampD, 286 - cam, 214, 6, 8); rect(g, K.lamp, 288 - cam, 216, 2, 2);
  // The ship: listing slightly, cranes on deck, no light anywhere.
  const sx = shipX - cam, sy = 262 - ease((p - 0.8) / 0.2) * 4, lit = flash > 0.5, hull = lit ? K.rust : o.calm ? '#18242a' : '#111d22', upper = lit ? K.rustL : o.calm ? '#1e2b31' : '#18262c';
  poly(g, hull, [sx - 190, sy - 54, sx + 190, sy - 62, sx + 170, sy, sx - 176, sy + 6]);
  rect(g, upper, sx + 80, sy - 112, 70, 54); rect(g, upper, sx + 92, sy - 128, 40, 18);
  for (const cx of [sx - 120, sx - 20]) { rect(g, upper, cx, sy - 130, 6, 74); poly(g, upper, [cx, sy - 130, cx + 70, sy - 98, cx + 66, sy - 94, cx, sy - 122]); }
  if (lit) for (let i = 0; i < 5; i++) rect(g, '#1a1e1f', sx + 88 + i * 12, sy - 100, 6, 8);
  rect(g, K.sea0, 0, 274, W, 86); for (let i = 0; i < 10; i++) rect(g, K.foam, ((i * 89 - cam) % 700 + 700) % 700 - 30, 284 + (i % 3) * 14, 30, 2);
  // Near dock edge with bollards and one weak lamp.
  rect(g, K.concrete, 0, 318, W, 42); rect(g, K.concreteL, 0, 318, W, 3);
  for (let x = 40; x < 960; x += 180) rect(g, '#121819', x - cam * 1.3, 306, 16, 14);
  rect(g, K.lampD, 520 - cam * 1.2, 250, 4, 70); rect(g, K.lamp, 516 - cam * 1.2, 246, 12, 5);
  rain(g, t, 0.8, o.calm);
}

function beach(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms;
  bands(g, [K.sky0, K.sky1], 0, 140); rect(g, K.sea0, 0, 140, W, 60);
  poly(g, '#141c1f', [0, 120, 230, 196, 230, 360, 0, 360]); rect(g, '#1e282b', 0, 118, 6, 4);
  rect(g, '#161d1c', 0, 200, W, 160); for (let i = 0; i < 12; i++) rect(g, '#1f2826', (i * 71) % W, 220 + (i % 5) * 26, 50, 3);
  poly(g, K.hull, [470, 40, 640, 20, 640, 250, 500, 240]); rect(g, K.hullL, 470, 40, 6, 200);
  const x = 150 + ease(p) * 210;
  for (const [dx, coat, coatL, h] of [[0, K.zhang, K.zhangL, 64], [-46, K.wang, K.wangL, 70]] as const) {
    const fx = x + dx, fy = 300;
    poly(g, '#3a3528', [fx + 14, fy - 46, fx + 160, fy - 90, fx + 170, fy - 20]);
    person(g, fx, fy, h, coat, coatL, 'walk', o.calm ? 0 : t / 140 + dx, 1);
  }
  rain(g, t, 1, o.calm);
}

/** The hull wall with the open hatch; `lit` paints the version the torch reveals. */
function hull(g: G, lit: boolean, hatch: { x: number; y: number; w: number; h: number }) {
  rect(g, lit ? K.rustD : K.hull, 0, 0, W, 300);
  for (let y = 20; y < 300; y += 46) rect(g, lit ? '#3b322c' : '#091013', 0, y, W, 3);
  if (lit) { const r = rng(3); for (let i = 0; i < 40; i++) rect(g, K.rust, r() * W, r() * 300, 6 + r() * 20, 2 + r() * 4); }
  rect(g, lit ? '#2a2420' : '#020304', hatch.x, hatch.y, hatch.w, hatch.h);
  if (lit) { crystals(g, 21, hatch.x + 6, hatch.y + 10, hatch.w - 12, hatch.h - 20, 44); rect(g, '#5c564a', hatch.x, hatch.y + hatch.h - 10, hatch.w, 10); }
  rect(g, lit ? K.rust : K.hullL, hatch.x - 6, hatch.y - 6, hatch.w + 12, 6); rect(g, lit ? K.rust : K.hullL, hatch.x - 6, hatch.y, 6, hatch.h);
  rect(g, lit ? K.rust : K.hullL, hatch.x + hatch.w, hatch.y, 6, hatch.h);
  rect(g, '#141a19', 0, 300, W, 60); for (let i = 0; i < 9; i++) rect(g, '#222b29', (i * 83) % W, 312 + (i % 3) * 14, 40, 2);
}
const HATCH = { x: 250, y: 70, w: 150, h: 210 };

function bow(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms, beam = 90 + ease(p / 0.7) * 235;
  hull(g, false, HATCH);
  poly(g, K.sky0, [0, 0, 70, 0, 20, 300, 0, 300]);
  torchlit(g, beam, 160, 90, 70, () => {
    hull(g, true, HATCH); poly(g, K.sky1, [0, 0, 70, 0, 20, 300, 0, 300]);
    text(g, '#d6d0bf', '远汐', 96, 110, 32);
    if (p > 0.6) creature(g, HATCH.x + 90, HATCH.y + 190, 50, { lit: true });
  });
  rain(g, t, 0.5, o.calm);
}

function hatchScene(g: G, t: number, ms: number, beat: string, o: PaintOptions) {
  const p = t / ms, jitter = o.calm ? 0 : R(Math.sin(t / 90) * 2);
  hull(g, false, HATCH);
  const far = beat === 'shout', grow = far ? 0 : ease((p - 0.25) / 0.75), h = 46 + grow * 60, fy = HATCH.y + 170 + grow * 40;
  torchlit(g, HATCH.x + 75 + jitter, HATCH.y + 110, 120, 130, () => {
    hull(g, true, HATCH);
    g.save(); g.beginPath(); g.rect(HATCH.x, HATCH.y, HATCH.w, HATCH.h + 60); g.clip();
    creature(g, HATCH.x + 75 + (far ? 20 : 0), fy, h, { lit: true, sway: far ? 0 : o.calm ? 0 : Math.sin(t / 260) * 2 });
    g.restore();
  });
  // The two men from behind, torches raised.
  person(g, 140, 400, 150, K.zhang, K.zhangL, beat === 'shout' ? 'arms-up' : 'back', 0, 1);
  person(g, 520, 410, 160, K.wang, K.wangL, 'back', 0, -1);
  rain(g, t, 0.4, o.calm);
}

function hatchNear(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms, big = { x: 150, y: 10, w: 340, h: 330 };
  hull(g, false, big);
  torchlit(g, 320 + (o.calm ? 0 : R(Math.sin(t / 110) * 3)), 170, 210, 190, () => {
    hull(g, true, big);
    creature(g, 320, 420 + (1 - ease(p)) * 30, 300 + ease(p) * 30, { lit: true, sway: o.calm ? 0 : Math.sin(t / 300) * 4 });
  });
}

function retreat(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms, back = ease(p) * 40, shake = o.calm ? 0 : R(Math.sin(t / 45) * 2);
  bands(g, [K.sky0, K.sky1], 0, 120);
  poly(g, K.hull, [330, 0, W, 0, W, 300, 360, 290]); rect(g, '#020304', 430, 90, 110, 170);
  torchlit(g, 470 + shake, 180, 90, 110, () => { rect(g, '#2a2420', 430, 90, 110, 170); crystals(g, 31, 434, 96, 100, 150, 24); creature(g, 488, 258, 120, { lit: true }); });
  rect(g, '#141a19', 0, 280, W, 80);
  person(g, 220 - back, 330, 110, K.zhang, K.zhangL, 'walk', o.calm ? 0 : t / 120, -1);
  person(g, 120 - back, 336, 118, K.wang, K.wangL, 'walk', o.calm ? 0 : t / 120 + 2, -1);
}

function face(g: G, t: number, ms: number, o: PaintOptions) {
  const up = t / ms > 0.45, lift = up ? 0 : 30;
  rect(g, '#030405', 0, 0, W, H);
  torchlit(g, 320, 180, 240, 200, () => {
    rect(g, '#1a1512', 0, 0, W, H);
    rect(g, K.fleshL, 220, 60 + lift, 200, 240); rect(g, K.flesh, 220, 60 + lift, 30, 240); rect(g, K.flesh, 390, 60 + lift, 30, 240);
    for (let x = 214; x < 430; x += 14) rect(g, K.hair, x, 40 + lift, 10, up ? 70 + (x % 3) * 16 : 150 + (x % 4) * 12);
    if (up) {
      rect(g, '#120d0c', 262, 136, 40, 18); rect(g, '#120d0c', 338, 136, 40, 18);
      rect(g, K.eye, 276, 140, 12, 10); rect(g, K.eye, 352, 140, 12, 10);
      rect(g, '#2b1a18', 268, 222, 104, 40);
      for (let x = 272; x < 368; x += 10) { rect(g, K.teeth, x, 226, 8, 14); rect(g, K.teeth, x, 244, 8, 12); rect(g, K.blood, x + 2, 236, 4, 6); }
      rect(g, K.blood, 300, 262, 10, 60); rect(g, K.blood, 336, 262, 8, 46);
    }
    crystals(g, 41, 210, 230, 220, 120, 30);
  });
}

function shipFull(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms;
  if (p > 0.82) { rect(g, K.black, 0, 0, W, H); return; }
  bands(g, [K.sky0, K.sky1], 0, 200); rect(g, K.sea0, 0, 200, W, 160);
  poly(g, K.hull, [-20, 120, 660, 90, 660, 300, -20, 320]); rect(g, K.hullL, -20, 112, 680, 8);
  const r = rng(51), windows = Array.from({ length: 9 }, (_, i) => [40 + i * 68, 170 + (i % 2) * 40]);
  windows.forEach(([x, y], i) => {
    rect(g, '#030506', x, y, 22, 18);
    if (p > 0.08 + i * 0.06) { rect(g, K.flesh, x + 4, y + 4, 14, 14); rect(g, K.eye, x + 6, y + 7, 2, 2); rect(g, K.eye, x + 12, y + 7, 2, 2); }
  });
  for (let i = 0; i < 6; i++) if (p > 0.15 + i * 0.07) creature(g, 60 + i * 100 + r() * 30, 112, 40, { dark: '#0c0f10' });
  // The torch tumbles: its beam swings down and goes out in the water.
  const fall = ease((p - 0.55) / 0.25), lunge = ease((p - 0.4) / 0.3);
  if (lunge > 0) creature(g, 320, 360 + lunge * 200, 120 + lunge * 360, { dark: '#060808' });
  if (fall < 1) poly(g, '#3a352833', [320, 360, 220 + fall * 40, 120 + fall * 230, 430 + fall * 40, 120 + fall * 230]);
  rain(g, t, 0.6, o.calm);
}

// --- Part two -------------------------------------------------------------------------------------------------------

function flood(g: G, t: number, o: PaintOptions) {
  bands(g, [K.dawn0, K.dawn1], 0, 170);
  const r = rng(61); for (let x = 0; x < W; x += 24 + R(r() * 20)) { const h = 20 + r() * 60; rect(g, '#4d575a', x, 170 - h, 20 + r() * 20, h); }
  rect(g, K.water, 0, 170, W, 190);
  for (let i = 0; i < 16; i++) rect(g, K.waterL, ((i * 73 + (o.calm ? 0 : t * 0.01)) % W), 190 + (i % 6) * 26, 46, 2);
  for (let x = 40; x < 600; x += 18) rect(g, '#2f3536', x, 238, 3, 12); rect(g, '#2f3536', 40, 238, 560, 3);
  for (const bx of [120, 420]) { rect(g, '#6c706b', bx, 286, 90, 6); for (let x = bx; x < bx + 90; x += 12) rect(g, '#6c706b', x, 278, 4, 10); }
  rect(g, '#3b4546', 520, 120, 6, 70); rect(g, '#3b4546', 500, 120, 46, 4);
}

function street(g: G, t: number, o: PaintOptions) {
  bands(g, [K.dawn0, K.dawn1], 0, 80);
  rect(g, K.wall, 0, 60, W, 210); for (let x = 0; x < W; x += 128) { rect(g, K.wallL, x, 60, 4, 210); rect(g, '#262a2a', x + 20, 140, 88, 130); for (let y = 146; y < 270; y += 8) rect(g, '#323837', x + 20, y, 88, 3); }
  for (let k = 0; k < 4; k++) rect(g, K.salt, 0, 218 + k * 9, W, 2);
  for (const x of [96, 360, 590]) rect(g, '#1f2322', x, 60, 8, 230);
  rect(g, K.water, 0, 270, W, 90); const r = rng(71);
  for (let i = 0; i < 30; i++) rect(g, '#9aa39a', r() * W, 280 + r() * 70, 3, 1);
  const crowd = o.calm ? 0 : R(Math.sin(t / 400) * 1);
  for (let i = 0; i < 18; i++) person(g, 30 + i * 34 + (i % 3) * 4, 60 + crowd * (i % 2), 26, i % 2 ? '#3a3f3c' : '#4a4640', '#56524a', 'stand', 0, i % 2 ? 1 : -1);
}

function shipDay(g: G, t: number, o: PaintOptions) {
  bands(g, [K.day0, K.day1], 0, 180); rect(g, K.sea, 0, 180, W, 180);
  for (let i = 0; i < 10; i++) rect(g, '#6e7f80', ((i * 91 + (o.calm ? 0 : t * 0.01)) % W), 200 + (i % 4) * 30, 40, 2);
  poly(g, K.sand, [80, 270, 560, 262, 600, 300, 40, 306]);
  poly(g, K.rust, [150, 214, 470, 190, 480, 262, 170, 280]); rect(g, K.rustL, 360, 150, 70, 46); rect(g, K.rustL, 372, 132, 40, 20);
  for (const cx of [210, 290]) { rect(g, K.rustL, cx, 140, 5, 66); poly(g, K.rustL, [cx, 140, cx + 60, 168, cx + 56, 172, cx, 148]); }
  for (let i = 0; i < 5; i++) rect(g, '#3e3a36', 366 + i * 12, 160, 6, 8);
}

// --- Part three -----------------------------------------------------------------------------------------------------

function shelter(g: G, t: number, ms: number, o: PaintOptions) {
  rect(g, '#121514', 0, 0, W, H); rect(g, '#1a1e1c', 0, 280, W, 80);
  for (let x = 0; x < W; x += 80) rect(g, '#161a18', x, 0, 3, 280);
  const win = { x: 330, y: 70, w: 220, h: 170 };
  rect(g, '#0c1012', win.x, win.y, win.w, win.h);
  const gap = o.calm ? 10 : R(6 + ease((t / ms - 0.3) / 0.3) * 8);
  for (let x = win.x; x < win.x + win.w; x += 22) { const lean = x > win.x + 100 && x < win.x + 130 ? gap : 0; rect(g, (x / 22) % 2 ? K.bag : K.bagD, x + (x > win.x + 110 ? lean : 0), win.y, 22, win.h); }
  rect(g, '#2e3a40', win.x + 110, win.y, gap, win.h);
  for (let y = win.y; y < win.y + win.h; y += 10) rect(g, K.bagL, win.x, y, win.w, 1);
  person(g, 300, 300, 72, K.you, K.youL, 'crouch', 0, 1); rect(g, K.pack, 274, 246, 18, 26);
}

function gap(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms, slit = { x: 270, w: 100 };
  rect(g, K.black, 0, 0, W, H);
  g.save(); g.beginPath(); g.rect(slit.x, 0, slit.w, H); g.clip();
  bands(g, [K.sky0, K.sky1], 0, 120); rect(g, K.wall, 0, 90, W, 160); rect(g, '#262a2a', 250, 150, 100, 100);
  poly(g, '#323837', [250, 150, 350, 150, 340, 190, 260, 196]);
  rect(g, K.water, 0, 250, W, 110);
  const loot = o.calm ? 0 : R(Math.sin(t / 200) * 3);
  person(g, 290 + loot, 262, 48, K.scav, '#80664f', 'walk', o.calm ? 0 : t / 130, 1); rect(g, K.mask, 285 + loot, 222, 10, 4);
  person(g, 330 - loot, 262, 46, K.scav, '#80664f', 'arms-up', 0, -1); rect(g, K.mask, 325 - loot, 224, 10, 4);
  if (p < 0.5) { person(g, 352, 300, 42, '#3a3a36', '#4a4a44', 'arms-up', 0, -1); person(g, 362, 300, 44, K.scav, '#80664f', 'stand', 0, -1); }
  else rect(g, '#2a2724', 340, 292, 34, 8);
  creature(g, 280 + ease(p) * 80, 340, 30, { dark: '#101414' });
  g.restore();
  rect(g, K.bagD, slit.x - 6, 0, 6, H); rect(g, K.bagD, slit.x + slit.w, 0, 6, H);
}

function bottles(g: G, t: number, ms: number) {
  const p = t / ms;
  rect(g, '#141816', 0, 0, W, H); rect(g, '#1d2220', 0, 250, W, 110); rect(g, '#191d1b', 300, 0, 4, 250);
  for (let i = 0; i < 7; i++) {
    const x = 150 + i * 46, last = i === 6, crushed = last && p > 0.55;
    if (crushed) { rect(g, K.bottle, x, 236, 30, 14); rect(g, '#9fb2b4', x + 4, 238, 20, 3); }
    else { rect(g, K.bottle, x, 170, 26, 80); rect(g, '#9fb2b4', x + 4, 176, 5, 66); rect(g, '#5d6f73', x + 8, 156, 10, 14); }
  }
  if (p > 0.4) { const d = ease((p - 0.4) / 0.15) * 30; rect(g, K.skin, 412, 150 + d, 70, 44); rect(g, K.you, 470, 140 + d, 120, 50); }
}

/** C04: the camera pans from the water tank to the one light in the south-west. */
function roof(g: G, t: number, ms: number, o: PaintOptions, sitting: boolean) {
  const p = t / ms, cam = sitting ? 0 : o.calm ? 320 : R(ease((p - 0.35) / 0.65) * 320);
  bands(g, ['#030506', '#06090b', '#0a0f12'], 0, 220);
  const r = rng(81); for (let x = 0; x < 960; x += 20 + R(r() * 30)) { const h = 20 + r() * 70; rect(g, '#0d1215', x - cam * 0.5, 220 - h, 18 + r() * 24, h); }
  const glow = o.calm ? 1 : 0.85 + 0.15 * Math.sin(t / 380);
  const gx = 900 - cam * 0.5, gy = 196;
  poly(g, K.lampD, [gx - 22 * glow, gy, gx, gy - 12 * glow, gx + 22 * glow, gy, gx, gy + 8]);
  rect(g, K.warm, gx - 6, gy - 4, 12, 6); rect(g, K.warmL, gx - 2, gy - 3, 4, 3);
  rect(g, '#0b1012', 0, 220, W, 60); for (let x = 0; x < 960; x += 64) { rect(g, '#10171a', x - cam * 0.8, 210 + (x % 3) * 8, 52, 70); rect(g, '#182024', x - cam * 0.8, 210 + (x % 3) * 8, 52, 3); }
  for (let i = 0; i < 8; i++) rect(g, '#1d2a30', ((i * 120 - cam * 0.8) % 960 + 960) % 960, 276 + (i % 3) * 6, 40, 1);
  rect(g, '#141a1c', 0 - cam, 290, 760, 70); rect(g, '#1f2729', 0 - cam, 290, 760, 3);
  for (let x = 10; x < 740; x += 26) rect(g, '#2a2420', x - cam, 270, 2, 20);
  const tx = 380 - cam; rect(g, '#232b2e', tx, 210, 80, 80); rect(g, '#2e383b', tx, 210, 80, 6); rect(g, '#1a2023', tx + 66, 216, 14, 74);
  for (let y = 222; y < 290; y += 10) rect(g, '#3a4245', tx - 10, y, 10, 2); rect(g, '#3a4245', tx - 12, 214, 2, 76); rect(g, '#3a4245', tx - 2, 214, 2, 76);
  if (sitting) return;
  const climb = ease(p / 0.3);
  if (climb < 1) person(g, tx - 6, 290 - climb * 80, 64, K.you, K.youL, 'arms-up', 0, 1);
  else person(g, tx + 40, 212, 64, K.you, K.youL, 'sit', 0, 1);
}

function roofSit(g: G, t: number, o: PaintOptions) {
  bands(g, ['#030506', '#070b0d'], 0, 250);
  const r = rng(91); for (let x = 0; x < W; x += 18 + R(r() * 26)) { const h = 10 + r() * 40; rect(g, '#0c1114', x, 250 - h, 16 + r() * 18, h); }
  const glow = o.calm ? 1 : 0.85 + 0.15 * Math.sin(t / 380);
  poly(g, K.lampD, [560 - 30 * glow, 236, 560, 222, 560 + 30 * glow, 236, 560, 244]); rect(g, K.warm, 553, 232, 14, 6);
  rect(g, '#232b2e', 60, 300, 260, 60); rect(g, '#2e383b', 60, 300, 260, 6);
  const sway = o.calm ? 0 : R(Math.sin(t / 700));
  person(g, 190 + sway, 312, 130, K.you, K.youL, 'back', 0, 1); rect(g, K.pack, 168 + sway, 222, 44, 52);
}

function lane(g: G, t: number, ms: number, o: PaintOptions) {
  const p = t / ms;
  bands(g, [K.dawn0, K.dawn1], 0, 140);
  poly(g, K.wall, [0, 0, 250, 0, 290, 230, 0, 360]); poly(g, K.wallL, [640, 0, 390, 0, 350, 230, 640, 360]);
  for (let y = 40; y < 300; y += 30) { rect(g, '#252a29', 0, y, 240 - y * 0.2, 2); rect(g, '#46504c', 400 + y * 0.2, y, 240, 2); }
  poly(g, K.water, [0, 300, 290, 230, 350, 230, 640, 300, 640, 360, 0, 360]);
  for (let i = 0; i < 10; i++) rect(g, K.waterL, 200 + (i * 37) % 240, 240 + (i % 5) * 22, 30 - i, 1);
  const d = ease(p), h = 110 - d * 60, y = 340 - d * 100;
  person(g, 320, y, h, K.you, K.youL, 'walk', o.calm ? 0 : t / 180, 1); rect(g, K.pack, 320 - h * 0.12, y - h * 0.78, h * 0.24, h * 0.3);
  rect(g, K.water, 300, y - h * 0.18, 40, h * 0.18 + 2);
}

/** Paint one frame of a shot at shot-local time t. */
export function paint(g: G, shot: TimedShot, t: number, o: PaintOptions) {
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  const flash = flashLevel(shot, t, o.calm), ms = shot.ms;
  if (o.plates && paintPlates(g, o.plates, shot, t, o.calm, flash)) return;
  // Painters may leave areas untouched; never let the previous shot show through.
  rect(g, K.black, 0, 0, W, H);
  switch (shot.scene) {
    case 'black': rect(g, K.black, 0, 0, W, H); break;
    case 'phone-news': phone(g, t, 'news', o); break;
    case 'phone-videos': phone(g, t, 'videos', o); break;
    case 'shed': shed(g, t, shot.beat ?? 'sitting', o, flash); break;
    case 'harbor': harbor(g, t, ms, o, flash); break;
    case 'beach': beach(g, t, ms, o); break;
    case 'bow': bow(g, t, ms, o); break;
    case 'hatch': hatchScene(g, t, ms, shot.beat ?? 'shout', o); break;
    case 'hatch-near': hatchNear(g, t, ms, o); break;
    case 'retreat': retreat(g, t, ms, o); break;
    case 'face': face(g, t, ms, o); break;
    case 'ship-full': shipFull(g, t, ms, o); break;
    case 'flood': flood(g, t, o); break;
    case 'street': street(g, t, o); break;
    case 'ship-day': shipDay(g, t, o); break;
    case 'shelter': shelter(g, t, ms, o); break;
    case 'gap': gap(g, t, ms, o); break;
    case 'bottles': bottles(g, t, ms); break;
    case 'roof': roof(g, t, ms, o, false); break;
    case 'roof-sit': roofSit(g, t, o); break;
    case 'lane': lane(g, t, ms, o); break;
  }
  // Lightning brightens one step; never a full white frame.
  if (flash > 0) { g.fillStyle = `rgba(190,206,224,${(0.2 * flash).toFixed(2)})`; g.fillRect(0, 0, W, H); }
  if (shot.fadeIn && t < 400) { g.fillStyle = `rgba(0,0,0,${(1 - clamp01(t / 400)).toFixed(2)})`; g.fillRect(0, 0, W, H); }
}
