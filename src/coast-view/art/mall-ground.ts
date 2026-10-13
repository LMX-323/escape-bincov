/**
 * Ground chunks of a mall floor: Sol's floor samples per cell (64 px samples drawn by world-tile parity, so they tile
 * across chunk edges), mud on the tidal flats, the drop to the street beside the second floor, the flat clutter decals,
 * then the shared shading pass (wear, contact occlusion at wall feet) with cast shadows from walls and furniture.
 * A pure function of the bake and the chunk rectangle, like the coast ground.
 */
import type { MapDef, Rect } from '../../raid-runtime/contract';
import { canvas, dot, hash, rect } from './paint';
import { shadowMask, tile } from './ground';
import { shadeGround, type GroundGeometry } from './surface';
import type { SolArt } from './sol';

export interface MallGroundBake {
  /** Wall mask (drawn walls and blocking furniture), materials (wear, mud) and the noise lattices. */
  geo: GroundGeometry;
  /** Floor sample per cell, or null where the procedural ground paints (drop, tidal mud). */
  floor: (HTMLCanvasElement | null)[][];
  /** 1 where the cell is the drop beside the second floor. */
  drop: Uint8Array;
  decals: readonly { c: HTMLCanvasElement; x: number; y: number }[];
  /** Cells whose wall sprite stands on the ground: they cast a short shadow to the lower right. */
  walls: readonly { x: number; y: number }[];
  /** Furniture footprints (world px) and standing height above the footprint. */
  feet: readonly { x: number; y: number; w: number; h: number; lift: number }[];
}

export function paintMallGround(m: MapDef, b: Rect, bake: MallGroundBake, art: SolArt | null): HTMLCanvasElement {
  const { c, g } = canvas(b.w, b.h), geo = bake.geo;
  rect(g, '#1b1d1c', 0, 0, b.w, b.h);
  g.imageSmoothingEnabled = false;
  // One tile of margin so shadows that cross a chunk edge are drawn on both sides.
  const x0 = Math.floor(b.x / 32) - 1, y0 = Math.floor(b.y / 32) - 1, x1 = Math.ceil((b.x + b.w) / 32) + 1, y1 = Math.ceil((b.y + b.h) / 32) + 1;
  for (let ty = Math.max(0, y0); ty < Math.min(m.rows, y1); ty++) for (let tx = Math.max(0, x0); tx < Math.min(m.cols, x1); tx++) {
    const X = tx * 32 - b.x, Y = ty * 32 - b.y;
    if (bake.drop[ty * m.cols + tx]) { paintDrop(g, tx, ty, X, Y, !!bake.drop[(ty - 1) * m.cols + tx] || ty === 0); continue; }
    const f = bake.floor[ty][tx];
    if (!f) tile(g, geo.mat, tx, ty, X, Y, art);
    else if (f.width >= 64) g.drawImage(f, (tx & 1) * 32, (ty & 1) * 32, 32, 32, X, Y, 32, 32);
    else g.drawImage(f, X, Y);
  }
  for (const d of bake.decals) if (d.x < b.x + b.w && d.x + d.c.width > b.x && d.y < b.y + b.h && d.y + d.c.height > b.y) g.drawImage(d.c, d.x - b.x, d.y - b.y);
  // Light falls from the upper left: walls and furniture darken the floor to their lower right, a little more for taller
  // pieces. One mask, so neighbouring pieces never darken twice.
  const rects: [number, number, number, number][] = [];
  const near = (x: number, y: number, w: number, h: number) => x < b.x + b.w + 32 && x + w > b.x - 32 && y < b.y + b.h + 32 && y + h > b.y - 32;
  const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < geo.cols && y < geo.rows && geo.wall[y * geo.cols + x] === 1;
  for (const w of bake.walls) {
    const X = w.x * 32 - b.x, Y = w.y * 32 - b.y;
    if (!near(w.x * 32, w.y * 32, 32, 32)) continue;
    const right = !wall(w.x + 1, w.y), below = !wall(w.x, w.y + 1);
    if (right) rects.push([X + 32, Y + 6, 8, 26]);
    if (below) rects.push([X + 6, Y + 32, 32, 5]);
    if (right && below && !wall(w.x + 1, w.y + 1)) rects.push([X + 32, Y + 32, 8, 5]);
  }
  for (const f of bake.feet) {
    if (!near(f.x, f.y, f.w, f.h)) continue;
    const sh = Math.round(2 + f.lift / 7);
    rects.push([f.x - b.x + 3 + sh, f.y - b.y + 3 + Math.round(sh * .6), f.w - 6, f.h - 6]);
  }
  const img = g.getImageData(0, 0, b.w, b.h);
  shadeGround(img.data, geo, b.x, b.y, b.w, b.h, shadowMask(rects, b.w, b.h));
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * The street two storeys down, seen past the edge of the second floor: near-black wet asphalt with faint lane paint and
 * the odd glint, and the shadow of the slab edge along the top of the drop.
 */
function paintDrop(g: CanvasRenderingContext2D, tx: number, ty: number, X: number, Y: number, open: boolean) {
  rect(g, (tx + ty) % 2 ? '#262928' : '#282b2a', X, Y, 32, 32);
  for (let i = 0; i < 5; i++) dot(g, i % 2 ? '#303433' : '#1e2120', X + Math.floor(hash(tx, ty, 140 + i) * 32), Y + Math.floor(hash(tx, ty, 150 + i) * 32));
  if (ty % 9 === 4 && hash(tx, ty, 160) > .3) rect(g, '#3a3c37', X + 4, Y + 15, 14, 1);
  if (hash(tx, ty, 170) < .06) { rect(g, '#36404a', X + 10, Y + 20, 3, 1); dot(g, '#4a5660', X + 11, Y + 19); }
  if (!open) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X, Y, 32, 6); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y + 6, 32, 4); }
}
