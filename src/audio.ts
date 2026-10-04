/** Original, synthesized audio. Nothing is fetched and no recorded samples are used. */
export class SynthAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: AudioBufferSourceNode;
  private swell?: OscillatorNode;
  private volume = 0.35;
  private noise?: AudioBuffer;
  private lastStep = 0;
  private ambientNodes: AudioNode[] = [];
  private voices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private readonly maxVoices = 96;

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
  }

  /** Call from the first user gesture; browsers otherwise suspend AudioContext. */
  start(): void {
    try {
      if (!this.context) {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        // A soft limiter preserves headroom when several nearby enemies fire.
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 18;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        this.master.connect(limiter).connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        let low = 0;
        for (let i = 0; i < data.length; i++) {
          low = (low + (Math.random() * 2 - 1) * 0.08) / 1.08;
          data[i] = low * 3;
        }
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      if (!this.ambience && this.master && this.noise) {
        const noise = this.context.createBufferSource();
        noise.buffer = this.noise;
        noise.loop = true;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        const level = this.context.createGain();
        level.gain.value = 0.085;
        noise.connect(filter).connect(level).connect(this.master);
        const tide = this.context.createOscillator();
        const amount = this.context.createGain();
        tide.frequency.value = 0.13;
        amount.gain.value = 0.035;
        tide.connect(amount).connect(level.gain);
        tide.start();
        noise.start();
        this.ambience = noise;
        this.swell = tide;
        this.ambientNodes = [noise, filter, level, tide, amount];
      }
    } catch { /* Audio is optional, including in restricted local-file browsers. */ }
  }

  stop(): void {
    try { this.ambience?.stop(); this.swell?.stop(); } catch { /* Already stopped. */ }
    for (const [voice, nodes] of this.voices) {
      voice.onended = null;
      try { voice.stop(); } catch { /* Already stopped. */ }
      for (const node of nodes) node.disconnect();
    }
    this.voices.clear();
    for (const node of this.ambientNodes) node.disconnect();
    this.ambientNodes = [];
    this.ambience = undefined;
    this.swell = undefined;
    if (this.context) void this.context.suspend().catch(() => undefined);
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.voices.set(source, nodes);
    source.onended = () => {
      this.voices.delete(source);
      for (const node of nodes) node.disconnect();
      source.onended = null;
    };
  }

  private tone(frequency: number, length: number, gain: number, type: OscillatorType = 'sine', endFrequency = frequency, delay = 0): void {
    if (!this.context || !this.master || this.context.state !== 'running' || this.voices.size >= this.maxVoices) return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + length);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(envelope).connect(this.master);
    this.trackVoice(oscillator, [oscillator, envelope]);
    oscillator.start(at);
    oscillator.stop(at + length + 0.025);
  }

  private hiss(length: number, gain: number, cutoff: number, delay = 0): void {
    if (!this.context || !this.master || !this.noise || this.context.state !== 'running' || this.voices.size >= this.maxVoices) return;
    const at = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(envelope).connect(this.master);
    this.trackVoice(source, [source, filter, envelope]);
    source.start(at, Math.random() * 2);
    source.stop(at + length + 0.02);
  }

  shot(kind = 'pistol'): void {
    if (kind === 'knife') { this.hiss(0.12, 0.35, 900); this.tone(320, 0.08, 0.05, 'triangle', 90); return; }
    const shotgun = kind === 'shotgun';
    const level = kind === 'enemy' ? 0.55 : 1;
    this.hiss(shotgun ? 0.3 : 0.16, (shotgun ? 1.05 : 0.72) * level, 380);
    this.tone(shotgun ? 140 : 210, shotgun ? 0.2 : 0.12, 0.3 * level, 'triangle', 36);
    this.tone(72, 0.13, 0.18 * level, 'sine', 32, 0.025);
    this.hiss(0.06, 0.09 * level, 1500, 0.11);
  }

  step(): void {
    if (!this.context || this.context.currentTime - this.lastStep < 0.17) return;
    this.lastStep = this.context.currentTime;
    this.hiss(0.06, 0.18, 180);
    this.tone(78 + Math.random() * 22, 0.08, 0.07, 'triangle', 40);
  }
  hit(): void { this.hiss(0.16, 0.6, 80); this.tone(110, 0.17, 0.15, 'sawtooth', 30); }
  pickup(): void { this.tone(660, 0.08, 0.08, 'triangle', 880); this.tone(990, 0.1, 0.06, 'sine', 1100, 0.07); }
  click(): void { this.tone(480, 0.045, 0.07, 'square', 240); }
  radio(): void {
    this.hiss(0.5, 0.17, 800);
    this.tone(870, 0.16, 0.06, 'sine');
    this.tone(650, 0.19, 0.06, 'sine', 650, 0.25);
    this.hiss(0.2, 0.08, 1200, 0.5);
  }
  death(): void { this.tone(170, 1.5, 0.18, 'triangle', 24); this.hiss(0.8, 0.22, 100); }
  extract(): void { [330, 440, 550, 660].forEach((note, i) => this.tone(note, 0.55, 0.075, 'triangle', note, i * 0.17)); }
}
