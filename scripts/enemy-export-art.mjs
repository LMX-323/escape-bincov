// Deterministic atlas slicing/resizing only. Creative source art is produced by built-in image_gen.
// Run after reviewing the versioned source PNGs; never overwrites legacy actor art.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const roles = ['raider-melee', 'raider-gunner', 'raider-lookout'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch(browserOptions);
const exportBrowser = browser.version();
const page = await browser.newPage();
const assets = [], sources = {};
await mkdir('assets/coast/enemy-v1', { recursive: true });
try {
  for (const role of roles) for (const part of ['sheet', 'corpse']) {
    const source = `assets/enemies/sources/${role}-${part}-v1.png`, bytes = await readFile(source);
    sources[source] = sha(bytes);
    const frames = await page.evaluate(async ({ url, part }) => {
      const img = new Image(); img.src = url; await img.decode();
      const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
      const ctx = src.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      function bounds(x, y, w, h) {
        let left = w, top = h, right = -1, bottom = -1;
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          if (pixels[((y + dy) * img.width + x + dx) * 4 + 3] < 16) continue;
          left = Math.min(left, dx); top = Math.min(top, dy); right = Math.max(right, dx); bottom = Math.max(bottom, dy);
        }
        if (right < left) throw new Error('Empty frame');
        return { left, top, right, bottom };
      }
      const cells = [];
      const rows = part === 'sheet' ? 5 : 1, cols = rows;
      for (let r = 0; r < rows; r++) for (let f = 0; f < cols; f++) {
        const x = Math.round(f * img.width / cols), y = Math.round(r * img.height / rows);
        const w = Math.round((f + 1) * img.width / cols) - x, h = Math.round((r + 1) * img.height / rows) - y;
        cells.push({ x, y, w, h, r, f, b: bounds(x, y, w, h) });
      }
      const top = Math.min(...cells.map(c => c.b.top)), bottom = Math.max(...cells.map(c => c.b.bottom));
      // One transform across all body frames keeps foot and gait offsets intact.
      const scale = 39 / (bottom - top + 1);
      return cells.map(c => {
        const out = document.createElement('canvas'); out.width = part === 'sheet' ? 32 : 48; out.height = part === 'sheet' ? 48 : 32;
        const g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        if (part === 'sheet') g.drawImage(src, c.x, c.y, c.w, c.h, 16 - c.w * scale / 2, 48 - (bottom + 1) * scale, c.w * scale, c.h * scale);
        else {
          const w = c.b.right - c.b.left + 1, h = c.b.bottom - c.b.top + 1, s = Math.min(42 / w, 26 / h);
          g.drawImage(src, c.b.left, c.b.top, w, h, (48 - w * s) / 2, (32 - h * s) / 2, w * s, h * s);
        }
        return { row: c.r, frame: c.f, width: out.width, height: out.height, data: out.toDataURL().split(',')[1] };
      });
    }, { url: `data:image/png;base64,${bytes.toString('base64')}`, part });
    for (const frame of frames) {
      const dir = ['e', 'se', 's', 'ne', 'n'][frame.row];
      const id = `coast-${role}-${part === 'sheet' ? `body-${dir}-f${frame.frame}` : 'corpse-e'}-v1`;
      const file = `assets/coast/enemy-v1/${id}.png`, png = Buffer.from(frame.data, 'base64');
      await writeFile(file, png);
      assets.push({ id, file, w: frame.width, h: frame.height, anchor: part === 'sheet' ? [16, 48] : [24, 16],
        kind: role, dir: part === 'sheet' ? dir.toUpperCase() : 'E', frameIndex: frame.frame,
        part: `coast-${role}`, grip: null, muzzle: null, sha256: sha(png), revision: 1,
        ...(part === 'sheet' ? { heldGripLocal: [16, 26] } : {}) });
    }
  }
} finally { await browser.close(); }
sources['assets/enemies/sources/prompts-v1.json'] = sha(await readFile('assets/enemies/sources/prompts-v1.json'));
await writeFile('assets/enemies/manifest.json', JSON.stringify({ schema: 1, mode: 'built-in image_gen', exportBrowser,
  provenance: 'Original generated game assets; prompts and source PNGs retained. No external downloaded art.',
  prompts: 'assets/enemies/sources/prompts-v1.json', sources, assets }, null, 2) + '\n');
const coast = JSON.parse(await readFile('assets/coast/manifest.json', 'utf8'));
coast.assets = [...coast.assets.filter(a => !a.file.startsWith('assets/coast/enemy-v1/')), ...assets];
await writeFile('assets/coast/manifest.json', JSON.stringify(coast, null, 2) + '\n');
const old = await readFile('src/coast-view/assets.ts', 'utf8');
const variable = id => 'a' + id.replaceAll('-', '_');
const imports = coast.assets.map(a => `import ${variable(a.id)} from '../../${a.file}';`).join('\n');
const entries = coast.assets.map(a => `  '${a.id}': ${variable(a.id)},`).join('\n');
await writeFile('src/coast-view/assets.ts', `/** Coast PNGs inlined for offline play; generated from assets/coast/manifest.json. */\n${imports}\n\nexport const COAST_ASSET_URLS: Readonly<Record<string, string>> = {\n${entries}\n};\n\n${old.slice(old.indexOf('let loaded:'))}`);
console.log(`Exported ${assets.length} enemy frames, ${coast.assets.length} total coast assets.`);
