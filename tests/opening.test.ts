import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOTS, TIMELINE, captionAt, layout, minCaptionMs, shotAt } from '../src/opening/timeline';
import { openingAutoplay, resetOpeningGate } from '../src/opening/gate';

/** Section 3 of the storyboard: one row per shot (id, seconds, captions with their speakers). */
function storyboard() {
  const doc = readFileSync('docs/OPENING-CUTSCENE-SCRIPT.md', 'utf8');
  const board = doc.slice(doc.indexOf('## 3. 分镜'), doc.indexOf('## 4. 原稿'));
  return board.split('\n').filter(l => /^\| [A-D]\d\d /.test(l)).map(l => {
    const cells = l.split('|').slice(1, -1).map(s => s.trim());
    const captions = cells[3] === '—' || cells[3].startsWith('（同上）') ? [] : cells[3].split('<br>')
      .map(s => s.replace(/（[^）]*）$/, '').trim()).filter(Boolean)
      .map(s => s.replace(/^(新闻|老张|老王|你)：/, '$1|'))
      .map(s => s.includes('|') ? s : `|${s}`);
    return { id: cells[0], sec: Number(cells[1]), captions };
  });
}

test('the timeline matches the storyboard shot for shot: ids, seconds and every caption word for word', () => {
  const doc = storyboard();
  assert.deepEqual(SHOTS.map(s => s.id), doc.map(r => r.id));
  for (const [i, shot] of SHOTS.entries()) {
    assert.equal(shot.ms, doc[i].sec * 1000, `${shot.id} duration`);
    const ours = shot.captions.map(c => `${c.speaker ?? ''}|${c.sound ? `［${c.text}］` : c.text}`);
    assert.deepEqual(ours, doc[i].captions, `${shot.id} captions`);
  }
});

test('the cut runs about 2:19 and the parts keep their agreed lengths', () => {
  assert.equal(TIMELINE.total, 139_000);
  const part = (p: string) => SHOTS.filter(s => s.id.startsWith(p)).reduce((n, s) => n + s.ms, 0);
  assert.deepEqual(['A', 'B', 'C', 'D'].map(part), [72_000, 22_000, 42_000, 3_000]);
});

test('shots are laid end to end and every caption stays up at least its reading time (OP-06)', () => {
  const { shots, captions } = TIMELINE;
  shots.forEach((s, i) => assert.equal(s.start, i ? shots[i - 1].end : 0));
  assert.equal(minCaptionMs('喂！'), 1600);
  assert.equal(minCaptionMs('台风进港那天夜里'), 2133);
  for (const c of captions) assert.ok(c.end - c.start >= minCaptionMs(c.text), `${c.shot} ${c.text}`);
  for (let i = 1; i < captions.length; i++) assert.ok(captions[i].start >= captions[i - 1].end, `overlap at ${captions[i].shot}`);
  // A02's news line runs on through A03, which has no caption of its own.
  const news = captions.find(c => c.shot === 'A02')!;
  assert.equal(news.end, shots.find(s => s.id === 'A03')!.end);
});

test('lookups find the shot and caption at a time', () => {
  assert.equal(shotAt(0).id, 'A01');
  assert.equal(shotAt(2999).id, 'A01');
  assert.equal(shotAt(3000).id, 'A02');
  assert.equal(shotAt(TIMELINE.total + 5000).id, 'D01');
  assert.equal(captionAt(100)?.text, '台风进港那天夜里');
  assert.equal(captionAt(TIMELINE.total - 1)?.text, '第十七天　滨科夫水产站');
  assert.equal(layout([{ id: 'X01', ms: 1000, scene: 'black', captions: [] }]).total, 1000);
});

test('lightning keeps to three flashes a second and cues fall inside their shots (OP-05)', () => {
  for (const s of SHOTS) {
    const f = s.flashes ?? [];
    for (let i = 1; i < f.length; i++) assert.ok(f[i] - f[i - 1] >= 1000, `${s.id} strikes too close`);
    for (const at of [...f, ...(s.cues ?? []).map(c => c.at)]) assert.ok(at >= 0 && at < s.ms, `${s.id} event at ${at}`);
  }
});

test('autoplay only for a new save with nothing to resume; test pages opt in', () => {
  resetOpeningGate();
  assert.equal(openingAutoplay(0, false, ''), true);
  assert.equal(openingAutoplay(1, false, ''), false);
  assert.equal(openingAutoplay(0, true, ''), false);
  assert.equal(openingAutoplay(0, false, '?test=1'), false);
  assert.equal(openingAutoplay(0, false, '?test=1&opening=auto'), true);
});
