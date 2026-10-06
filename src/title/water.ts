import Phaser from 'phaser';
import { LAYERS, ANCHORS } from './layout';
import { decorRandom, wave } from './motion';
/** Pixel water is rendered between the harbour painting and its near-pier occluders. */
export function mountWater(scene: Phaser.Scene, group: Phaser.GameObjects.Container) {
    const shade = scene.add.graphics(), back = scene.add.graphics(), front = scene.add.graphics();
    shade.fillStyle(0x102a39, .15).fillRect(-4, ANCHORS.horizon, 968, 250);
    group.add([shade, back]);
    const source = scene.textures.get(LAYERS.boat.key).getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height), w = canvas.width, h = canvas.height;
    const bottoms = Array.from({ length: w }, (_, x) => {
        for (let y = h - 1; y >= 90; y--) {
            if (data[(y * w + x) * 4 + 3] > 192) return y;
        }
        return -1;
    });
    const rng = decorRandom(0x74a731);
    const ripples = Array.from({ length: 110 }, () => {
        const y = 198 + Math.floor(rng() * 174), x = 285 + Math.floor(rng() * 635), depth = (y - 196) / 174;
        return { x, y, width: 2 + Math.floor(depth * 9 + rng() * 5), period: 2600 + rng() * 4200, phase: rng() };
    });
    // The actual window lamps: these broken bands remain tied to their light sources.
    const bands = [{ x: 642, y: 190 }, { x: 766, y: 188 }, { x: 425, y: 190 }];
    let last = -1, lastBob = 0;
    function draw(ms: number, bob: number) {
        const step = Math.floor(ms / 120);
        if (step === last && bob === lastBob)
            return;
        last = step;
        lastBob = bob;
        back.clear();
        front.clear();
        for (const r of ripples) {
            const a = .055 + (wave(ms, r.period, r.phase) + 1) * .07;
            const dx = Math.round(wave(ms, r.period * 1.4, r.phase) * 2);
            back.fillStyle(0x92b4bb, a).fillRect(r.x + dx, r.y, r.width, 1);
        }
        for (const b of bands)
            for (let k = 0; k < 25; k++) {
                const y = b.y + 15 + k * 4, wide = 2 + Math.floor(k * .32), dx = Math.round(wave(ms, 3600, k * .123) * wide);
                back.fillStyle(0xd7ad67, .1 + (wave(ms, 4100, k * .27) + 1) * .055).fillRect(b.x + dx - wide / 2 | 0, y, wide, 1);
            }
        const bx = LAYERS.boat.x, by = LAYERS.boat.y;
        for (let x = 4; x < w - 4; x += 2) {
            const bottom = bottoms[x];
            if (bottom < 100)
                continue;
            const edge = by + bottom + bob;
            // Dark, narrow water touching the hull; follows its actual asymmetric contour.
            for (let d = 0; d < 22; d += 2) {
                const drift = Math.round(wave(ms, 5300, d * .031) * 2);
                back.fillStyle(0x0b1d29, .56 * (1 - d / 24)).fillRect(bx + x - 3 + drift, edge - 3 + d, 7, 2);
            }
            for (let d = 3; d < 46; d += 2) {
                const sy = Math.round(bottom - d * 3), p = (sy * w + x) * 4;
                if (sy < 0 || data[p + 3] < 192)
                    continue;
                if ((x + d + step) % 9 < 3)
                    continue;
                const warm = data[p] > 150 && data[p] > data[p + 2] * 1.5;
                const r = Math.round(data[p] * (warm ? .9 : .4)), g = Math.round(data[p + 1] * (warm ? .85 : .5)), b = Math.round(data[p + 2] * .6 + 8);
                const dx = Math.round(wave(ms, 4400, d * .037) * (.6 + d * .13));
                back.fillStyle((r << 16) | (g << 8) | b, (warm ? .85 : .65) * (1 - d / 55)).fillRect(bx + x + dx, by + bottom + d + Math.round(bob * .25), 4, 1);
            }
            const chop = Math.round(wave(ms, 3800, x * .019));
            // Water overlaps the last hull pixels: a cutout edge must not sit above the sea.
            front.fillStyle(0x183546, .94).fillRect(bx + x, edge - 5 + chop, 2, 7);
            if ((x + step) % 13 < 5)
                front.fillStyle(0x6e96a1, .58).fillRect(bx + x - 1, edge - 3 + chop, 4, 1);
        }
    }
    draw(0, 0);
    return { front, draw, get frame() { return last; } };
}
