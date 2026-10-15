/**
 * The opening's sound: baked beds and cues (synth.ts) scheduled on the game's audio bus, so the volume setting
 * applies. Each shot sets its rain and wind (timeline) plus the roof clatter, sea and the hatch echo for its scene.
 * The same class renders the whole track offline for review. Nothing is fetched; every node is released on stop().
 */
import { RATE, bakeBed, bakeCue, type Bed } from './synth';
import { TIMELINE, type Cue, type Scene, type TimedShot } from './timeline';

export interface SoundBus { context: BaseAudioContext; output: AudioNode }

/** Ambience per scene on top of the shot's rain and wind: rain on the tin roof, the sea, and how much hatch echo. */
const SCENE_AMBIENCE: Partial<Record<Scene, { roof?: number; sea?: number; hall?: number }>> = {
  'phone-news': { roof: 0.5, sea: 0.3 }, 'phone-videos': { roof: 0.5, sea: 0.3 }, shed: { roof: 0.9, sea: 0.45 },
  harbor: { sea: 1 }, beach: { sea: 0.75 }, bow: { sea: 0.5, hall: 0.25 }, hatch: { sea: 0.35, hall: 0.45 },
  'hatch-near': { sea: 0.3, hall: 0.5 }, retreat: { sea: 0.35, hall: 0.4 }, face: { hall: 0.55 }, 'ship-full': { sea: 0.8, hall: 0.15 },
  flood: { sea: 0.35 }, street: { sea: 0.2 }, 'ship-day': { sea: 0.6 },
};
const BED_GAIN: Record<Bed, number> = { rain: 0.16, roof: 0.12, wind: 0.2, sea: 0.22 };
const CUE_GAIN: Record<Cue, number> = {
  thunder: 0.9, crack: 1, beep: 0.5, drop: 0.6, scrape: 0.8, drip: 0.5, heart: 0.8, shriek: 0.7, roar: 0.5, splash: 0.7,
  surge: 0.9, crowd: 0.5, crush: 0.5, wade: 0.55, step: 0.55, bang: 0.45,
};
/** The whole ship roaring: voices spread across the stereo field and a little apart in time. */
const ROAR_VOICES: { pan: number; delay: number }[] = [{ pan: -0.6, delay: 0 }, { pan: 0.1, delay: 0.12 }, { pan: 0.65, delay: 0.27 }];

export class OpeningSound {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private send: GainNode | null = null;
  private readonly beds = new Map<Bed, GainNode>();
  private readonly nodes = new Set<AudioNode>();
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly baked = new Map<string, Float32Array>();
  private levels: Record<Bed, number> = { rain: 0, roof: 0, wind: 0, sea: 0 };

  /** bus: the game's context and master gain (null when audio is unavailable); resume: unlock after a pause. */
  constructor(private readonly bus: () => SoundBus | null, private readonly resume: () => void = () => {}) {}

  /** Build the chain and start the beds silent; a no-op without audio. Call from a user gesture. */
  start(at = 0): void {
    const bus = this.bus();
    if (!bus || this.ctx) return;
    const ctx = this.ctx = bus.context;
    this.out = this.keep(ctx.createGain()); this.out.connect(bus.output);
    // The hatch echo: a short synthetic room, fed through a send.
    const room = this.keep(ctx.createConvolver()); room.buffer = this.impulse(ctx); room.connect(this.out);
    this.send = this.keep(ctx.createGain()); this.send.gain.value = 0; this.send.connect(room);
    for (const bed of ['rain', 'roof', 'wind', 'sea'] as Bed[]) this.attachBed(bed, at);
  }

