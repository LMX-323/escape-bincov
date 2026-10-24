// Cut the hurt and recovery frames out of the #96 pixel-v2 sheets into runtime PNGs under assets/coast/poses, and write
// their manifest and the importer src/coast-view/pose-assets.ts. Group A only (main's four enemy kinds); group B waits
// for #81. A sheet is 3 columns (idle, hurt, recovery) by 5 rows (E, SE, S, NE, N) at exactly 8x nearest-neighbour.
// Every 8x8 block must be one colour and column 0 must equal the runtime idle frame, or nothing is written.
// Usage: node --import tsx scripts/export-hurt-poses.ts [--check]
//   --check writes nothing: it compares the committed frames pixel for pixel (deflate output may differ between Node
//   versions) and the manifest and importer text with what the sheets give, and exits 1 on any difference.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, type RGBA } from './title-art/png';

/** [kind, logical width, logical height] of each sheet. */
export const POSE_KINDS = [['scav', 32, 48], ['salt', 32, 48], ['elite', 32, 48], ['creature', 40, 28]] as const;
/** [pose, sheet column, body frame index]: Sol's idle and walk frames are 0-4. */
export const POSES = [['hurt', 1, 5], ['recovery', 2, 6]] as const;
export const DIRS = ['e', 'se', 's', 'ne', 'n'] as const;
const SCALE = 8, OUT_DIR = 'assets/coast/poses';
export const MANIFEST = `${OUT_DIR}/manifest.json`, IMPORTER = 'src/coast-view/pose-assets.ts';
export const sheetPath = (kind: string) => `assets/hit-feel/sources/${kind}-hurt-sheet-pixel-v2.png`;
export const idlePath = (kind: string, dir: string) => `assets/coast/v1/coast-${kind}-body-${dir}-f0-v1.png`;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export type PoseAsset = { id: string; file: string; w: number; h: number; anchor: number[]; kind: string; dir: string;
  frameIndex: number; pose: string; sheet: string; sha256: string };

/** Fully transparent pixels match whatever colour they store (the templates went through a canvas, which clears it). */
export function samePixels(a: RGBA, b: RGBA): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.data.length; i += 4)
    if (!(a.data[i + 3] === 0 && b.data[i + 3] === 0) && [0, 1, 2, 3].some(k => a.data[i + k] !== b.data[i + k])) return false;
  return true;
}

