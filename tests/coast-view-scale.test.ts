import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ZOOM_OUT, viewScale } from '../src/coast-view/view-scale';

const TILES = [24, 28] as const;
const rawFit = (W: number, H: number, tiles: 24 | 28) => Math.max(1, Math.min(W / (tiles * 32), H / (tiles === 28 ? 466 : 400)));
// The rules scene.ts resize() used before 'whole' became the default, copied verbatim as references.
const oldDefault = (W: number, H: number, tiles: 24 | 28) => {
  const tw = tiles * 32, th = tiles === 28 ? 466 : 400;
  let s = Math.max(1, Math.min(W / tw, H / th));
  if (Math.abs(s - Math.round(s)) < .08) s = Math.round(s);
  return s;
};
const oldCrisp = (W: number, H: number, tiles: 24 | 28) => Math.max(1, Math.round(Math.max(1, Math.min(W / (tiles * 32), H / (tiles === 28 ? 466 : 400)))));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('2.5D 视图缩放：常见画布默认取整数倍，1280x720、1366x768 与竖屏保持原来的小数倍', () => {
  const rows: [W: number, H: number, s: number, why: string][] = [
    [1280, 720, 1280 / 768, '1x would show 40 cells, 2x only 20'],
    [1366, 768, 1366 / 768, 'same band as 1280x720'],
    [1536, 864, 2, 'already whole'],
    [1600, 900, 2, '2.083 -> 2, 25x14.1 cells'],
    [1920, 1080, 2, '2.5 -> 2, 30x16.9 cells'],
    [1921, 1080, 2, 'one pixel wider stays whole'],
    [1920, 953, 2, 'maximized 1080p browser'],
    [2560, 1440, 3, '3.33 -> 3'],
    [2560, 1313, 3, 'maximized 1440p browser'],
    [2532, 1170, 3, '844x390@3 snaps from 2.925'],
    [2796, 1290, 3, '932x430@3'],
    [2402, 1082, 1082 / 400, '915x412@2.625: 2.705, 2x would show 35% more per axis'],
    [1170, 2532, 1170 / 768, 'portrait 390x844@3'],
    [2880, 1800, 3, '1440x900@2: 3.75 -> 3'],
  ];
  for (const [W, H, s, why] of rows) assert.ok(near(viewScale(W, H, 24), s), `${W}x${H}: ${viewScale(W, H, 24)} != ${s} (${why})`);
  assert.equal(viewScale(1920, 1080, 28), 2, '?view=28 at 1920x1080: 2.14 -> 2');
  assert.ok(near(viewScale(1280, 720, 28), 1280 / 896), '?view=28 at 1280x720 keeps 1.43');
  assert.equal(viewScale(1920, 1080, 24), viewScale(1920, 1080, 24, 'whole'), "the default mode is 'whole'");
});

test('2.5D 视图缩放：4/3 上限的边界（1024 与 2048 设备像素宽）两侧都固定', () => {
  // fit is exactly 4/3 at 1024 px and 8/3 at 2048 px wide: the whole number sits exactly on the bound and must win.
  assert.equal(viewScale(1024, 768, 24), 1, '1024x768: 32x24 cells at 1x');
  assert.ok(near(viewScale(1025, 768, 24), 1025 / 768), 'one device pixel wider is past the bound and keeps fit');
  assert.equal(viewScale(2048, 1536, 24), 2, 'iPad landscape 1024x768@2');
  assert.ok(near(viewScale(2049, 1200, 24), 2049 / 768), 'one device pixel wider keeps fit');
});

test("2.5D 视图缩放：?crisp=1 ('near') 与 ?crisp=0 ('fit') 保持旧规则", () => {
  assert.equal(viewScale(1280, 720, 24, 'near'), 2, 'M16: ?crisp=1 at 1280x720');
  assert.equal(viewScale(1920, 1080, 24, 'near'), 3);
  assert.equal(viewScale(1920, 1080, 24, 'fit'), 2.5, 'M16b: ?crisp=0 at 1920x1080 is the old picture');
  assert.ok(near(viewScale(1280, 720, 24, 'fit'), 1280 / 768));
});

test('2.5D 视图缩放：全尺寸扫描（两种格数）只取整数或原 fit，不放大、最多多看 1/3，旧模式逐值相同', () => {
  const bad: string[] = [];
  let sizes = 0, whole = 0;
  for (const tiles of TILES) for (let W = 320; W <= 3840; W++) for (let H = 240; H <= 2400; H++) {
    const fit = rawFit(W, H, tiles), s = viewScale(W, H, tiles), int = Number.isInteger(s);
    sizes++; if (int) whole++;
    const why = !int && s !== fit ? 'neither whole nor fit'
      : s > fit + .08 ? 'zooms in past the 0.08 snap'
      : s < MAX_ZOOM_OUT * fit - 1e-9 ? 'shows more than 4/3 of the design box'
      // A fractional scale is left only where no whole number qualifies: fit in (4/3, 1.92] or (8/3, 2.92].
      : !int && !(fit > 4 / 3 && fit <= 1.92 + 1e-9) && !(fit > 8 / 3 && fit <= 2.92 + 1e-9) ? 'fractional outside the documented bands'
      : viewScale(W, H, tiles, 'fit') !== oldDefault(W, H, tiles) ? "'fit' differs from the old default"
      : viewScale(W, H, tiles, 'near') !== oldCrisp(W, H, tiles) ? "'near' differs from the old ?crisp=1" : '';
    if (why && bad.length < 10) bad.push(`${W}x${H}/${tiles}: ${why} (s ${s}, fit ${fit})`);
  }
  assert.deepEqual(bad, []);
  assert.ok(whole / sizes > .7, `most sizes end whole: ${whole}/${sizes}`);
});