  /**
   * Bake every bed and cue, the first ones needed first (the title card's thunder, then rain and sea), yielding
   * between them so the page keeps drawing. Beds join the mix as soon as they exist; a cue that is not baked yet
   * when its moment comes is skipped. Call after start(); without audio there is nothing to bake.
   */
  async bake(cancelled: () => boolean = () => false): Promise<void> {
    if (!this.ctx) return;
    const jobs: [string, () => Float32Array][] = [
      ['thunder', () => bakeCue('thunder')], ['bed:rain', () => bakeBed('rain')], ['bed:sea', () => bakeBed('sea')],
      ['bed:roof', () => bakeBed('roof')], ['bed:wind', () => bakeBed('wind')],
      ...(Object.keys(CUE_GAIN) as Cue[]).filter(c => c !== 'thunder' && c !== 'roar').map(c => [c, () => bakeCue(c)] as [string, () => Float32Array]),
      ...ROAR_VOICES.map((_, k) => [`roar:${k}`, () => bakeCue('roar', k)] as [string, () => Float32Array]),
    ];
    for (const [key, make] of jobs) {
      if (cancelled()) return;
      if (!this.baked.has(key)) this.baked.set(key, make());
      if (key.startsWith('bed:')) this.attachBed(key.slice(4) as Bed, this.ctx?.currentTime ?? 0);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  private attachBed(bed: Bed, at: number): void {
    const ctx = this.ctx, buffer = this.buffer(`bed:${bed}`);
    if (!ctx || !this.out || !this.send || !buffer || this.beds.has(bed)) return;
    const src = this.keep(ctx.createBufferSource()), gain = this.keep(ctx.createGain());
    src.buffer = buffer; src.loop = true;
    gain.gain.value = 0; gain.gain.setTargetAtTime(this.levels[bed] * BED_GAIN[bed], at, 0.35);
    src.connect(gain).connect(this.out);
    if (bed === 'sea' || bed === 'rain') gain.connect(this.send);
    src.start(at, (bed.length * 0.37) % 1); this.sources.add(src); this.beds.set(bed, gain);
  }

  /** Move the beds and the echo toward a shot's levels. */
  setShot(shot: TimedShot, at = this.ctx?.currentTime ?? 0): void {
    if (!this.ctx || !this.send) return;
    const amb = SCENE_AMBIENCE[shot.scene] ?? {};
    const level = this.levels = { rain: shot.rain ?? 0, wind: shot.wind ?? 0, roof: amb.roof ?? 0, sea: amb.sea ?? 0 };
    for (const [bed, gain] of this.beds) gain.gain.setTargetAtTime(level[bed] * BED_GAIN[bed], at, 0.35);
    this.send.gain.setTargetAtTime(amb.hall ?? 0, at, 0.3);
  }

  /** Paused: fade everything out; the beds keep running silently so resuming is seamless. */
  setPaused(paused: boolean): void {
    if (!this.ctx || !this.out) return;
    if (!paused) this.resume();
    this.out.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  play(cue: Cue, at = this.ctx?.currentTime ?? 0): void {
    if (!this.ctx || !this.out) return;
    if (cue === 'roar') ROAR_VOICES.forEach((v, k) => this.voice(this.buffer(`roar:${k}`), CUE_GAIN.roar, at + v.delay, v.pan));
    else this.voice(this.buffer(cue), CUE_GAIN[cue], at, 0);
  }

  stop(): void {
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* Already stopped. */ } }
    for (const n of this.nodes) n.disconnect();
    this.sources.clear(); this.nodes.clear(); this.beds.clear(); this.buffers.clear();
    this.ctx = null; this.out = null; this.send = null;
  }

  private keep<T extends AudioNode>(node: T): T { this.nodes.add(node); return node; }
  /** The AudioBuffer for baked samples, or null while they are not baked (or without a context). */
  private buffer(key: string): AudioBuffer | null {
    let b = this.buffers.get(key);
    if (b) return b;
    const data = this.baked.get(key);
    if (!data || !this.ctx) return null;
    const copy = new Float32Array(data);
    b = this.ctx.createBuffer(1, copy.length, RATE); b.copyToChannel(copy, 0); this.buffers.set(key, b);
    return b;
  }
  /** A one-shot through its gain and pan, into the mix and the echo send; released when it ends. */
  private voice(buffer: AudioBuffer | null, level: number, at: number, pan: number): void {
    if (!buffer) return;
    const ctx = this.ctx!, src = ctx.createBufferSource(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    src.buffer = buffer; gain.gain.value = level; panner.pan.value = pan;
    src.connect(gain).connect(panner).connect(this.out!); panner.connect(this.send!);
    const chain: AudioNode[] = [src, gain, panner];
    this.sources.add(src); chain.forEach(n => this.nodes.add(n));
    src.onended = () => { this.sources.delete(src); for (const n of chain) { n.disconnect(); this.nodes.delete(n); } };
    src.start(Math.max(at, 0));
  }
  /** A 1.4 s stereo room tail: decaying noise, darker as it fades. A convolver needs the context's own rate. */
  private impulse(ctx: BaseAudioContext): AudioBuffer {
    const sr = ctx.sampleRate, n = Math.round(1.4 * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n); let s = 77 + c * 31, low = 0;
      for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const k = 0.15 + 0.6 * (1 - i / n);
        low += (((s / 4294967296) * 2 - 1) - low) * k;
        d[i] = low * Math.exp(-i / (0.32 * sr)) * 0.6;
      }
      b.copyToChannel(d, c);
    }
    return b;
  }
}

/** Review aid (?test=1): render the whole opening's sound offline as a 16-bit stereo WAV, base64. */
export async function renderOpeningAudio(): Promise<string> {
  const length = Math.ceil(TIMELINE.total / 1000 * RATE) + RATE;
  const ctx = new OfflineAudioContext(2, length, RATE);
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const sound = new OpeningSound(() => ({ context: ctx, output: master }));
  sound.start(0);
  await sound.bake();
  for (const shot of TIMELINE.shots) {
    sound.setShot(shot, shot.start / 1000);
    for (const c of shot.cues ?? []) sound.play(c.cue, (shot.start + c.at) / 1000);
  }
  const rendered = await ctx.startRendering();
  const left = rendered.getChannelData(0), right = rendered.getChannelData(1), bytes = new DataView(new ArrayBuffer(44 + left.length * 4));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); bytes.setUint32(4, 36 + left.length * 4, true); text(8, 'WAVEfmt '); bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true); bytes.setUint32(24, RATE, true); bytes.setUint32(28, RATE * 4, true);
  bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true); text(36, 'data'); bytes.setUint32(40, left.length * 4, true);
  for (let i = 0; i < left.length; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
  }
  let binary = ''; const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  sound.stop();
  return btoa(binary);
}
