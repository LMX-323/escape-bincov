/** Shared ink and material ramps. All edges rasterize to whole pixels, without antialiasing. */
export const C = {
  ink: '#122027', edge: '#24373d', steelDark: '#425a60', steel: '#829c9d', steelLight: '#bdcfca',
  paper: '#ece3bf', paperShade: '#c2b68e', brass: '#c09a55', brassLight: '#f0cf83',
  wood: '#996749', woodLight: '#cb9362', woodDark: '#5c4236',
  red: '#b65046', redLight: '#e28a6c', redDark: '#723c3a',
  teal: '#508b89', tealLight: '#9fc7bb', tealDark: '#305458',
  cloth: '#7d9168', clothLight: '#b4bf89', clothDark: '#485c4b',
};
export type PixelContext = CanvasRenderingContext2D;
export type Point = readonly [number, number];
export function brush(c: PixelContext) {
  const r = (color: string, x: number, y: number, w: number, h: number) => {
    c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const p = (color: string, points: readonly Point[]) => {
    const min = Math.min(...points.map(v => v[1])), max = Math.max(...points.map(v => v[1]));
    for (let y = Math.floor(min); y < max; y++) {
      const edges: number[] = [];
      points.forEach(([x1, y1], i) => {
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y + .5 && y2 > y + .5) || (y2 <= y + .5 && y1 > y + .5)) edges.push(x1 + (y + .5 - y1) * (x2 - x1) / (y2 - y1));
      });
      edges.sort((a, b) => a - b);
      for (let i = 0; i + 1 < edges.length; i += 2) {
        const start = Math.ceil(edges[i] - .5), end = Math.ceil(edges[i + 1] - .5);
        if (end > start) r(color, start, y, end - start, 1);
      }
    }
  };
  const e = (color: string, x: number, y: number, w: number, h: number) => {
    for (let row = 0; row < h; row++) {
      const half = w * .5 * Math.sqrt(1 - ((row + .5 - h / 2) / (h / 2)) ** 2);
      const start = Math.ceil(w / 2 - half - .5), end = Math.ceil(w / 2 + half - .5);
      r(color, x + start, y + row, end - start, 1);
    }
  };
  return { r, p, e };
}
