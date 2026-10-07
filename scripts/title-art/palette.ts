/**
 * Title scene palette. Material ramps run dark → light and extend the game's
 * src/art/pixel.ts colours (marked *) with the minimum in-between values needed
 * for lighting. Index 0 is transparent. Lighting shifts a pixel along its own ramp.
 */
export const RAMPS = {
    // Cool blue-grey steel: walls in shadow, ink, outlines. * #122027 #24373d #425a60 #829c9d #bdcfca
    steel: ['#081115', '#0d181d', '#122027', '#1a2a30', '#24373d', '#2f454b', '#3a5157', '#425a60', '#5b7577', '#829c9d', '#a3b9b6', '#bdcfca'],
    // Sea and painted metal. * #305458 #508b89 #9fc7bb
    teal: ['#0c1f23', '#132d32', '#1b3b40', '#305458', '#3c6466', '#508b89', '#72a59e', '#9fc7bb'],
    // Slate paint for the door and window frames.
    slate: ['#111a22', '#18242e', '#22313c', '#2d404c', '#3a515d', '#4a6470', '#5f7b86', '#7b97a0', '#a1b7bb'],
    // Wood. * #5c4236 #996749 #cb9362
    wood: ['#170f0c', '#221713', '#30201a', '#422d23', '#5c4236', '#76523e', '#996749', '#b37b52', '#cb9362', '#e0ae78', '#f0cb94'],
    // Brass and warm lamp light. * #c09a55 #f0cf83
    brass: ['#2e2416', '#4a3a22', '#6e5630', '#967540', '#c09a55', '#dcb769', '#f0cf83', '#f8e4ae', '#fff5d6'],
    // Paper and pale cream. * #c2b68e #ece3bf
    paper: ['#3b392f', '#56523f', '#777055', '#9a9070', '#c2b68e', '#dbd1a9', '#ece3bf', '#f7f1da'],
    // Olive canvas and cloth. * #485c4b #7d9168 #b4bf89
    cloth: ['#161b15', '#20271d', '#2b3427', '#364332', '#485c4b', '#5f7457', '#7d9168', '#9aa978', '#b4bf89'],
    // Rust and signal red. * #723c3a #b65046 #e28a6c
    rust: ['#221211', '#3a1d1a', '#55292a', '#723c3a', '#8e4a3d', '#b65046', '#cc6f52', '#e28a6c'],
    // Overcast dusk sky and fog.
    sky: ['#17252c', '#1e2e36', '#263840', '#2f434a', '#394e55', '#455b61', '#52686c', '#617777', '#728684', '#869893', '#9eaea6', '#b9c5bb'],
} as const;
export type RampName = keyof typeof RAMPS;

/** Semi-transparent ramps (hex, alpha 0–255) for light pools, fog and mist overlays. */
export const ALPHA_RAMPS = {
    glow: [['#f0cf83', 16], ['#f0cf83', 30], ['#f4d995', 48], ['#f8e4ae', 72], ['#fff1cc', 110], ['#fff8e4', 180]],
    mist: [['#a9b9b2', 14], ['#a9b9b2', 26], ['#b4c3bb', 42], ['#c2cfc6', 62], ['#d2ddd4', 90]],
    shade: [['#081115', 40], ['#081115', 80], ['#081115', 120], ['#081115', 170]],
} as const;
export type AlphaRampName = keyof typeof ALPHA_RAMPS;

export type Colour = { r: number; g: number; b: number; a: number };
const parse = (hex: string, a = 255): Colour => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a });

export const PALETTE: Colour[] = [{ r: 0, g: 0, b: 0, a: 0 }];
/** For each palette index: owning ramp and position within it. */
export const RAMP_OF: { ramp: number[]; level: number }[] = [{ ramp: [0], level: 0 }];
function addRamp(colours: readonly (readonly [string, number])[]) {
    const ramp: number[] = [];
    for (const [hex, alpha] of colours) { ramp.push(PALETTE.length); PALETTE.push(parse(hex, alpha)); }
    ramp.forEach((index, level) => { RAMP_OF[index] = { ramp, level }; });
    return ramp;
}
export const R = {} as Record<RampName, number[]>;
for (const [name, colours] of Object.entries(RAMPS) as [RampName, readonly string[]][]) R[name] = addRamp(colours.map(hex => [hex, 255] as const));
export const A = {} as Record<AlphaRampName, number[]>;
for (const [name, colours] of Object.entries(ALPHA_RAMPS) as [AlphaRampName, readonly (readonly [string, number])[]][]) A[name] = addRamp(colours);
if (PALETTE.length > 256) throw new Error('Title palette exceeds 256 entries');

/** Shift a palette index along its material ramp, clamped at both ends. */
export function shift(index: number, steps: number): number {
    if (!index || !steps) return index;
    const { ramp, level } = RAMP_OF[index];
    return ramp[Math.max(0, Math.min(ramp.length - 1, level + steps))];
}
/** Ramp colour by name and level, clamped. */
export const c = (ramp: RampName, level: number) => R[ramp][Math.max(0, Math.min(R[ramp].length - 1, Math.round(level)))];
