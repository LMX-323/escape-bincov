import { CanvasSource, ImageSource, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { LAYERS, type LayerName } from './layout';

/** Decoded title layers (filled by ./art's loadTitleArt at boot) and the first decode failure. */
const decoded = new Map<LayerName, HTMLImageElement>();
let failure = '';
export const decodedTitleLayer = (name: LayerName, image: HTMLImageElement) => { decoded.set(name, image); };
export function failTitleArt(reason: string) {
    if (!failure) console.error('Title artwork failed to decode; showing the plain menu backdrop.', reason);
    failure ||= reason;
}

/** Layers that move by subpixels (parallax, sway, bob): sampled linearly, everything else nearest. */
const MOVING = new Set<LayerName>(['room', 'lamp', 'desk', 'chair', 'fore', 'boat', 'light', 'radioFx']);
const TEXEL_SCALE = 2;
const frames = new Map<LayerName, Texture[]>();

/**
 * The frames of one decoded layer, created once and kept for the page's life (menu re-entries reuse them).
 *
 * Moving layers expand each painted pixel without mixing it with its neighbours before linear sampling, so filtering
 * spans half a painted pixel rather than smearing two enlarged ones: grid layers already hold 2 texels per art pixel and
 * are sampled as they are; one-texel layers get a nearest 2x copy. Still layers keep nearest sampling.
 */
export function titleFrames(name: LayerName): Texture[] {
    let list = frames.get(name);
    if (list) return list;
    const image = decoded.get(name);
    if (!image) throw new Error(`Title layer not decoded: ${name}`);
    const spec = LAYERS[name], moving = MOVING.has(name);
    let source: TextureSource, texel = spec.res ?? 1;
    if (moving && texel === 1) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width * TEXEL_SCALE; canvas.height = image.height * TEXEL_SCALE;
        const context = canvas.getContext('2d')!;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        source = new CanvasSource({ resource: canvas, scaleMode: 'linear' });
        texel = TEXEL_SCALE;
    } else source = new ImageSource({ resource: image, scaleMode: moving ? 'linear' : 'nearest' });
    const count = spec.frames ?? 1, fw = spec.w * texel, fh = spec.h * texel;
    list = count > 1 ? Array.from({ length: count }, (_, i) => new Texture({ source, frame: new Rectangle(i * fw, 0, fw, fh) })) : [new Texture({ source })];
    frames.set(name, list);
    return list;
}
/** A decoded layer's pixels (the water samples the boat's hull from it). */
export const titleImage = (name: LayerName) => decoded.get(name) ?? null;
/** Title textures created so far (checks assert re-entering the menu never adds more). */
export const titleTextureCount = () => [...frames.values()].reduce((n, list) => n + list.length, 0);

export const titleArtReady = () => !failure && decoded.size === Object.values(LAYERS).filter(layer => !layer.html).length;
