/** Prepare derived art; source PNGs are never overwritten by this command. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LAYERS, type LayerName } from '../../src/title/layout';
import { decodePng, encodePng, extrude, type RGBA } from './png';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const path = (name: string) => 'assets/title/' + name + '.png';
const read = (name: string) => decodePng(readFileSync(path(name)));
const file = (name: LayerName) => path(LAYERS[name].key);
const sourceFiles = ['sources/wordmark-industrial', ...['master', 'room', 'desk', 'chair', 'fore', 'lamp', 'harbor', 'boat', 'pier'].map(n => 'sources/master-v3/' + n + '-v3')];
const master = (name: string) => read('sources/master-v3/' + name + '-v3');
/** Texture preparation only: preserve generated pixels/alpha with nearest sampling. */
function sampled(src: RGBA, w: number, h: number): RGBA {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (Math.min(src.h - 1, Math.floor((y + .5) * src.h / h)) * src.w + Math.min(src.w - 1, Math.floor((x + .5) * src.w / w))) * 4;
        data.set(src.data.subarray(p, p + 4), (y * w + x) * 4);
    }
    return { w, h, data };
}
function crop(src: RGBA, x: number, y: number, w: number, h: number): RGBA {
    if (x < 0 || y < 0 || x + w > src.w || y + h > src.h) throw new Error('Crop outside source');
    const data = new Uint8Array(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(src.data.subarray(((y + yy) * src.w + x) * 4, ((y + yy) * src.w + x + w) * 4), yy * w * 4);
    return { w, h, data };
}
function lampStrip(src: RGBA): RGBA {
    const w = src.w * 5, h = src.h, data = new Uint8Array(w * h * 4);
    for (let frame = 0; frame < 5; frame++) for (let y = 0; y < h; y++) for (let x = 0; x < src.w; x++) {
        const dx = x + Math.round((frame - 2) * y / h);
        if (dx < 0 || dx >= src.w) continue;
        data.set(src.data.subarray((y * src.w + x) * 4, (y * src.w + x + 1) * 4), (y * w + frame * src.w + dx) * 4);
    }
    return { w, h, data };
}
/** Native pixel line: fixed pier end, moving boat end, three small changes in sag. */
function mooringStrip(): RGBA {
    const fw = LAYERS.mooring.w, w = fw * 3, h = LAYERS.mooring.h, data = new Uint8Array(w * h * 4);
    for (let f = 0; f < 3; f++) for (let x = 0; x < fw - 6; x++) {
        const t = x / (fw - 7), y = Math.round(48 * (1 - t) + (9 + f) * t + 12 * Math.sin(t * Math.PI));
        data.set([141, 120, 78, 255], (y * w + f * fw + x) * 4);
        data.set([65, 69, 56, 255], ((y + 1) * w + f * fw + x) * 4);
    }
    return { w, h, data };
}
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
        const harbor = sampled(master('harbor'), 960, 540);
        const derived: Record<string, RGBA> = {
            'title-sky-ready': extrude(harbor, 2, 2),
            'title-harbor-ready': extrude(harbor, 4, 3),
            'title-room-ready': extrude(sampled(master('room'), 960, 540), 6, 4),
            'title-wordmark-industrial': wordmark(),
            'title-chair-master-v3': extrude(crop(sampled(master('chair'), 960, 540), 250, 372, 320, 168), 16, 7),
            'title-desk-master-v3': extrude(crop(sampled(master('desk'), 960, 540), 392, 238, 568, 302), 10, 6),
            'title-fore-master-v3': extrude(crop(sampled(master('fore'), 960, 540), 810, 0, 150, 540), 25, 11),
            'title-boat-master-v3': sampled(crop(master('boat'), 484, 55, 507, 712), LAYERS.boat.w, LAYERS.boat.h),
            'title-lamp-master-v3': lampStrip(sampled(crop(master('lamp'), 896, 12, 368, 302), LAYERS.lamp.w, LAYERS.lamp.h)),
            'title-pier-master-v3': sampled(master('pier'), 960, 540),
            'title-mooring-master-v3': mooringStrip(),
        };
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
            layers[name] = { file: file(name), ...spec, frameWidth: spec.w, frameHeight: spec.h, frames: spec.frames ?? 1, bytes: bytes.length, sha256: sha(bytes), pixelSha256: sha(im.data), provenance: name === 'wordmark' ? 'ImageGen, one-ink nearest-neighbour preparation' : name === 'mooring' ? 'Deterministic native pixel-line frames' : name === 'lamp' ? 'ImageGen cutout, registered crop and fixed-suspension row-shift frames' : name === 'sky' || name === 'harbor' || name === 'room' ? 'Imported image with edge extrusion' : name === 'sparks' || name === 'rain' || name === 'radioFx' || name.startsWith('fog') ? 'Existing deterministic effect sprite' : 'Imported ImageGen pixel layer' };
        }
        const sources = Object.fromEntries(sourceFiles.map(n => [path(n), sha(readFileSync(path(n)))]));
        mkdirSync('assets/title', { recursive: true });
        writeFileSync('assets/title/manifest.json', JSON.stringify({ schema: 2, generator: 'scripts/title-art/generate.ts', note: 'Unified master-v3 sources are immutable. Preparation crops/resamples registered layers, pads parallax edges and derives lamp/mooring frames. All runtime imports are validated.', sources, layers, totals: { pngBytes, rgbaBytes } }, null, 2) + '\n');
        validateTitleArt();
        console.log('Prepared 11 registered derivatives and verified runtime manifest');
    }
}
