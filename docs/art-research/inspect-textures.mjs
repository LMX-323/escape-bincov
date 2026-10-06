// Baseline diagnostic: arrange unchanged runtime textures, not a redesign/mockup.
import { chromium } from 'playwright';
import { browserOptions } from '../../scripts/browser-options.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const expectedHash = '2984e201d2b33c0f242e2c290f01425652463ef20b25df47b528471b4be5e731';
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(await readFile('dist/index.html')), expectedHash);
const out = 'test-results/art-textures';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url()); });
  const response = await page.goto('http://127.0.0.1:4173/?test=1');
  assert.equal(hash(await response.body()), expectedHash);
  await page.locator('[data-action="enter"]').waitFor();
  const entries = await page.evaluate(() => {
    const textures = window.__bincov.app.game.textures;
    const keys = ['player', 'player-knife', 'player-pistol', 'player-shotgun', 'player-carbine', 'scav', 'salt', 'elite', 'creature', 'loot', 'loot-crate', 'bullet', ...Object.keys(textures.list).filter(key => key.startsWith('item-')).sort()];
    return keys.map(key => {
      if (!textures.exists(key)) throw new Error(`Missing baseline texture: ${key}`);
      const source = textures.get(key).getSourceImage(), { width, height } = source;
      const pixels = source.getContext('2d').getImageData(0, 0, width, height).data;
      let left = width, top = height, right = -1, bottom = -1, occupied = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); occupied++;
      }
      return { key, width, height, alphaBounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, occupiedPixels: occupied, png: source.toDataURL() };
    });
  });
  assert.equal(entries.length, 32);
  const sheet = await context.newPage();
  await sheet.setContent(`<html lang="zh-CN"><style>
    *{box-sizing:border-box}body{margin:24px;background:#101a1c;color:#d7dcc9;font:14px sans-serif}
    h1{font-size:24px;margin:0 0 8px}p{margin:0 0 20px;color:#b3bfb0}
    main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
    article{background:#243332;padding:10px;height:188px}b{display:block;font:13px monospace;margin-bottom:12px}
    .images{height:112px;display:flex;align-items:center;gap:8px}img{image-rendering:pixelated;flex:none}
    small{display:block;color:#b3bfb0;margin-top:10px}
  </style><h1>main 基线纹理图录 · 尚未重绘</h1><p>原始 Canvas 纹理，左 1× / 右 3× 最近邻显示。未施加场景旋转、染色、光照；本图是诊断排列，不是游戏画面或设计稿。</p><main></main></html>`);
  await sheet.evaluate(entries => {
    const root = document.querySelector('main');
    for (const entry of entries) {
      const card = document.createElement('article'), title = document.createElement('b'), row = document.createElement('div'), label = document.createElement('small');
      title.textContent = entry.key; row.className = 'images'; label.textContent = `${entry.width} × ${entry.height} px`;
      for (const scale of [1, 3]) { const image = document.createElement('img'); image.src = entry.png; image.width = entry.width * scale; image.height = entry.height * scale; row.append(image); }
      card.append(title, row, label); root.append(card);
    }
  }, entries);
  await sheet.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const screenshot = await sheet.screenshot({ path: `${out}/baseline-textures.png`, fullPage: true });
  const report = { base: 'a34c7a1ba810919fc33d4fce158aba0a028a0f78', htmlSha256: expectedHash, browser: browser.version(), method: 'Unmodified main textures read through explicit test hook; separate diagnostic HTML contact sheet, native and nearest-neighbor 3x, DPR1. Not an in-game screenshot or proposed art.', screenshotSha256: hash(screenshot), textures: entries.map(({ png, ...entry }) => ({ ...entry, pngSha256: hash(Buffer.from(png.split(',')[1], 'base64')) })), errors, externalRequests };
  await writeFile(`${out}/textures.json`, JSON.stringify(report, null, 2) + '\n');
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ textures: entries.length, errors, externalRequests, screenshotSha256: report.screenshotSha256 }));
} finally { await browser.close(); }
