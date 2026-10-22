import { inventoryArtSize, paintInventoryItem } from './inventory';
import { ITEM_ART_IDS, type ItemArtId } from './items';

const cache = new Map<string, string>();
/** Art painted once into a canvas and kept as a data URL (the same painters the 2.5D views use); '' without a 2D context. */
export function painted(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): string {
  let url = cache.get(key);
  if (url === undefined) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    if (c) { c.imageSmoothingEnabled = false; paint(c); }
    url = c ? canvas.toDataURL() : '';
    cache.set(key, url);
  }
  return url;
}

/** Items with drawn art; the rest show only their label. */
export const artId = (id: string) => (ITEM_ART_IDS as readonly string[]).includes(id) ? id as ItemArtId : null;

/** An item's inventory art at its own proportions (inventoryArtSize); an item without art gets a blank image. */
export function inventoryArtUrl(id: string): string {
  const [w, h] = inventoryArtSize(id), art = artId(id);
  return painted(`item-inventory-${id}`, w, h, c => { if (art) paintInventoryItem(c, art); });
}

/** The <img> for an item in an inventory cell, scaled by whole pixels to fit; '' for an item without art. */
export function itemArtwork(id: string, maxWidth: number, maxHeight: number, rotated = false) {
  const [w, h] = inventoryArtSize(id), url = artId(id) ? inventoryArtUrl(id) : '';
  const scale = Math.max(1, Math.floor(Math.min(maxWidth / (rotated ? h : w), maxHeight / (rotated ? w : h))));
  return url ? `<img class="inventory-art-image" data-art="${id}" width="${w * scale}" height="${h * scale}" style="width:${w * scale}px;height:${h * scale}px;${rotated ? 'transform:rotate(90deg)' : ''}" alt="" draggable="false" src="${url}">` : '';
}
