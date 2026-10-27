// Validate delivered PNG bytes and native-pixel contracts, without relying on the exporter to self-report.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';

const manifest = JSON.parse(await readFile('assets/mall/manifest.json', 'utf8'));
const previous = JSON.parse(execFileSync('git', ['show', '60a0d938753baf12eeaa376bcf333668e0dc44cd:assets/mall/manifest.json'], { encoding: 'utf8' }));
const sources = JSON.parse(await readFile('docs/mall-2-5d/m2/p0-sources.json', 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
assert(manifest.revision === 5, 'Expected manifest revision 5');
assert(new Set(manifest.assets.map(a => a.id)).size === manifest.assets.length, 'Duplicate asset id');
for (const a of previous.assets) assert(JSON.stringify(a) === JSON.stringify(manifest.assets.find(b => b.id === a.id)), `Legacy metadata changed: ${a.id}`);
for (const s of sources.sources) assert(sha(await readFile(s.file)) === s.sha256, `Source hash: ${s.file}`);
const delivery = manifest.assets.filter(a => a.batch === 'm2-p0');
assert(delivery.length === 64 && delivery.filter(a => a.kind === 'prop').length === 58, 'P0 coverage');
const byId = Object.fromEntries(manifest.assets.map(a => [a.id, a]));
const browser = await chromium.launch(browserOptions), page = await browser.newPage();
const decoded = new Map();
try {
  for (const a of manifest.assets) {
    const bytes = await readFile(a.file);
    assert(sha(bytes) === a.sha256, `PNG hash: ${a.id}`);
    assert(bytes.readUInt32BE(16) === a.w && bytes.readUInt32BE(20) === a.h, `PNG size: ${a.id}`);
    if (a.batch !== 'm2-p0') continue;
    assert(a.w === a.footprint[0] * 32 && a.h === a.footprint[1] * 32 + a.lift, `Projection canvas: ${a.id}`);
    assert(a.anchor[0] === 0 && a.anchor[1] === a.h, `South anchor: ${a.id}`);
    assert(a.sourceSha256 === sources.sources.find(s => s.file === a.source)?.sha256, `Source provenance: ${a.id}`);
    const pixels = await page.evaluate(async url => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [...g.getImageData(0, 0, c.width, c.height).data];
    }, `data:image/png;base64,${bytes.toString('base64')}`);
    decoded.set(a.id, pixels);
    const colours = new Set(); let opaque = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      const alpha = pixels[p + 3]; assert(alpha === 0 || alpha === 255, `Non-binary alpha: ${a.id}`);
      if (alpha) { opaque++; colours.add(pixels.slice(p, p + 3).join(',')); }
    }
    assert(opaque > 0, `Empty PNG: ${a.id}`);
    assert(colours.size <= 28, `Pixel palette: ${a.id}`);
    if (a.collision === 'B') assert(opaque === a.w * a.h, `B cabinet must fill entire projected footprint: ${a.id}`);
    if (a.emit) assert(byId[a.emit]?.kind === 'emit', `Missing emit: ${a.id}`);
  }
  let masks = 0, seams = 0;
  for (const a of delivery.filter(a => a.emit)) {
    const body = decoded.get(a.id), mask = decoded.get(a.emit); masks++;
    for (let p = 0; p < body.length; p += 4) if (mask[p + 3]) assert(mask.slice(p, p + 4).every((v, i) => v === body[p + i]), `Emission outside authored body: ${a.id}`);
  }
  const groups = [...new Set(delivery.filter(a => a.tile === 'ew' && a.kind === 'prop').map(a => a.id.replace(/-(end-w|end-e|mid-a|mid-b|single)-v1$/, '')))];
  for (const group of groups) {
    const pieces = ['end-w', 'mid-a', 'mid-b', 'end-e'].map(role => byId[`${group}-${role}-v1`]);
    for (let i = 0; i < 3; i++) {
      const left = pieces[i], right = pieces[i + 1], l = decoded.get(left.id), r = decoded.get(right.id);
      for (let y = 0; y < left.h; y++) for (let k = 0; k < 4; k++) assert(l[(y * left.w + left.w - 1) * 4 + k] === r[y * right.w * 4 + k], `Open-edge seam: ${left.id} -> ${right.id} row ${y}`);
      seams++;
    }
  }
  const report = { status: 'PASS', browser: browser.version(), manifestRevision: manifest.revision,
    totalAssets: manifest.assets.length, legacyAssetsUnchanged: previous.assets.length, sourceHashes: sources.sources.length,
    deliveryPngs: delivery.length, bodies: 58, masks, joinedPairs: seams,
    checks: ['all PNG SHA-256 and dimensions', 'legacy metadata unchanged', 'source provenance', 'binary alpha', '28-colour native palette',
      'footprint/lift canvas and south anchor', 'B full footprint', 'nonempty emit masks only on authored body pixels', 'matching open-edge RGBA at every row'],
    runtimeIntegration: 'PENDING: new IDs registered; layout-4 procedural dressing fallback retained', remaining: ['M2 P1', 'M2 P2', 'M2 P3', 'in-game visual acceptance', 'human/device review'] };
  await writeFile('docs/mall-2-5d/m2/p0-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
