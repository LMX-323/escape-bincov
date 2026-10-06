/**
 * Shared geometry for the pixel watch-room title scene. The asset generator paints
 * to these rectangles and the runtime places them, so both always agree.
 * All values are logical pixels on the game's 960×540 canvas (one art pixel each).
 */
export const SCENE_W = 960, SCENE_H = 540;

/** Depth groups and their maximum pointer parallax, in whole logical pixels. */
export const GROUPS = {
    far: { x: 1, y: 1 },
    harbor: { x: 3, y: 2 },
    room: { x: 5, y: 3 },
    lamp: { x: 6, y: 3 },
    desk: { x: 7, y: 3 },
    chair: { x: 9, y: 4 },
    fore: { x: 12, y: 5 },
} as const;
export type GroupName = keyof typeof GROUPS;

export type LayerSpec = {
    key: string;
    group: GroupName;
    x: number; y: number; w: number; h: number;
    /** Horizontal frame count for sprite sheets; frames are laid out left to right. */
    frames?: number;
    /** Painted for the HTML overlay instead of the Phaser scene. */
    html?: boolean;
};

const margin = (group: GroupName) => ({ x: GROUPS[group].x + 1, y: GROUPS[group].y + 1 });
const full = (key: string, group: GroupName, h = SCENE_H): LayerSpec => {
    const m = margin(group);
    return { key, group, x: -m.x, y: -m.y, w: SCENE_W + m.x * 2, h: h + m.y * 2 };
};

/** Draw order, back to front. */
const layers = {
    sky: full('title-sky', 'far', 420),
    fogHigh: { key: 'title-fog-high', group: 'far', x: 0, y: 128, w: 320, h: 44 },
    fogLow: { key: 'title-fog-low', group: 'far', x: 0, y: 168, w: 384, h: 40 },
    harbor: full('title-pier', 'harbor', 420),
    boat: { key: 'title-boat', group: 'harbor', x: 352, y: 86, w: 156, h: 216 },
    mooring: { key: 'title-mooring', group: 'harbor', x: 350, y: 222, w: 120, h: 80, frames: 3 },
    room: full('title-room', 'room'),
    lamp: { key: 'title-lamp', group: 'lamp', x: 548, y: 0, w: 156, h: 124, frames: 5 },
    desk: { key: 'title-desk', group: 'desk', x: 392, y: 232, w: 576, h: 312 },
    light: { key: 'title-light', group: 'desk', x: 452, y: 96, w: 360, h: 300 },
    radioFx: { key: 'title-radio-fx', group: 'desk', x: 0, y: 0, w: 16, h: 8, frames: 4 },
    chair: { key: 'title-chair', group: 'chair', x: 244, y: 352, w: 196, h: 196 },
    fore: { key: 'title-fore', group: 'fore', x: 862, y: -6, w: 112, h: 552, frames: 5 },
    sparks: { key: 'title-sparks', group: 'far', x: 0, y: 0, w: 8, h: 4, frames: 8 },
    rain: { key: 'title-rain', group: 'harbor', x: 0, y: 0, w: 6, h: 16, frames: 3 },
    wordmark: { key: 'title-wordmark', group: 'fore', x: 0, y: 0, w: 0, h: 0, html: true },
} satisfies Record<string, LayerSpec>;
export type LayerName = keyof typeof layers;
export const LAYERS: Record<LayerName, LayerSpec> = layers;

/** Openings in the room layer, used to bound outdoor effects (rain, fog, glints). */
export const OPENINGS = {
    door: { x: 348, y: 24, w: 156, h: 360 },
    window: { x: 612, y: 28, w: 300, h: 236 },
} as const;

/** Anchors that animated pieces share with the static painting. */
export const ANCHORS = {
    /** Lamp cord fixing point on the ceiling beam and bulb centre at rest (frame 2). */
    lampPivot: { x: 626, y: 14 },
    lampBulb: { x: 626, y: 104 },
    /** Radio dial window on the desk layer (scene coordinates). */
    radioDial: { x: 668, y: 296 },
    radioLed: { x: 716, y: 284 },
    /** Mooring bollard on the pier and the boat bow cleat at rest. */
    bollard: { x: 452, y: 300 },
    horizon: 196,
} as const;

/** Far shore lights: painted reflections below them, runtime twinkle on top. */
export const FAR_LIGHTS: readonly (readonly [number, number, 'warm' | 'red'])[] = [
    [366, 191, 'warm'], [394, 189, 'warm'], [441, 192, 'warm'], [493, 190, 'warm'], [471, 70, 'red'],
    [628, 190, 'warm'], [661, 188, 'warm'], [706, 191, 'warm'], [742, 189, 'warm'], [797, 192, 'warm'],
    [833, 187, 'warm'], [861, 190, 'warm'], [899, 191, 'warm'], [777, 48, 'red'], [871, 66, 'red'], [705, 98, 'red'],
];
