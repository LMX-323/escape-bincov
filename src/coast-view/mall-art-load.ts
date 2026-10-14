/**
 * Decode Sol's mall samples once per page (checked against the manifest size). Imported only on demand by the sample
 * entry: esbuild still inlines the PNGs, but the app's module graph and the Node tests never import them.
 */
import { MALL_ASSET_META, MALL_ASSET_URLS } from './mall-assets';

let loaded: Promise<Map<string, HTMLCanvasElement>> | null = null;
/** All samples or a rejection: a size different from the manifest rejects the load (the caller keeps placeholders). */
export function loadMallAssets(): Promise<Map<string, HTMLCanvasElement>> {
  loaded ??= Promise.all(Object.entries(MALL_ASSET_URLS).map(([id, url]) => new Promise<[string, HTMLCanvasElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const meta = MALL_ASSET_META[id];
        if (!meta || img.naturalWidth !== meta.w || img.naturalHeight !== meta.h) throw new Error(`size ${img.naturalWidth}x${img.naturalHeight}`);
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); if (!g) throw new Error('Canvas 2D unavailable');
        g.drawImage(img, 0, 0); resolve([id, c]);
      } catch (error) { reject(new Error(`Mall asset failed to prepare: ${id}`, { cause: error })); }
    };
    img.onerror = () => reject(new Error(`Mall asset failed to decode: ${id}`));
    img.src = url;
  }))).then(entries => new Map(entries)).catch(error => { loaded = null; throw error; });
  return loaded;
}
