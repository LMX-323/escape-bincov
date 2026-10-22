/**
 * The opening's sounds, baked sample by sample into plain Float32Arrays: seamless beds (rain, rain on the tin roof,
 * wind, sea) and one-shot cues. Pure and seeded, so the same buffers play live, render offline for review and run in
 * Node tests. Original synthesis only; nothing recorded or fetched.
 */
import type { Cue } from './timeline';

export const RATE = 44100;
export type Bed = 'rain' | 'roof' | 'wind' | 'sea';

/** Seeded uniform random in [0, 1). */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seconds = (s: number) => Math.round(s * RATE);

/** RBJ biquad, applied in place. */
function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'bandpass', freq: number | ((i: number) => number), q = 0.707): Float32Array {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, last = -1;
  const design = (f: number) => {
    const w = 2 * Math.PI * Math.min(f, RATE * 0.45) / RATE, c = Math.cos(w), s = Math.sin(w), alpha = s / (2 * q), a0 = 1 + alpha;
    if (type === 'lowpass') { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
    else { b0 = alpha / a0; b1 = 0; b2 = -alpha / a0; }
    a1 = -2 * c / a0; a2 = (1 - alpha) / a0;
  };
  for (let i = 0; i < x.length; i++) {
    const f = typeof freq === 'number' ? freq : freq(i);
    if (f !== last && (typeof freq === 'number' ? last < 0 : (i & 31) === 0)) { design(f); last = f; }
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function white(n: number, rnd: () => number): Float32Array { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1; return x; }
/** Pink noise (Paul Kellet's economy filter). */
function pink(n: number, rnd: () => number): Float32Array {
  const x = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  return x;
}
/** Brown noise: leaky integrated white noise. */
function brown(n: number, rnd: () => number): Float32Array {
  const x = new Float32Array(n); let v = 0;
  for (let i = 0; i < n; i++) { v = (v + (rnd() * 2 - 1) * 0.02) * 0.998; x[i] = v * 3.5; }
  return x;
}
/** Smooth random control signal in [0, 1] changing about `rate` times a second. */
function drift(n: number, rate: number, rnd: () => number): Float32Array {
  const x = new Float32Array(n), step = Math.max(1, Math.round(RATE / rate)), points = Math.ceil(n / step) + 2, p = Array.from({ length: points }, rnd);
  for (let i = 0; i < n; i++) { const k = Math.floor(i / step), u = (i % step) / step, s = u * u * (3 - 2 * u); x[i] = p[k] * (1 - s) + p[k + 1] * s; }
  return x;
}
function mix(into: Float32Array, add: Float32Array, at = 0, gain = 1): Float32Array {
  for (let i = 0; i < add.length && i + at < into.length; i++) if (i + at >= 0) into[i + at] += add[i] * gain;
  return into;
}
function envelope(x: Float32Array, attack: number, decay: number, hold = 0): Float32Array {
  const a = Math.max(1, seconds(attack)), h = seconds(hold);
  for (let i = 0; i < x.length; i++) x[i] *= i < a ? i / a : i < a + h ? 1 : Math.exp(-(i - a - h) / (decay * RATE));
  return x;
}
/** Scale to a peak level; silence stays silence. */
export function normalise(x: Float32Array, peak: number): Float32Array {
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}
function tone(n: number, f: (t: number) => number, shape: 'sine' | 'saw' = 'sine'): Float32Array {
  const x = new Float32Array(n); let phase = 0;
  for (let i = 0; i < n; i++) { phase = (phase + f(i / RATE) / RATE) % 1; x[i] = shape === 'sine' ? Math.sin(2 * Math.PI * phase) : 2 * phase - 1; }
  return x;
}
/** Make a buffer loop seamlessly: render overlap extra samples and crossfade the tail into the head (equal power). */
function loop(length: number, overlap: number, render: (n: number) => Float32Array): Float32Array {
  const n = seconds(length), o = seconds(overlap), x = render(n + o), out = x.slice(0, n);
  for (let i = 0; i < o; i++) { const u = i / o; out[i] = x[i] * Math.sin(u * Math.PI / 2) + x[n + i] * Math.cos(u * Math.PI / 2); }
  return out;
}

/** Ambient beds, each a seamless loop. */
export function bakeBed(bed: Bed): Float32Array {
  const rnd = random({ rain: 11, roof: 23, wind: 37, sea: 41 }[bed]);
  switch (bed) {
    case 'rain': return normalise(loop(4, 0.5, n => {
      const x = biquad(biquad(pink(n, rnd), 'highpass', 500), 'lowpass', 7000);
      // Droplets: short high pings scattered through the hiss.
      for (let k = 0; k < n / RATE * 110; k++) {
        const at = Math.floor(rnd() * n), f = 2500 + rnd() * 3500, len = seconds(0.008 + rnd() * 0.014);
        mix(x, envelope(tone(len, () => f), 0.001, 0.004), at, 0.08 + rnd() * 0.12);
      }
      return x;
    }), 0.5);
    case 'roof': return normalise(loop(3, 0.4, n => {
      // Rain on corrugated iron: dense ticks ringing at two sheet resonances.
      const ticks = new Float32Array(n);
      for (let k = 0; k < n / RATE * 520; k++) ticks[Math.floor(rnd() * n)] += (rnd() * 2 - 1) * (0.4 + rnd() * 0.6);
      const ring = mix(biquad(ticks.slice(), 'bandpass', 2150, 9), biquad(ticks.slice(), 'bandpass', 3550, 11), 0, 0.8);
      return mix(ring, biquad(pink(n, rnd), 'bandpass', 1800, 0.5), 0, 0.35);
    }), 0.55);
    case 'wind': return normalise(loop(8, 1.5, n => {
      const gust = drift(n, 0.35, rnd), x = biquad(pink(n, rnd), 'lowpass', (i: number) => 260 + gust[i] * 420, 0.9);
      for (let i = 0; i < n; i++) x[i] *= 0.35 + gust[i] * 0.65;
      const whistle = biquad(pink(n, rnd), 'bandpass', (i: number) => 700 + gust[i] * 500, 7);
      for (let i = 0; i < n; i++) whistle[i] *= gust[i] * gust[i];
      return mix(x, whistle, 0, 0.35);
    }), 0.55);
    case 'sea': return normalise(loop(10, 2, n => {
      // Swells every few seconds: a low body and foam hiss riding on top.
      const swell = new Float32Array(n);
      for (let at = 0; at < n; at += seconds(3.4 + rnd() * 1.6)) mix(swell, envelope(new Float32Array(seconds(4.2)).fill(1), 1.4, 1.1), at, 0.6 + rnd() * 0.4);
      const body = biquad(brown(n, rnd), 'lowpass', 380), foam = biquad(white(n, rnd), 'highpass', 1500);
      for (let i = 0; i < n; i++) { const s = Math.min(1, swell[i]); body[i] *= 0.35 + s * 0.65; foam[i] *= s * s * 0.18; }
      return mix(body, foam);
    }), 0.6);
  }
}

/** One-shot cues. 'roar' is one voice; the player layers several for the whole ship. */
export function bakeCue(cue: Cue, voice = 0): Float32Array {
  const rnd = random(101 + cue.length * 7 + voice * 13 + cue.charCodeAt(0));
  switch (cue) {
    case 'thunder': {
      const n = seconds(3.2), rumble = new Float32Array(n);
      for (let k = 0; k < 4; k++) mix(rumble, envelope(biquad(brown(seconds(2.6), rnd), 'lowpass', 120 + rnd() * 60), 0.12, 0.7 + rnd() * 0.4), seconds(rnd() * 0.7), 0.6 + rnd() * 0.4);
      for (let k = 0; k < 4; k++) mix(rumble, envelope(biquad(white(seconds(0.12), rnd), 'highpass', 1200), 0.002, 0.03), seconds(k * 0.06 + rnd() * 0.05), 0.15);
      return normalise(rumble, 0.85);
    }
    case 'crack': {
      const snap = envelope(biquad(white(seconds(0.25), rnd), 'highpass', 900), 0.001, 0.04);
      const rumble = envelope(biquad(brown(seconds(2.3), rnd), 'lowpass', 170), 0.03, 0.75);
      return normalise(mix(mix(new Float32Array(seconds(2.4)), snap), rumble, seconds(0.02), 1.4), 0.95);
    }
    case 'beep': {
      const a = envelope(tone(seconds(0.1), () => 880), 0.005, 0.05, 0.04), b = envelope(tone(seconds(0.14), () => 1175), 0.005, 0.06, 0.05);
      return normalise(mix(mix(new Float32Array(seconds(0.32)), a), b, seconds(0.13)), 0.4);
    }
    case 'drop': {
      const click = envelope(biquad(white(seconds(0.03), rnd), 'bandpass', 2600, 2), 0.001, 0.006);
      const thud = envelope(tone(seconds(0.12), t => 140 * Math.exp(-t * 6)), 0.002, 0.03);
      return normalise(mix(mix(new Float32Array(seconds(0.25)), click), thud, 0, 1.4), 0.7);
    }
    case 'scrape': {
      const n = seconds(3.4), grind = biquad(white(n, rnd), 'bandpass', 300, 1.2), wob = drift(n, 7, rnd);
      for (let i = 0; i < n; i++) grind[i] *= 0.4 + wob[i] * 0.6;
      const hull = biquad(tone(n, t => 48 - 14 * t / 3.4, 'saw'), 'lowpass', 220);
      const groan = mix(tone(n, t => 92 + Math.sin(t * 3) * 3), tone(n, t => 97 + Math.sin(t * 2.3) * 4), 0, 0.8);
      return normalise(envelope(mix(mix(grind, hull, 0, 0.9), groan, 0, 0.35), 0.4, 1.1, 1.6), 0.8);
    }
    case 'drip': {
      const ping = envelope(tone(seconds(0.06), t => 1900 * Math.exp(-t * 18)), 0.002, 0.022);
      const x = mix(new Float32Array(seconds(0.6)), ping);
      mix(x, biquad(ping.slice(), 'lowpass', 2500), seconds(0.11), 0.35); mix(x, biquad(ping.slice(), 'lowpass', 1800), seconds(0.23), 0.16);
      return normalise(x, 0.45);
    }
    case 'crush': {
      const x = new Float32Array(seconds(0.32));
      for (let k = 0; k < 11; k++) mix(x, envelope(biquad(white(seconds(0.01), rnd), 'highpass', 3000 + rnd() * 3000), 0.0005, 0.003), seconds(rnd() * 0.26), 0.4 + rnd() * 0.6);
      return normalise(x, 0.55);
    }
    case 'heart': {
      const beat = (len: number) => envelope(mix(tone(seconds(len), () => 55), tone(seconds(len), () => 110), 0, 0.3), 0.008, 0.05);
      return normalise(mix(mix(new Float32Array(seconds(0.6)), beat(0.16)), beat(0.14), seconds(0.2), 0.7), 0.9);
    }
    case 'shriek': {
      const n = seconds(0.7), voice = biquad(tone(n, t => 650 + 600 * Math.min(1, t / 0.15) + Math.sin(t * 60) * 25, 'saw'), 'bandpass', 1500, 5);
      const breath = biquad(white(n, rnd), 'bandpass', 2500, 2);
      return normalise(envelope(mix(voice, breath, 0, 0.3), 0.02, 0.22, 0.12), 0.65);
    }
    case 'roar': {
      const n = seconds(1.8), f0 = [100, 128, 150, 86][voice % 4], jitter = drift(n, 18, rnd);
      const src = tone(n, t => f0 * (1 + 0.06 * Math.sin(t * 2 * Math.PI * 6)) * (0.95 + jitter[Math.min(n - 1, Math.floor(t * RATE))] * 0.1), 'saw');
      const formants = mix(biquad(src.slice(), 'bandpass', 620 + voice * 40, 4), biquad(src.slice(), 'bandpass', 1150 + voice * 60, 5), 0, 0.7);
      const rasp = biquad(white(n, rnd), 'bandpass', 850, 1.5);
      return normalise(envelope(mix(formants, rasp, 0, 0.5), 0.08, 0.35, 0.8), 0.8);
    }
    case 'splash': {
      const x = envelope(biquad(white(seconds(0.5), rnd), 'highpass', 700), 0.003, 0.09);
      const body = envelope(biquad(brown(seconds(0.5), rnd), 'lowpass', 320), 0.005, 0.12);
      const out = mix(mix(new Float32Array(seconds(0.8)), x), body, 0, 1.2);
      for (let k = 0; k < 6; k++) mix(out, envelope(tone(seconds(0.04), () => 300 + rnd() * 600), 0.002, 0.01), seconds(0.1 + rnd() * 0.5), 0.12);
      return normalise(out, 0.8);
    }
    case 'surge': {
      const n = seconds(3.6), body = envelope(biquad(brown(n, rnd), 'lowpass', 300), 0.6, 1.2, 0.3);
      const crash = envelope(biquad(white(seconds(2.4), rnd), 'highpass', 1800), 0.15, 0.6);
      return normalise(mix(body, crash, seconds(0.55), 0.25), 0.95);
    }
    case 'crowd': {
      const n = seconds(2.6), out = new Float32Array(n);
      for (let k = 0; k < 6; k++) {
        const syllables = drift(n, 3 + rnd() * 3, rnd), v = mix(biquad(pink(n, rnd), 'bandpass', 380 + rnd() * 400, 3), biquad(pink(n, rnd), 'bandpass', 1300 + rnd() * 900, 4), 0, 0.6);
        for (let i = 0; i < n; i++) v[i] *= Math.max(0, syllables[i] - 0.35) * 1.6;
        mix(out, v, 0, 0.6 + rnd() * 0.4);
      }
      return normalise(envelope(biquad(out, 'lowpass', 2500), 0.3, 0.8, 1.2), 0.35);
    }
    case 'wade': {
      const slosh = envelope(biquad(white(seconds(0.45), rnd), 'lowpass', 600), 0.06, 0.12);
      const gurgle = envelope(tone(seconds(0.3), t => 250 * Math.exp(-t * 3)), 0.02, 0.08);
      return normalise(mix(slosh, gurgle, seconds(0.05), 0.25), 0.55);
    }
    case 'bang': {
      // A rolling shutter struck: a hard hit ringing at a few sheet-metal modes.
      const hit = envelope(biquad(white(seconds(0.08), rnd), 'bandpass', 1400, 0.8), 0.001, 0.02);
      const ring = new Float32Array(seconds(0.9));
      for (const [f, d] of [[310, 0.35], [742, 0.22], [1460, 0.14], [2290, 0.09]]) mix(ring, envelope(tone(seconds(0.9), () => f * (0.98 + rnd() * 0.04)), 0.002, d), 0, 0.5);
      return normalise(mix(mix(new Float32Array(seconds(0.9)), hit, 0, 1.4), ring, 0, 0.6), 0.75);
    }
    case 'step': {
      const thud = envelope(tone(seconds(0.2), t => 90 * Math.exp(-t * 2)), 0.003, 0.05), squelch = envelope(biquad(white(seconds(0.2), rnd), 'lowpass', 420), 0.01, 0.05);
      return normalise(mix(thud, squelch, 0, 0.8), 0.6);
    }
  }
}
