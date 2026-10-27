// Deterministic source-sheet export only; creative originals come from built-in image_gen.
// Run from repository root: node docs/mall-2-5d/m2/export-p0.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';

const root = 'docs/mall-2-5d/m2';
const roles = ['end-w', 'end-e', 'mid-a', 'mid-b', 'single'];
const specs = [
  ...['pharmacy', 'grocery', 'phones', 'hardware', 'clothes'].map(look => ({ name: `shelf-wall-${look}`, type: 'shelf-wall', look, w: 32, h: 80, front: .25, collision: 'B', run: true })),
  ...['service', 'diner', 'boutique', 'wood'].map(look => ({ name: `counter-${look}`, type: 'counter', look, w: 32, h: 56, frontY: { service: 414, diner: 430, boutique: 440, wood: 386 }[look], collision: 'M', run: true })),
  { name: 'glass-case', type: 'glass-case', w: 32, h: 58, front: .45, collision: 'M', run: true, emit: true },
  { name: 'kitchen-line', type: 'kitchen-line', w: 32, h: 56, front: .44, collision: 'B', run: true },
  { name: 'vending', type: 'vending', w: 32, h: 72, front: .135, collision: 'B', emit: true },
  { name: 'diner-table', type: 'diner-table', w: 64, h: 52, collision: 'M' },
  { name: 'checkout', type: 'checkout', w: 32, h: 88, collision: 'M' },
];
const sha = b => createHash('sha256').update(b).digest('hex');
const browser = await chromium.launch(browserOptions);
const page = await browser.newPage();
const assets = [], sources = [], reviews = [];
await mkdir('assets/mall/m2-p0', { recursive: true });
try {
  for (const spec of specs) {
    const source = `assets/mall/sources/m2-p0/${spec.name}.png`, bytes = await readFile(source);
    const exported = await page.evaluate(async ({ url, spec }) => {
      const img = new Image(); img.src = url; await img.decode();
      const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = img.width; sourceCanvas.height = img.height;
      const sg = sourceCanvas.getContext('2d'); sg.drawImage(img, 0, 0);
      const src = sg.getImageData(0, 0, img.width, img.height).data;
      const count = spec.run ? 5 : 1, crops = [];
      for (let i = 0; i < count; i++) {
        const lo = Math.round(i * img.width / count), hi = Math.round((i + 1) * img.width / count);
        const rows = new Uint32Array(img.height), cols = new Uint32Array(hi - lo);
        for (let y = 0; y < img.height; y++) for (let x = lo; x < hi; x++) {
          if (src[(y * img.width + x) * 4 + 3] >= 240) { rows[y]++; cols[x - lo]++; }
        }
        // Ignore isolated generation dust outside the main silhouette. The dining set has disconnected stools.
        const xs = Array.from(cols, (n, x) => n > img.height * .025 ? x + lo : -1).filter(x => x >= 0);
        const ys = Array.from(rows, (n, y) => n > (hi - lo) * .04 ? y : -1).filter(y => y >= 0);
        if (!xs.length || !ys.length) throw new Error(`Empty source ${spec.name}:${i}`);
        const x = xs[0], w = xs.at(-1) - x + 1;
        let y = ys[0];
        // Raised generated end fences must not change the height/depth of ordinary countertop modules.
        // Crop their body from the first dense countertop row. The standalone register keeps its authored top.
        if (spec.type === 'counter' && i < 4) y = ys.find(yy => rows[yy] >= w * .92) ?? y;
        const h = ys.at(-1) - y + 1;
        const canvas = document.createElement('canvas'); canvas.width = spec.w; canvas.height = spec.h;
        const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
        const split = spec.frontY ? spec.frontY - y : spec.front ? Math.round(h * spec.front) : null;
        if (split) {
          g.drawImage(img, x, y, w, split, 0, 0, spec.w, 32);
          g.drawImage(img, x, y + split, w, h - split, 0, 32, spec.w, spec.h - 32);
        } else g.drawImage(img, x, y, w, h, 0, 0, spec.w, spec.h);
        const pixels = g.getImageData(0, 0, spec.w, spec.h);
        // The authored vending lamp is narrower than one output sampling interval. Preserve its brightest
        // actual source pixel in the corresponding output bin rather than losing it between nearest samples.
        if (spec.name === 'vending') for (let yy = 32; yy < 65; yy++) for (let xx = 2; xx <= 4; xx++) {
          const x0 = Math.floor(x + xx * w / spec.w), x1 = Math.ceil(x + (xx + 1) * w / spec.w);
          const y0 = Math.floor(y + split + (yy - 32) * (h - split) / (spec.h - 32));
          const y1 = Math.ceil(y + split + (yy - 31) * (h - split) / (spec.h - 32));
          let best = null, light = 0;
          for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
            const p = (sy * img.width + sx) * 4, [r, gg, b, a] = src.slice(p, p + 4);
            if (a >= 240 && r > 150 && gg > 180 && b > 175 && gg >= r && r + gg + b > light) {
              best = src.slice(p, p + 4); light = r + gg + b;
            }
          }
          if (best) pixels.data.set(best, (yy * spec.w + xx) * 4);
        }
        for (let p = 0; p < pixels.data.length; p += 4) {
          pixels.data[p + 3] = pixels.data[p + 3] >= 128 ? 255 : 0;
          if (!pixels.data[p + 3]) pixels.data.fill(0, p, p + 4);
        }
        // Full B cabinets and modular counter bodies use their entire footprint. Repair only missing alpha
        // edge pixels using the closest opaque sample on the same row; do not invent product/detail pixels.
        if (spec.collision === 'B') for (let yy = 0; yy < spec.h; yy++) {
          const opaque = Array.from({ length: spec.w }, (_, xx) => xx).filter(xx => pixels.data[(yy * spec.w + xx) * 4 + 3]);
          if (!opaque.length) throw new Error(`Transparent body row ${spec.name}:${yy}`);
          for (let xx = 0; xx < spec.w; xx++) if (!pixels.data[(yy * spec.w + xx) * 4 + 3]) {
            const near = opaque.reduce((a, b) => Math.abs(b - xx) < Math.abs(a - xx) ? b : a);
            const p = (yy * spec.w + xx) * 4, q = (yy * spec.w + near) * 4;
            pixels.data.set(pixels.data.slice(q, q + 4), p);
          }
        }
        crops.push({ pixels, rect: [x, y, w, h], split });
      }
      // One shared 28-colour palette per material/look, weighted median-cut, no smoothing or dithering.
      const histogram = new Map();
      for (const { pixels } of crops) for (let p = 0; p < pixels.data.length; p += 4) if (pixels.data[p + 3]) {
        const c = Array.from(pixels.data.slice(p, p + 3), n => Math.min(255, Math.round(n / 8) * 8));
        const key = c.join(','); histogram.set(key, { c, n: (histogram.get(key)?.n ?? 0) + 1 });
      }
      const boxes = [[...histogram.values()]];
      const range = box => [0, 1, 2].map(k => Math.max(...box.map(p => p.c[k])) - Math.min(...box.map(p => p.c[k])));
      while (boxes.length < 28) {
        let bi = -1, score = -1, axis = 0;
        boxes.forEach((box, i) => { const rs = range(box), a = rs.indexOf(Math.max(...rs)), s = rs[a] * Math.sqrt(box.reduce((n, p) => n + p.n, 0));
          if (box.length > 1 && s > score) { bi = i; score = s; axis = a; } });
        if (bi < 0) break;
        const box = boxes.splice(bi, 1)[0].sort((a, b) => a.c[axis] - b.c[axis]);
        const half = box.reduce((n, p) => n + p.n, 0) / 2; let acc = 0, cut = 1;
        for (; cut < box.length - 1; cut++) { acc += box[cut - 1].n; if (acc >= half) break; }
        boxes.push(box.slice(0, cut), box.slice(cut));
      }
      const palette = boxes.map(box => { const n = box.reduce((a, p) => a + p.n, 0); return [0, 1, 2].map(k => Math.round(box.reduce((a, p) => a + p.c[k] * p.n, 0) / n)); });
      for (const { pixels } of crops) for (let p = 0; p < pixels.data.length; p += 4) if (pixels.data[p + 3]) {
        const dist = c => c.reduce((a, n, k) => a + (n - pixels.data[p + k]) ** 2, 0);
        pixels.data.set(palette.reduce((a, b) => dist(b) < dist(a) ? b : a), p);
      }
      // The open edge on every run module shares exactly the same two pixel columns and palette.
      // End caps remain on their closed outer edges. This avoids generated strip alignment drift at joins.
      if (spec.run) for (let i = 0; i < count; i++) for (let yy = 0; yy < spec.h; yy++) {
        const p = crops[i].pixels.data, master = crops[2].pixels.data, q = (yy * spec.w + 3) * 4;
        const edge = master.slice(q, q + 4);
        if (i === 1 || i === 2 || i === 3) for (const xx of [0, 1]) p.set(edge, (yy * spec.w + xx) * 4);
        if (i === 0 || i === 2 || i === 3) for (const xx of [spec.w - 2, spec.w - 1]) p.set(edge, (yy * spec.w + xx) * 4);
      }
      return crops.map(({ pixels, rect, split }) => {
        const c = document.createElement('canvas'); c.width = spec.w; c.height = spec.h;
        c.getContext('2d').putImageData(pixels, 0, 0);
        const mask = new ImageData(spec.w, spec.h); let emitPixels = 0;
        if (spec.emit) for (let yy = 0; yy < spec.h; yy++) for (let xx = 0; xx < spec.w; xx++) {
          const p = (yy * spec.w + xx) * 4, [r, g, b, a] = pixels.data.slice(p, p + 4);
          const roi = spec.name === 'vending' ? xx >= 2 && xx <= 4 && yy >= 32 && yy <= 64 : xx >= 2 && xx <= 29 && yy >= 32 && yy <= 38;
          if (roi && a && r > 100 && g > 135 && b > 130 && g >= r) { mask.data.set([r, g, b, 255], p); emitPixels++; }
        }
        const e = document.createElement('canvas'); e.width = spec.w; e.height = spec.h; e.getContext('2d').putImageData(mask, 0, 0);
        return { rect, split, png: c.toDataURL(), emit: spec.emit ? e.toDataURL() : null, emitPixels, palette };
      });
    }, { url: `data:image/png;base64,${bytes.toString('base64')}`, spec });
    sources.push({ file: source, sha256: sha(bytes), palette: exported[0].palette });
    for (let i = 0; i < exported.length; i++) {
      const e = exported[i], variant = spec.run ? roles[i] : null;
      const id = `mall-prop-${spec.name}${variant ? '-' + variant : ''}-v1`;
      const file = `assets/mall/m2-p0/${id}.png`, png = Buffer.from(e.png.split(',')[1], 'base64');
      const base = { w: spec.w, h: spec.h, footprint: [spec.w / 32, spec.name === 'checkout' ? 2 : 1],
        lift: spec.h - (spec.name === 'checkout' ? 64 : 32), anchor: [0, spec.h], frames: 1, source,
        sourceSha256: sha(bytes), sourceRect: e.rect, sourceTopRows: e.split, revision: 1, batch: 'm2-p0',
        exportMethod: 'Reviewed alpha crop; nearest-neighbour axis-aligned top/front projection; preserve authored subpixel vending lamp by brightest-source-bin sampling; hard alpha; shared 28-colour palette; two-column open-edge seam normalization. No creative redraw.',
        paletteSize: e.palette.length };
      await writeFile(file, png);
      const emitId = spec.emit ? id.replace(/-v1$/, '-emit-v1') : null;
      assets.push({ id, file, ...base, kind: 'prop', collision: spec.collision, tile: spec.run ? 'ew' : null, emit: emitId, variant, sha256: sha(png) });
      reviews.push({ id, w: spec.w, h: spec.h, png: e.png, run: !!spec.run, type: spec.name });
      if (emitId) {
        if (!e.emitPixels) throw new Error(`Empty emission mask: ${id}`);
        const eb = Buffer.from(e.emit.split(',')[1], 'base64'), ef = `assets/mall/m2-p0/${emitId}.png`;
        await writeFile(ef, eb);
        assets.push({ id: emitId, file: ef, ...base, kind: 'emit', collision: null, tile: spec.run ? 'ew' : null, emit: null, variant, sha256: sha(eb) });
      }
    }
  }
  const manifest = JSON.parse(await readFile('assets/mall/manifest.json', 'utf8'));
  manifest.assets = [...manifest.assets.filter(a => a.batch !== 'm2-p0'), ...assets];
  manifest.revision = 5;
  manifest.source = 'Sol batch 1 plus built-in image_gen M2 P0 shop delivery for issue #47; originals and prompts retained in repository';
  manifest.note = '1x PNG, alpha 0/255. M2 P0 shop art is registered for integration; procedural layout-4 fallback remains until the dressing table selects the new ids. P1-P3 pending.';
  await writeFile('assets/mall/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(`${root}/p0-sources.json`, JSON.stringify({ tool: 'built-in image_gen', browser: browser.version(), sources }, null, 2) + '\n');
  const review = await page.evaluate(async entries => {
    const c = document.createElement('canvas'); c.width = 1100; c.height = 3020;
    const g = c.getContext('2d'); g.fillStyle = '#292d2d'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    g.fillStyle = '#eee8d7'; g.font = 'bold 18px monospace'; g.fillText('M2 P0 / LEFT: 1x modules / RIGHT: 2x joined run / art delivery', 20, 30);
    const groups = [...new Set(entries.map(e => e.type))];
    for (let r = 0; r < groups.length; r++) {
      const row = entries.filter(e => e.type === groups[r]), yy = 62 + r * 210;
      g.fillStyle = '#d0c9b6'; g.font = '14px monospace'; g.fillText(groups[r], 20, yy + 15);
      let x = 220;
      for (const e of row) { const img = new Image(); img.src = e.png; await img.decode();
        g.drawImage(img, x, yy + 22, e.w, e.h);
        g.fillStyle = '#8eaaa5'; g.font = '10px monospace'; g.fillText(e.id.match(/(end-w|end-e|mid-a|mid-b|single)-v1$/)?.[1] ?? `${e.w}x${e.h}`, x, yy + 16);
        x += e.run ? 76 : 110;
      }
      if (row.length === 5) { x = 640; for (const i of [0, 2, 3, 1]) { const e = row[i], img = new Image(); img.src = e.png; await img.decode(); g.drawImage(img, x, yy + 22, e.w * 2, e.h * 2); x += e.w * 2; } }
    }
    return c.toDataURL();
  }, reviews);
  await writeFile(`${root}/p0-contact-sheet.png`, Buffer.from(review.split(',')[1], 'base64'));
  const overview = await page.evaluate(async entries => {
    const groups = [...new Set(entries.map(e => e.type))];
    const c = document.createElement('canvas'); c.width = 1540; c.height = 700;
    const g = c.getContext('2d'); g.fillStyle = '#292d2d'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    g.fillStyle = '#eee8d7'; g.font = 'bold 20px monospace'; g.fillText('M2 P0 / actual exported sprites at 3x / 14 shop looks', 24, 30);
    for (let i = 0; i < groups.length; i++) {
      const row = entries.filter(e => e.type === groups[i]), e = row.at(-1), img = new Image(); img.src = e.png; await img.decode();
      const x = (i % 7) * 220, y = 55 + Math.floor(i / 7) * 320;
      g.fillStyle = '#cfc7b3'; g.font = '13px monospace'; g.fillText(groups[i], x + 12, y + 18);
      g.drawImage(img, x + Math.floor((220 - e.w * 3) / 2), y + 45, e.w * 3, e.h * 3);
    }
    return c.toDataURL();
  }, reviews);
  await writeFile(`${root}/p0-overview.png`, Buffer.from(overview.split(',')[1], 'base64'));
  console.log(`Exported ${assets.length} M2 P0 PNGs (${reviews.length} bodies), manifest revision 5.`);
} finally { await browser.close(); }
