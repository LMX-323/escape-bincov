/** Prepare derived art; source PNGs are never overwritten by this command. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LAYERS, type LayerName } from '../../src/title/layout';
import { decodePng, encodePng, extrude, type RGBA } from './png';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const path = (name: string) => 'assets/title/' + name + '.png';
const read = (name: string) => decodePng(readFileSync(path(name)));
const file = (name: LayerName) => path(LAYERS[name].key);
const sourceFiles = ['title-sky-new', 'title-pier-new', 'title-room-new', 'sources/wordmark-industrial'];
function wordmark(): RGBA {
    const src = read('sources/wordmark-industrial'), ink = (p: number) => src.data[p + 3] >= 192 && src.data[p] > 190 && src.data[p + 1] > 172 && src.data[p + 2] > 130;
    let x0 = src.w, y0 = src.h, x1 = 0, y1 = 0;
    for (let y = 0; y < src.h; y++)
        for (let x = 0; x < src.w; x++)
            if (ink((y * src.w + x) * 4)) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
            }
    const { w, h } = LAYERS.wordmark, data = new Uint8Array(w * h * 4), s = Math.min((w - 2) / (x1 - x0 + 1), (h - 2) / (y1 - y0 + 1)), dw = Math.round((x1 - x0 + 1) * s), dh = Math.round((y1 - y0 + 1) * s);
    for (let y = 0; y < dh; y++)
        for (let x = 0; x < dw; x++) {
            const p = (Math.min(y1, y0 + Math.floor((y + .5) / s)) * src.w + Math.min(x1, x0 + Math.floor((x + .5) / s))) * 4;
            if (ink(p))
                data.set([228, 218, 184, 255], ((y + 1) * w + x + 1) * 4);
        }
    return { w, h, data };
}
export function validateTitleArt() {
    const manifest = JSON.parse(readFileSync('assets/title/manifest.json', 'utf8'));
    if (manifest.schema !== 2)
        throw new Error('Title manifest must describe imported art (schema 2)');
    if (Object.keys(manifest.layers).sort().join() !== Object.keys(LAYERS).sort().join())
        throw new Error('Title layer manifest is incomplete');
    for (const name of Object.keys(LAYERS) as LayerName[]) {
        const spec = LAYERS[name], e = manifest.layers[name], bytes = readFileSync(file(name)), png = decodePng(bytes);
        if (e.file !== file(name) || e.key !== spec.key || e.sha256 !== sha(bytes) || e.pixelSha256 !== sha(png.data))
            throw new Error(name + ': asset integrity mismatch');
        if (png.w !== spec.w * (spec.frames ?? 1) || png.h !== spec.h || e.x !== spec.x || e.y !== spec.y || e.frames !== (spec.frames ?? 1))
            throw new Error(name + ': layout/size/frame mismatch');
    }
    for (const [p, digest] of Object.entries(manifest.sources))
        if (sha(readFileSync(p)) !== digest)
            throw new Error('Source artwork changed: ' + p);
    return manifest;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/generate.ts')) {
    if (process.argv.includes('--check')) {
        validateTitleArt();
        console.log('Imported title assets and derivatives verified');
    }
    else {
        const derived: Record<string, RGBA> = { 'title-sky-ready': extrude(read('title-sky-new'), 2, 2), 'title-harbor-ready': extrude(read('title-pier-new'), 4, 3), 'title-room-ready': extrude(read('title-room-new'), 6, 4), 'title-wordmark-industrial': wordmark() };
        for (const [name, im] of Object.entries(derived))
            writeFileSync(path(name), encodePng(im));
        const layers: Record<string, unknown> = {};
        let pngBytes = 0, rgbaBytes = 0;
        for (const name of Object.keys(LAYERS) as LayerName[]) {
            const spec = LAYERS[name], bytes = readFileSync(file(name)), im = decodePng(bytes);
            if (im.w !== spec.w * (spec.frames ?? 1) || im.h !== spec.h)
                throw new Error(name + ': invalid image size');
            pngBytes += bytes.length;
            rgbaBytes += im.w * im.h * 4;
            layers[name] = { file: file(name), ...spec, frameWidth: spec.w, frameHeight: spec.h, frames: spec.frames ?? 1, bytes: bytes.length, sha256: sha(bytes), pixelSha256: sha(im.data), provenance: name === 'wordmark' ? 'ImageGen, one-ink nearest-neighbour preparation' : name === 'sky' || name === 'harbor' || name === 'room' ? 'Imported image with edge extrusion' : name === 'sparks' || name === 'rain' || name === 'radioFx' || name.startsWith('fog') ? 'Existing deterministic effect sprite' : 'Imported ImageGen pixel layer' };
        }
        const sources = Object.fromEntries(sourceFiles.map(n => [path(n), sha(readFileSync(path(n)))]));
        mkdirSync('assets/title', { recursive: true });
        writeFileSync('assets/title/manifest.json', JSON.stringify({ schema: 2, generator: 'scripts/title-art/generate.ts', note: 'Imported artwork is immutable. Preparation writes only four derived PNGs and this manifest. All runtime imports are validated.', sources, layers, totals: { pngBytes, rgbaBytes } }, null, 2) + '\n');
        validateTitleArt();
        console.log('Prepared borders, flat industrial wordmark and verified runtime manifest');
    }
}
