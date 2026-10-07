/** Prepare derived art; source PNGs are never overwritten by this command. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LAYERS, type LayerName } from '../../src/title/layout';
import { decodePng, encodePng, type RGBA } from './png';
import { RES, sample, extractPalette, quantize, clean, texture, type Cells, type Region } from './pixel-grid';
import { RESERVED, touchRoom, touchDesk } from './touch';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const path = (name: string) => 'assets/title/' + name + '.png';
const read = (name: string) => decodePng(readFileSync(path(name)));
const file = (name: LayerName) => path(LAYERS[name].key);
const sourceFiles = ['sources/wordmark-industrial-v4', ...['master', 'room', 'desk', 'chair', 'fore', 'lamp', 'harbor', 'boat', 'pier'].map(n => 'sources/master-v3/' + n + '-v3')];
const master = (name: string) => read('sources/master-v3/' + name + '-v3');
/** Five sway frames around the fixed suspension; rows shift by whole art pixels (3 texels). */
function lampStrip(src: RGBA): RGBA {
    const w = src.w * 5, h = src.h, data = new Uint8Array(w * h * 4);
    for (let frame = 0; frame < 5; frame++) for (let y = 0; y < h; y++) for (let x = 0; x < src.w; x++) {
        const dx = x + 3 * Math.round((frame - 2) * y / h);
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
    const src = read('sources/wordmark-industrial-v4'), ink = (p: number) => src.data[p + 3] >= 192 && src.data[p] > 190 && src.data[p + 1] > 172 && src.data[p + 2] > 130;
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
        if (png.w !== spec.w * (spec.res ?? 1) * (spec.frames ?? 1) || png.h !== spec.h * (spec.res ?? 1) || e.x !== spec.x || e.y !== spec.y || e.frames !== (spec.frames ?? 1))
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
        // Registered areas: source rectangle ↔ logical scene rectangle (unchanged from the
        // previous preparation). Everything below shares one grid and one palette.
        const full = (name: string, lx: number, ly: number, lw: number, lh: number): Region => {
            const src = master(name), k = src.w / 960;
            return { src, sx: lx * k, sy: ly * k, sw: lw * k, sh: lh * k, lx, ly, lw, lh };
        };
        const regions = {
            harbor: full('harbor', 0, 0, 960, 540),
            room: full('room', 0, 0, 960, 540),
            chair: full('chair', 250, 372, 320, 168),
            desk: full('desk', 392, 238, 568, 302),
            fore: full('fore', 810, 0, 150, 540),
            boat: { src: master('boat'), sx: 484, sy: 55, sw: 507, sh: 712, lx: LAYERS.boat.x, ly: LAYERS.boat.y, lw: LAYERS.boat.w, lh: LAYERS.boat.h },
            lamp: { src: master('lamp'), sx: 896, sy: 12, sw: 368, sh: 302, lx: LAYERS.lamp.x, ly: LAYERS.lamp.y, lw: LAYERS.lamp.w, lh: LAYERS.lamp.h },
            pier: (() => { const src = master('pier'); return { src, sx: 0, sy: 0, sw: src.w, sh: src.h, lx: 0, ly: 28, lw: 960, lh: 540 }; })(),
        } satisfies Record<string, Region>;
        const cells = Object.fromEntries(Object.entries(regions).map(([n, r]) => [n, sample(r)])) as Record<keyof typeof regions, Cells>;
        const palette = extractPalette(Object.values(cells), 64, RESERVED);
        for (const c of Object.values(cells)) { quantize(c, palette); clean(c, palette); }
        touchRoom(cells.room, palette);
        touchDesk(cells.desk, palette);
        const tex = (name: keyof typeof regions, layer: LayerName) => { const L = LAYERS[layer]; return texture(cells[name], palette, regions[name], L.x, L.y, L.w, L.h); };
        const derived: Record<string, RGBA> = {
            'title-sky-ready': tex('harbor', 'sky'),
            'title-harbor-ready': tex('harbor', 'harbor'),
            'title-room-ready': tex('room', 'room'),
            'title-wordmark-industrial-v4': wordmark(),
            'title-chair-master-v3': tex('chair', 'chair'),
            'title-desk-master-v3': tex('desk', 'desk'),
            'title-fore-master-v3': tex('fore', 'fore'),
            'title-boat-master-v3': tex('boat', 'boat'),
            'title-lamp-master-v3': lampStrip(tex('lamp', 'lamp')),
            'title-pier-master-v3': tex('pier', 'pierFront'),
            'title-mooring-master-v3': mooringStrip(),
        };
        writeFileSync('assets/title/palette.json', JSON.stringify({ grid: '640x360', logicalPerArtPixel: 1.5, texelsPerLogical: RES, colours: palette.rgb.map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')), reservedFrom: palette.reservedFrom }, null, 2) + '\n');
        for (const [name, im] of Object.entries(derived))
            writeFileSync(path(name), encodePng(im));
        const layers: Record<string, unknown> = {};
        let pngBytes = 0, rgbaBytes = 0;
        for (const name of Object.keys(LAYERS) as LayerName[]) {
            const spec = LAYERS[name], bytes = readFileSync(file(name)), im = decodePng(bytes);
            if (im.w !== spec.w * (spec.res ?? 1) * (spec.frames ?? 1) || im.h !== spec.h * (spec.res ?? 1))
                throw new Error(name + ': invalid image size');
            pngBytes += bytes.length;
            rgbaBytes += im.w * im.h * 4;
            layers[name] = { file: file(name), ...spec, frameWidth: spec.w * (spec.res ?? 1), frameHeight: spec.h * (spec.res ?? 1), frames: spec.frames ?? 1, bytes: bytes.length, sha256: sha(bytes), pixelSha256: sha(im.data), provenance: name === 'wordmark' ? 'ImageGen, one-ink nearest-neighbour preparation' : name === 'mooring' ? 'Deterministic native pixel-line frames' : name === 'lamp' ? 'ImageGen cutout, registered crop and fixed-suspension row-shift frames' : spec.res ? 'ImageGen master-v3 layer on the shared 640x360 pixel grid and palette' + (name === 'room' || name === 'desk' ? ', with hand passes (scripts/title-art/touch.ts)' : '') : name === 'sparks' || name === 'rain' || name === 'radioFx' || name.startsWith('fog') ? 'Existing deterministic effect sprite' : 'Imported ImageGen pixel layer' };
        }
        const sources = Object.fromEntries(sourceFiles.map(n => [path(n), sha(readFileSync(path(n)))]));
        mkdirSync('assets/title', { recursive: true });
        writeFileSync('assets/title/manifest.json', JSON.stringify({ schema: 2, generator: 'scripts/title-art/generate.ts', note: 'Unified master-v3 sources are immutable. Preparation resamples every registered layer onto one 640x360 art-pixel grid with one shared palette (assets/title/palette.json), stores grid layers at 2 texels per logical pixel, applies hand passes, extrudes parallax edges and derives lamp/mooring frames. All runtime imports are validated.', sources, layers, totals: { pngBytes, rgbaBytes } }, null, 2) + '\n');
        validateTitleArt();
        console.log('Prepared 11 registered derivatives and verified runtime manifest');
    }
}
