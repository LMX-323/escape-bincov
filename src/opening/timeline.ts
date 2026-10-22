/**
 * The opening cutscene as plain data: shots, durations, captions and sound cues, in milliseconds.
 * Source of truth for the words and durations: docs/OPENING-CUTSCENE-SCRIPT.md section 3 (tests compare the two).
 * No DOM here, so Node tests can import it.
 */

export type Speaker = '新闻' | '老张' | '老王' | '你';
export interface Caption {
  text: string;
  speaker?: Speaker;
  /** A sound caption, shown as ［text］. */
  sound?: boolean;
  /** A centred title card on a black shot instead of a subtitle. */
  card?: boolean;
}
export type Scene =
  | 'black' | 'phone-news' | 'phone-videos' | 'shed' | 'harbor' | 'beach' | 'bow' | 'hatch' | 'hatch-near' | 'retreat'
  | 'face' | 'ship-full' | 'flood' | 'street' | 'ship-day' | 'shelter' | 'gap' | 'bottles' | 'roof' | 'roof-sit' | 'lane';
export type Cue =
  | 'thunder' | 'crack' | 'beep' | 'drop' | 'scrape' | 'drip' | 'heart' | 'shriek' | 'roar' | 'splash' | 'surge'
  | 'crowd' | 'crush' | 'wade' | 'step' | 'bang';
export interface Shot {
  id: string;
  ms: number;
  scene: Scene;
  /** Which beat of a shared scene this shot shows (poses, who is in frame). */
  beat?: string;
  captions: Caption[];
  /** The captions run on across this many following shots (A02's news runs through A03). */
  carry?: number;
  /** Lightning, as offsets into the shot; the renderer brightens one step and keeps to three flashes a second. */
  flashes?: number[];
  cues?: { at: number; cue: Cue }[];
  /** Ambient beds for the shot, 0..1. */
  rain?: number;
  wind?: number;
  /** Heard from indoors: muffles the game's sea ambience. */
  indoor?: boolean;
  /** Fade up from black at the start of the shot. */
  fadeIn?: boolean;
}

const say = (speaker: Speaker, text: string): Caption => ({ speaker, text });
const line = (text: string): Caption => ({ text });
const card = (text: string): Caption => ({ text, card: true });

