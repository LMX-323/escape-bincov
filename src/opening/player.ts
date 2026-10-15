/**
 * The opening cutscene player: one Canvas 2D at 640x360 scaled by whole numbers, HTML captions and buttons in a
 * shadow root, its own clock. No WebGL, no Phaser scene, no save access. Everything it creates is released on exit.
 */
import { app, audio } from '../app';
import css from './opening.css';
import { TIMELINE, captionAt, shotAt, type Cue, type TimedCaption, type TimedShot } from './timeline';
import { H, W, paint } from './render';
import { OpeningSound } from './sound';
import { loadOpeningArt } from './assets';
import { prepare, type Prepared } from './scenes';

/** P0 review aid: the shot id and running time in the corner. P2 removes it. */
const SHOW_SHOT_TAG = true;
const CUES: { at: number; cue: Cue }[] = TIMELINE.shots.flatMap(s => (s.cues ?? []).map(c => ({ at: s.start + c.at, cue: c.cue }))).sort((a, b) => a.at - b.at);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export async function play(mode: 'first' | 'replay'): Promise<void> {
  const art = await loadOpeningArt();
  let plates: Prepared | null = null;
  try { plates = art ? prepare(art) : null; } catch (error) { console.error('Opening plates could not be prepared; showing the placeholder frames.', error); }
  return new Promise(resolve => new Session(mode, plates, resolve).mount());
}

class Session {
  private t = 0;
  private last = 0;
  private raf = 0;
  private paused = false;
  private done = false;
  private nextCue = 0;
  private shot: TimedShot | null = null;
  private caption: TimedCaption | null = null;
  private readonly calm = !app.menuMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly sound = new OpeningSound(audio);
  private readonly root = document.createElement('div');
  private readonly shadow = this.root.attachShadow({ mode: 'open' });
  private readonly frame = document.getElementById('frame');
  private readonly frameWasInert = this.frame?.hasAttribute('inert') ?? false;
  private g!: CanvasRenderingContext2D;
  private els!: { stage: HTMLElement; caption: HTMLElement; pause: HTMLButtonElement; skip: HTMLButtonElement; tag: HTMLElement };

  constructor(private readonly mode: 'first' | 'replay', private readonly plates: Prepared | null, private readonly resolve: () => void) {}

  mount(): void {
    this.root.id = 'opening';
    this.shadow.innerHTML = `<style>${css}</style>
      <div class="stage"><canvas width="${W}" height="${H}" role="img" aria-label="序幕动画"></canvas></div>
      <p class="caption" aria-live="polite"></p>
      <div class="controls"><button class="pause" type="button" aria-pressed="false">暂停</button><button class="skip" type="button">跳过</button></div>
      <span class="tag" aria-hidden="true"${SHOW_SHOT_TAG ? '' : ' hidden'}></span>`;
    const $ = <T extends HTMLElement>(s: string) => this.shadow.querySelector<T>(s)!;
    this.els = { stage: $('.stage'), caption: $('.caption'), pause: $('.pause'), skip: $('.skip'), tag: $('.tag') };
    const ctx = $<HTMLCanvasElement>('canvas').getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    this.g = ctx;
    document.body.appendChild(this.root);
    this.frame?.setAttribute('inert', '');
    app.game?.loop.sleep();
    this.els.pause.addEventListener('click', this.togglePause);
    this.els.skip.addEventListener('click', this.skip);
    addEventListener('keydown', this.key, true);
    addEventListener('keyup', this.keyUp, true);
    addEventListener('blur', this.autoPause);
    document.addEventListener('visibilitychange', this.visibility);
    addEventListener('resize', this.layout);
    visualViewport?.addEventListener('resize', this.layout);
    this.layout();
    this.sound.start();
    this.els.pause.focus();
    if (new URLSearchParams(location.search).get('test') === '1') this.expose();
    this.last = performance.now();
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    if (this.done) return;
    const dt = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    if (!this.paused) {
      this.t += dt;
      while (this.nextCue < CUES.length && CUES[this.nextCue].at <= this.t) this.sound.play(CUES[this.nextCue++].cue);
    }
    if (this.t >= TIMELINE.total) { this.finish(); return; }
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const shot = shotAt(this.t);
    if (shot !== this.shot) {
      this.shot = shot;
      this.sound.setBeds(shot.rain ?? 0, shot.wind ?? 0);
      audio.setRoomTone(shot.indoor ? 1 : 0);
    }
    paint(this.g, shot, this.t - shot.start, { calm: this.calm, plates: this.plates });
    const caption = captionAt(this.t);
    if (caption !== this.caption) {
      this.caption = caption;
      const el = this.els.caption;
      el.classList.toggle('card', !!caption?.card);
      el.classList.toggle('sound', !!caption?.sound);
      el.replaceChildren();
      if (caption?.speaker) { const who = document.createElement('span'); who.className = 'who'; who.textContent = `${caption.speaker}：`; el.append(who); }
      if (caption) el.append(caption.sound ? `［${caption.text}］` : caption.text);
    }
    if (SHOW_SHOT_TAG) this.els.tag.textContent = `${shot.id}  ${clock(this.t)}/${clock(TIMELINE.total)}`;
  }

