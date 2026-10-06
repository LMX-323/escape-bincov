/**
 * Title asset generator. Paints every layer deterministically and writes indexed PNGs
 * plus assets/title/manifest.json (sizes, frames, groups, file and pixel SHA-256).
 *
 *   node --import tsx scripts/title-art/generate.ts            write assets
 *   node --import tsx scripts/title-art/generate.ts --check    verify committed assets match the generator
 *   node --import tsx scripts/title-art/generate.ts --preview  also write review composites to test-results/title-art
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Pix } from './pix.ts';
import { PALETTE } from './palette.ts';
import { paintSky, paintFog } from './sky.ts';
import { paintHarbor, paintBoat, paintMooring } from './harbor.ts';
import { paintRoom } from './room.ts';
import { paintDesk, paintLamp, paintLight, paintChair, paintFore, paintSparks, paintRain, paintRadioFx } from './desk.ts';
import { paintWordmark } from './wordmark.ts';
import { LAYERS, type LayerName } from '../../src/title/layout.ts';
import { compose, rgbaPng, type Placed } from './preview.ts';

const painters: Record<LayerName, () => Pix | Pix[]> = {
    sky: paintSky, fogHigh: () => paintFog('fogHigh'), fogLow: () => paintFog('fogLow'),
    harbor: paintHarbor, boat: paintBoat, mooring: paintMooring, room: paintRoom,
    lamp: paintLamp, desk: paintDesk, light: paintLight, radioFx: paintRadioFx,
    chair: paintChair, fore: paintFore, sparks: paintSparks, rain: paintRain, wordmark: paintWordmark,
};

export function paintAll() {
    const out = {} as Record<LayerName, Pix>;
    for (const name of Object.keys(LAYERS) as LayerName[]) {
        const spec = LAYERS[name], painted = painters[name]();
        const pix = Array.isArray(painted) ? Pix.sheet(painted) : painted;
        const frames = spec.frames ?? 1;
        if (!spec.html && (pix.w !== spec.w * frames || pix.h !== spec.h)) throw new Error(`${name}: painted ${pix.w}×${pix.h}, expected ${spec.w * frames}×${spec.h}`);
        out[name] = pix;
    }
    return out;
}

const file = (name: LayerName) => `assets/title/${LAYERS[name].key}.png`;
const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
    const check = process.argv.includes('--check'), preview = process.argv.includes('--preview');
    const layers = paintAll();
    const manifest = {
        generator: 'scripts/title-art/generate.ts', palette: { entries: PALETTE.length, sha256: sha(Buffer.from(JSON.stringify(PALETTE))) },
        note: 'Deterministic procedural pixel art; no external images. Pixel hash covers palette indices, so it is independent of zlib output.',
        layers: {} as Record<string, unknown>,
    };
    let failed = false, rgbaBytes = 0, pngBytes = 0;
    for (const name of Object.keys(layers) as LayerName[]) {
        const pix = layers[name], spec = LAYERS[name], png = pix.png();
        const frames = spec.frames ?? 1;
        rgbaBytes += pix.w * pix.h * 4; pngBytes += png.length;
        manifest.layers[name] = {
            file: file(name), key: spec.key, group: spec.group, x: spec.x, y: spec.y,
            frameWidth: spec.html ? pix.w : spec.w, frameHeight: pix.h, frames, colours: pix.colours(),
            bytes: png.length, sha256: sha(png), pixelSha256: pix.pixelHash(),
        };
        if (check) {
            if (!existsSync(file(name))) { console.error(`missing ${file(name)}`); failed = true; continue; }
            const committed = Pix.decode(readFileSync(file(name)));
            if (committed.pixelHash() !== pix.pixelHash()) { console.error(`${file(name)} differs from the generator`); failed = true; }
        } else {
            mkdirSync('assets/title', { recursive: true });
            writeFileSync(file(name), png);
        }
    }
    Object.assign(manifest, { totals: { pngBytes, rgbaBytes, note: 'rgbaBytes = Σ width × height × 4; decoded texture estimate, not total GPU memory.' } });
    if (check) {
        const committed = JSON.parse(readFileSync('assets/title/manifest.json', 'utf8'));
        for (const [name, layer] of Object.entries(manifest.layers) as [string, any][]) {
            if (committed.layers[name]?.pixelSha256 !== layer.pixelSha256) { console.error(`manifest pixel hash differs for ${name}`); failed = true; }
        }
        if (failed) process.exit(1);
        console.log(`title assets match the generator (${Object.keys(layers).length} layers)`);
    } else {
        writeFileSync('assets/title/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
        console.log(`wrote ${Object.keys(layers).length} layers, ${(pngBytes / 1024).toFixed(1)} KiB PNG, ${(rgbaBytes / 1048576).toFixed(2)} MiB RGBA`);
    }
    if (preview) {
        mkdirSync('test-results/title-art', { recursive: true });
        const L = layers, place = (name: LayerName, frame = 0, dx = 0, dy = 0, extra: Partial<Placed> = {}): Placed =>
            ({ pix: L[name], x: LAYERS[name].x + dx, y: LAYERS[name].y + dy, frame, frames: LAYERS[name].frames ?? 1, ...extra });
        const scene = (k: number): Placed[] => {
            const g = (n: LayerName) => { const m = { far: 1, harbor: 3, room: 5, lamp: 6, desk: 7, chair: 9, fore: 12 }[LAYERS[n].group]; return [Math.round(m * k), Math.round(m * k * .4)] as const; };
            const tile = (n: 'fogHigh' | 'fogLow') => Array.from({ length: Math.ceil(960 / LAYERS[n].w) + 1 }, (_, i) => place(n, 0, i * LAYERS[n].w + g(n)[0], g(n)[1], { alpha: .75 }));
            return [place('sky', 0, ...g('sky')), ...tile('fogHigh'), ...tile('fogLow'), place('boat', 0, ...g('boat')), place('mooring', 1, ...g('mooring')), place('harbor', 0, ...g('harbor')),
                place('room', 0, ...g('room')), place('lamp', 2, ...g('lamp')), place('desk', 0, ...g('desk')), place('light', 0, ...g('light'), { add: true }),
                place('chair', 0, ...g('chair')), place('fore', 2, ...g('fore'))];
        };
        for (const [name, k] of [['rest', 0], ['left', -1], ['right', 1]] as const) writeFileSync(`test-results/title-art/scene-${name}.png`, rgbaPng(960, 540, compose(960, 540, scene(k)), name === 'rest' ? 2 : 1));
        const wm = L.wordmark; writeFileSync('test-results/title-art/wordmark.png', rgbaPng(wm.w, wm.h, compose(wm.w, wm.h, [{ pix: wm, x: 0, y: 0 }], [12, 22, 26]), 4));
        console.log('previews in test-results/title-art');
    }
}