export const SHOTS: readonly Shot[] = [
  // Part one: the typhoon night
  { id: 'A01', ms: 3000, scene: 'black', captions: [card('台风进港那天夜里')], rain: 0.5, cues: [{ at: 1600, cue: 'thunder' }] },
  { id: 'A02', ms: 5000, scene: 'phone-news', fadeIn: true, carry: 1, rain: 0.8,
    captions: [say('新闻', '气象局通知：受台风影响，滨科夫沿海地区潮水异常上涨，请各单位做好应急防护措施……')], cues: [{ at: 200, cue: 'beep' }] },
  { id: 'A03', ms: 5000, scene: 'shed', beat: 'sitting', captions: [], rain: 0.9, flashes: [3600], cues: [{ at: 3900, cue: 'thunder' }] },
  { id: 'A04', ms: 5000, scene: 'phone-videos', captions: [line('沿海地区不明物质'), line('动物变异？专家谈污染危害')], rain: 0.8, cues: [{ at: 300, cue: 'beep' }] },
  { id: 'A05', ms: 3000, scene: 'shed', beat: 'appear', captions: [say('老王', '喂！')], rain: 0.9, flashes: [150],
    cues: [{ at: 150, cue: 'crack' }, { at: 700, cue: 'drop' }] },
  { id: 'A06', ms: 5000, scene: 'shed', beat: 'pickup', captions: [say('老张', '你吓我一跳。已经都弄好了，还不给人歇歇。')], rain: 0.9 },
  { id: 'A07', ms: 5000, scene: 'shed', beat: 'look', captions: [say('老张', '等会，那是什么东西？'), say('老王', '什么？')], rain: 0.6 },
  { id: 'A08', ms: 6000, scene: 'harbor', captions: [], rain: 0.8, flashes: [1500, 4300],
    cues: [{ at: 1700, cue: 'thunder' }, { at: 4200, cue: 'scrape' }] },
  { id: 'A09', ms: 6000, scene: 'shed', beat: 'call', captions: [say('老王', '嗯，好，我们先去看看情况。'), say('老王', '老板让我们先去看看。')], rain: 0.9 },
  { id: 'A10', ms: 3000, scene: 'beach', captions: [], rain: 1, cues: [{ at: 300, cue: 'wade' }, { at: 1500, cue: 'wade' }] },
  { id: 'A11', ms: 5000, scene: 'bow', captions: [say('老张', '被水淹了？海盐？')], rain: 0.6, cues: [{ at: 800, cue: 'drip' }, { at: 2600, cue: 'drip' }] },
  { id: 'A12', ms: 3000, scene: 'hatch', beat: 'shout', captions: [say('老张', '喂，你们的船怎么回事？')], rain: 0.5 },
  { id: 'A13', ms: 4000, scene: 'hatch', beat: 'turn', captions: [say('老王', '你怎么回事？')], rain: 0.5, cues: [{ at: 900, cue: 'step' }, { at: 2200, cue: 'step' }, { at: 3400, cue: 'step' }] },
  { id: 'A14', ms: 3000, scene: 'hatch-near', captions: [], rain: 0.4, cues: [{ at: 600, cue: 'crush' }, { at: 1900, cue: 'crush' }] },
  { id: 'A15', ms: 3000, scene: 'retreat', captions: [line('你，你站那不要动！')], rain: 0.4, cues: [{ at: 300, cue: 'heart' }, { at: 1300, cue: 'heart' }, { at: 2300, cue: 'heart' }] },
  { id: 'A16', ms: 3000, scene: 'face', captions: [], rain: 0.2, cues: [{ at: 1500, cue: 'shriek' }] },
  { id: 'A17', ms: 5000, scene: 'ship-full', captions: [{ text: '满船嘶吼', sound: true }], rain: 0.6, flashes: [300, 1900],
    cues: [{ at: 100, cue: 'roar' }, { at: 450, cue: 'thunder' }, { at: 1200, cue: 'roar' }, { at: 2050, cue: 'thunder' }, { at: 2400, cue: 'roar' }, { at: 4000, cue: 'splash' }] },
  // Part two: sixteen days
  { id: 'B01', ms: 3000, scene: 'black', captions: [card('那天夜里，海堤漫了顶。')], rain: 0.3, cues: [{ at: 300, cue: 'surge' }] },
  { id: 'B02', ms: 6000, scene: 'flood', fadeIn: true, captions: [line('人们纷纷逃离此地，可是异常的潮水淹没了离开的路。')], wind: 0.7 },
  { id: 'B03', ms: 8000, scene: 'street', captions: [line('数以万计的人们与怪物一起被困在此地，'), line('使滨科夫成为秩序不存的封锁区。')], wind: 0.4,
    cues: [{ at: 200, cue: 'crowd' }, { at: 4200, cue: 'crowd' }] },
  { id: 'B04', ms: 5000, scene: 'ship-day', captions: [line('有人说，是那艘船把来自深海的诅咒带到了滨科夫。')], wind: 0.8 },
  // Part three: the sixteenth night
  { id: 'C01', ms: 9000, scene: 'shelter', fadeIn: true, indoor: true, rain: 0.3,
    captions: [line('你本来只是开车进县装一趟货。'), line('你躲在城中村一栋烂尾楼里，战战兢兢地透过编织袋的缝隙往下看。')] },
  { id: 'C02', ms: 6000, scene: 'gap', indoor: true, rain: 0.3, captions: [line('为了生存与财富，劫掠、杀戮与背叛在滨科夫不断上演。')],
    cues: [{ at: 400, cue: 'bang' }, { at: 1100, cue: 'bang' }, { at: 1800, cue: 'crowd' }] },
  { id: 'C03', ms: 4000, scene: 'bottles', indoor: true, captions: [line('十六天过去，你的补给耗尽了。')], cues: [{ at: 2200, cue: 'crush' }] },
  { id: 'C04', ms: 10000, scene: 'roof', wind: 0.8,
    captions: [line('没有月亮的后半夜，水涨上来，你爬上了楼顶的水箱。'), line('西南边旧渔港那头亮着一团黄光，一整夜都没灭。')] },
  { id: 'C05', ms: 9000, scene: 'roof-sit', wind: 0.6, captions: [line('你拥有的，只有一句听来的情报：'), line('“水产站聚集着很多幸存者，他们全副武装，物资充足。”')] },
  { id: 'C06', ms: 4000, scene: 'lane', fadeIn: true, wind: 0.3, captions: [line('天一亮，你朝那团光走去。')],
    cues: [{ at: 300, cue: 'wade' }, { at: 1300, cue: 'wade' }, { at: 2300, cue: 'wade' }, { at: 3300, cue: 'wade' }] },
  // Part four: the title card into the yard
  { id: 'D01', ms: 3000, scene: 'black', captions: [card('第十七天　滨科夫水产站')] },
];

/** Minimum time a caption stays up: characters / 6 + 0.8 s, at least 1.6 s (OP-06). Speaker prefixes do not count. */
export const minCaptionMs = (text: string) => Math.max(1600, Math.round(([...text].length / 6 + 0.8) * 1000));

export interface TimedShot extends Shot { start: number; end: number }
export interface TimedCaption extends Caption { shot: string; start: number; end: number }

/** Lay the shots end to end and spread each shot's captions over its window, slack shared out evenly. */
export function layout(shots: readonly Shot[] = SHOTS) {
  const timed: TimedShot[] = [];
  let at = 0;
  for (const shot of shots) { timed.push({ ...shot, start: at, end: at + shot.ms }); at += shot.ms; }
  const captions: TimedCaption[] = [];
  timed.forEach((shot, i) => {
    if (!shot.captions.length) return;
    const window = timed[i + (shot.carry ?? 0)].end - shot.start;
    const needs = shot.captions.map(c => minCaptionMs(c.text));
    const slack = Math.max(0, window - needs.reduce((s, n) => s + n, 0)) / needs.length;
    let t = shot.start;
    shot.captions.forEach((c, k) => {
      const end = k === needs.length - 1 ? shot.start + window : Math.round(t + needs[k] + slack);
      captions.push({ ...c, shot: shot.id, start: t, end });
      t = end;
    });
  });
  return { shots: timed, captions, total: at };
}

export const TIMELINE = layout();

/** The shot playing at time t (clamped to the last shot). */
export function shotAt(t: number, shots: readonly TimedShot[] = TIMELINE.shots): TimedShot {
  let lo = 0, hi = shots.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (shots[mid].start <= t) lo = mid; else hi = mid - 1; }
  return shots[lo];
}
export function captionAt(t: number, captions: readonly TimedCaption[] = TIMELINE.captions): TimedCaption | null {
  return captions.find(c => c.start <= t && t < c.end) ?? null;
}