/** The logical frame in a sheet cell; throws unless every 8x8 block is one colour. */
function cell(sheet: RGBA, row: number, col: number, w: number, h: number, name: string): RGBA {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const at = (dx: number, dy: number) => ((row * h * SCALE + y * SCALE + dy) * sheet.w + (col * w + x) * SCALE + dx) * 4, i0 = at(0, 0);
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) for (let k = 0; k < 4; k++)
      if (sheet.data[at(dx, dy) + k] !== sheet.data[i0 + k]) throw new Error(`${name} row ${row} column ${col}: block (${x},${y}) is not one colour`);
    data.set(sheet.data.subarray(i0, i0 + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}

/** The frames and their manifest entries (hashes still to fill in), and the source sheet hashes, computed in memory. */
export function cutPoses() {
  const coast = JSON.parse(readFileSync('assets/coast/manifest.json', 'utf8')) as { assets: { file: string; anchor: number[] }[] };
  const sources: Record<string, string> = {}, entries: { asset: PoseAsset; frame: RGBA }[] = [];
  for (const [kind, w, h] of POSE_KINDS) {
    const bytes = readFileSync(sheetPath(kind)), sheet = decodePng(bytes);
    if (sheet.w !== 3 * w * SCALE || sheet.h !== 5 * h * SCALE) throw new Error(`${sheetPath(kind)}: ${sheet.w}x${sheet.h}, want ${3 * w * SCALE}x${5 * h * SCALE}`);
    sources[sheetPath(kind)] = sha(bytes);
    for (const [row, dir] of DIRS.entries()) {
      if (!samePixels(cell(sheet, row, 0, w, h, kind), decodePng(readFileSync(idlePath(kind, dir))))) throw new Error(`${kind} ${dir}: column 0 is not the runtime idle frame`);
      const anchor = coast.assets.find(a => a.file === idlePath(kind, dir))?.anchor;
      if (!anchor) throw new Error(`${idlePath(kind, dir)} is not in assets/coast/manifest.json`);
      for (const [pose, col, frameIndex] of POSES) {
        const id = `coast-${kind}-body-${dir}-f${frameIndex}-v1`;
        entries.push({ asset: { id, file: `${OUT_DIR}/${id}.png`, w, h, anchor, kind, dir: dir.toUpperCase(), frameIndex, pose, sheet: sheetPath(kind), sha256: '' },
          frame: cell(sheet, row, col, w, h, kind) });
      }
    }
  }
  return { sources, entries };
}

export const manifestText = (sources: Record<string, string>, assets: readonly PoseAsset[]) => JSON.stringify({
  schema: 1,
  source: 'assets/hit-feel/sources/*-hurt-sheet-pixel-v2.png (#96)',
  generator: 'scripts/export-hurt-poses.ts',
  note: 'Runtime hurt (frame 5) and recovery (frame 6) bodies cut from the pixel-v2 sheets. Anchors are the idle frames\'.',
  sources,
  assets,
}, null, 2) + '\n';

export function importerText(assets: readonly { id: string; file: string }[]): string {
  const name = (a: { id: string }) => `p${a.id.replace(/^coast-/, '').replace(/-v1$/, '').replaceAll('-', '_')}`;
  return `/**
 * Hurt and recovery body frames (#75; art from #96 pixel-v2): frame indices 5 and 6 beside Sol's idle and walk frames
 * 0-4, named the same way, so Textures.actor and its flash, rim and edge find them by frame. Generated by
 * scripts/export-hurt-poses.ts from ${MANIFEST}; build.mjs checks every hash.
 */
${assets.map(a => `import ${name(a)} from '../../${a.file}';`).join('\n')}

const POSE_URLS: Readonly<Record<string, string>> = {
${assets.map(a => `  '${a.id}': ${name(a)},`).join('\n')}
};

let loaded: Promise<ReadonlyMap<string, HTMLCanvasElement>> | null = null;

/**
 * Decodes the pose frames once per page and adds them to a loaded coast art map under their manifest IDs. The map is
 * changed in place and returned, so a caller can chain it after loadCoastAssets. A failed decode rejects and is retried
 * on the next call, like the coast assets themselves.
 */
export async function withPoses(art: Map<string, HTMLCanvasElement>): Promise<Map<string, HTMLCanvasElement>> {
  loaded ??= Promise.all(Object.entries(POSE_URLS).map(([id, url]) => new Promise<[string, HTMLCanvasElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); if (!g) throw new Error('Canvas 2D unavailable');
        g.drawImage(img, 0, 0); resolve([id, c]);
      } catch (error) { reject(new Error(\`Pose frame failed to prepare: \${id}\`, { cause: error })); }
    };
    img.onerror = () => reject(new Error(\`Pose frame failed to decode: \${id}\`));
    img.src = url;
  }))).then(entries => new Map(entries)).catch(error => { loaded = null; throw error; });
  for (const [id, canvas] of await loaded) art.set(id, canvas);
  return art;
}
`;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/export-hurt-poses.ts')) {
  const { sources, entries } = cutPoses();
  if (process.argv.includes('--check')) {
    const problems: string[] = [], committed = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { assets: PoseAsset[] };
    entries.forEach(({ asset, frame }, i) => {
      const bytes = readFileSync(asset.file);
      if (!samePixels(decodePng(bytes), frame)) problems.push(`${asset.file}: pixels differ from the sheet`);
      asset.sha256 = committed.assets[i]?.sha256 ?? '';
      if (asset.sha256 !== sha(bytes)) problems.push(`${asset.file}: manifest hash differs from the file`);
    });
    if (readFileSync(MANIFEST, 'utf8') !== manifestText(sources, entries.map(e => e.asset))) problems.push(`${MANIFEST} is out of date`);
    if (readFileSync(IMPORTER, 'utf8') !== importerText(entries.map(e => e.asset))) problems.push(`${IMPORTER} is out of date`);
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log(`Pose frames up to date: ${entries.length} frames from ${Object.keys(sources).length} sheets.`);
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const { asset, frame } of entries) { const png = encodePng(frame); writeFileSync(asset.file, png); asset.sha256 = sha(png); }
    writeFileSync(MANIFEST, manifestText(sources, entries.map(e => e.asset)));
    writeFileSync(IMPORTER, importerText(entries.map(e => e.asset)));
    console.log(`Exported ${entries.length} pose frames from ${Object.keys(sources).length} sheets.`);
  }
}
