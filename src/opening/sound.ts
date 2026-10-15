/**
 * Placeholder sound for the animatic: rain and wind beds plus short synthesized cues, on the game's audio bus so the
 * volume setting applies. Nothing is fetched. Every node is released on stop().
 */
import type { SynthAudio } from '../audio';
import type { Cue } from './timeline';

export class OpeningSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: { rain: GainNode; wind: GainNode } | null = null;
  private nodes = new Set<AudioNode>();
  private sources = new Set<AudioScheduledSourceNode>();

  constructor(private readonly audio: SynthAudio) {}

  /** Build the beds; a no-op when audio is unavailable. Call from a user gesture. */
  start(): void {
    this.audio.start();
    const bus = this.audio.bus();
    if (!bus || this.ctx) return;
    const ctx = this.ctx = bus.context;
    this.out = this.keep(ctx.createGain()); this.out.connect(bus.output);
    const data = new Float32Array(ctx.sampleRate * 2);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBuffer(1, data.length, ctx.sampleRate); this.noise.copyToChannel(data, 0);
    const bed = (type: BiquadFilterType, freq: number, q: number) => {
      const src = this.loop(), filter = this.keep(ctx.createBiquadFilter()), gain = this.keep(ctx.createGain());
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q; gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.out!); return gain;
    };
    this.beds = { rain: bed('bandpass', 2600, 0.5), wind: bed('lowpass', 380, 0.7) };
  }

  /** Ramp the ambient beds toward a shot's levels. */
  setBeds(rain: number, wind: number): void {
    if (!this.ctx || !this.beds) return;
    const at = this.ctx.currentTime;
    this.beds.rain.gain.setTargetAtTime(rain * 0.16, at, 0.4);
    this.beds.wind.gain.setTargetAtTime(wind * 0.22, at, 0.6);
  }

  /** Paused: fade everything out; the beds keep running silently so resuming is seamless. */
  setPaused(paused: boolean): void {
    if (!this.ctx || !this.out) return;
    if (!paused) this.audio.start();
    this.out.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  play(cue: Cue): void {
    if (!this.ctx || !this.out) return;
    switch (cue) {
      case 'thunder': this.burst('lowpass', 140, 0.8, 0.02, 2.2, 0.9); this.burst('lowpass', 400, 0.7, 0, 0.3, 0.3); break;
      case 'crack': this.burst('highpass', 900, 0.5, 0, 0.18, 0.7); this.burst('lowpass', 160, 0.8, 0.02, 1.6, 0.8); break;
      case 'beep': this.tone('sine', 880, 880, 0.09, 0.12); this.tone('sine', 660, 660, 0.12, 0.12, 0.14); break;
      case 'drop': this.tone('square', 900, 300, 0.04, 0.08); this.burst('lowpass', 300, 1, 0.03, 0.12, 0.3); break;
      case 'scrape': this.tone('sawtooth', 52, 34, 3, 0.16, 0, 120); break;
      case 'drip': this.tone('sine', 1400, 700, 0.08, 0.08); this.tone('sine', 1400, 700, 0.06, 0.03, 0.18); break;
      case 'heart': this.audio.heartbeat(); break;
      case 'shriek': this.tone('sawtooth', 900, 1500, 0.35, 0.12, 0, 2200); break;
      case 'roar': for (let i = 0; i < 4; i++) this.sweep(260 + i * 90, 900 + i * 120, 1.4, 0.18, i * 0.18); break;
      case 'splash': this.burst('highpass', 600, 0.6, 0, 0.45, 0.5); this.burst('lowpass', 200, 0.8, 0.05, 0.6, 0.4); break;
      case 'surge': this.burst('lowpass', 120, 0.9, 0.05, 1.2, 1); this.burst('bandpass', 500, 0.4, 0.4, 2.6, 0.45); break;
      case 'crowd': for (let i = 0; i < 3; i++) this.sweep(500 + i * 160, 700 + i * 140, 1.6, 0.05, i * 0.35); break;
      case 'crush': for (let i = 0; i < 4; i++) this.burst('highpass', 2500, 0.7, i * 0.05, 0.04, 0.25); break;
      case 'wade': this.burst('lowpass', 500, 0.9, 0.02, 0.35, 0.35); break;
      case 'step': this.burst('lowpass', 220, 1, 0.01, 0.2, 0.4); break;
    }
  }

  stop(): void {
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* Already stopped. */ } }
    for (const n of this.nodes) n.disconnect();
    this.sources.clear(); this.nodes.clear();
    this.ctx = null; this.out = null; this.noise = null; this.beds = null;
  }

  private keep<T extends AudioNode>(node: T): T { this.nodes.add(node); return node; }
  private loop(): AudioBufferSourceNode {
    const src = this.keep(this.ctx!.createBufferSource()); src.buffer = this.noise; src.loop = true; src.start(); this.sources.add(src); return src;
  }
  /** A one-shot source and its chain, released when it ends. */
  private once(src: AudioScheduledSourceNode, chain: AudioNode[], at: number, until: number) {
    this.sources.add(src); chain.forEach(n => this.nodes.add(n));
    src.onended = () => { this.sources.delete(src); for (const n of chain) { n.disconnect(); this.nodes.delete(n); } };
    src.start(at); src.stop(until);
  }
  private burst(type: BiquadFilterType, freq: number, q: number, delay: number, length: number, level: number) {
    const ctx = this.ctx!, at = ctx.currentTime + delay, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noise; filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(level, at + Math.min(0.03, length / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(env).connect(this.out!);
    this.once(src, [src, filter, env], at, at + length + 0.05);
  }
  private tone(type: OscillatorType, f0: number, f1: number, length: number, level: number, delay = 0, lowpass = 0) {
    const ctx = this.ctx!, at = ctx.currentTime + delay, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, at); osc.frequency.exponentialRampToValueAtTime(f1, at + length);
    env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(level, at + 0.01); env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    const chain: AudioNode[] = [osc, env];
    if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; osc.connect(f).connect(env); chain.push(f); } else osc.connect(env);
    env.connect(this.out!);
    this.once(osc, chain, at, at + length + 0.05);
  }
  /** Noise through a band-pass that sweeps, for roars and distant voices. */
  private sweep(f0: number, f1: number, length: number, level: number, delay: number) {
    const ctx = this.ctx!, at = ctx.currentTime + delay, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noise; filter.type = 'bandpass'; filter.Q.value = 6;
    filter.frequency.setValueAtTime(f0, at); filter.frequency.exponentialRampToValueAtTime(f1, at + length * 0.6); filter.frequency.exponentialRampToValueAtTime(f0, at + length);
    env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(level, at + 0.08); env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(env).connect(this.out!);
    this.once(src, [src, filter, env], at, at + length + 0.05);
  }
}