  /** Whole-number scaling when the screen allows it; captions sit in the art's bottom band, or below it on tall screens. */
  private readonly layout = () => {
    const vw = visualViewport?.width ?? innerWidth, vh = visualViewport?.height ?? innerHeight;
    const fit = Math.min(vw / W, vh / H), k = fit >= 1 ? Math.floor(fit) : fit;
    const sw = Math.round(W * k), sh = Math.round(H * k), sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
    const font = 16 * Math.max(1, Math.floor(k)), below = sy >= font * 3 + 16;
    const s = this.root.style;
    s.setProperty('--sx', `${sx}px`); s.setProperty('--sy', `${sy}px`); s.setProperty('--sw', `${sw}px`); s.setProperty('--sh', `${sh}px`);
    s.setProperty('--font', `${font}px`); s.setProperty('--band', below ? `${sy + sh + 8}px` : `${sy + sh - Math.round(72 * k) + Math.round(6 * k)}px`);
  };

  private readonly togglePause = () => this.setPaused(!this.paused);
  private setPaused(paused: boolean): void {
    if (this.done || paused === this.paused) return;
    this.paused = paused;
    this.root.toggleAttribute('data-paused', paused);
    this.els.pause.textContent = paused ? '继续' : '暂停';
    this.els.pause.setAttribute('aria-pressed', String(paused));
    this.sound.setPaused(paused);
  }
  private readonly autoPause = () => this.setPaused(true);
  private readonly visibility = () => { if (document.hidden) this.setPaused(true); };
  private readonly skip = () => this.finish();

  /** Esc skips; Space pauses (and never reaches the focused button, so it cannot press 跳过). */
  private readonly key = (e: KeyboardEvent) => {
    if (e.key === 'Tab') return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.finish(); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.togglePause(); }
  };
  private readonly keyUp = (e: KeyboardEvent) => { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); } };

  private finish(): void {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.key, true);
    removeEventListener('keyup', this.keyUp, true);
    removeEventListener('blur', this.autoPause);
    document.removeEventListener('visibilitychange', this.visibility);
    removeEventListener('resize', this.layout);
    visualViewport?.removeEventListener('resize', this.layout);
    this.sound.stop();
    audio.setRoomTone(0);
    this.root.remove();
    if (!this.frameWasInert) this.frame?.removeAttribute('inert');
    app.game?.loop.wake();
    delete (globalThis as { __bincovOpening?: unknown }).__bincovOpening;
    this.resolve();
  }

  /** Test hook (?test=1 only): read the state, jump to a time without playing the skipped cues, skip. */
  private expose(): void {
    (globalThis as { __bincovOpening?: unknown }).__bincovOpening = {
      mode: this.mode,
      state: () => ({ t: Math.round(this.t), shot: shotAt(this.t).id, caption: this.caption ? `${this.caption.speaker ? this.caption.speaker + '：' : ''}${this.caption.text}` : '', paused: this.paused, calm: this.calm, total: TIMELINE.total }),
      seek: (ms: number) => {
        this.t = Math.max(0, Math.min(TIMELINE.total - 1, ms));
        this.nextCue = CUES.findIndex(c => c.at > this.t); if (this.nextCue < 0) this.nextCue = CUES.length;
        this.draw();
      },
      skip: () => this.finish(),
    };
  }
}
