/** Logical artwork coordinates; imported source images remain immutable. */
export const SCENE_W = 960, SCENE_H = 540;
export const GROUPS = {
    far: { x: 1, y: 1 }, harbor: { x: 3, y: 2 }, room: { x: 5, y: 3 }, lamp: { x: 6, y: 3 }, desk: { x: 8, y: 4 }, chair: { x: 16, y: 7 }, fore: { x: 24, y: 10 },
} as const;
export type GroupName = keyof typeof GROUPS;
export type LayerSpec = {
    key: string;
    group: GroupName;
    x: number;
    y: number;
    w: number;
    h: number;
    frames?: number;
    html?: boolean;
};
const layers = {
    sky: { key: 'title-sky-ready', group: 'far', x: -2, y: -2, w: 964, h: 424 },
    harbor: { key: 'title-harbor-ready', group: 'harbor', x: -4, y: 21, w: 968, h: 426 },
    fogHigh: { key: 'title-fog-high-new', group: 'harbor', x: 0, y: 158, w: 320, h: 44 },
    fogLow: { key: 'title-fog-low-new', group: 'harbor', x: 0, y: 200, w: 384, h: 40 },
    boat: { key: 'title-boat-depth-v2', group: 'harbor', x: 335, y: 79, w: 164, h: 218 },
    mooring: { key: 'title-mooring-new', group: 'harbor', x: 350, y: 232, w: 120, h: 80, frames: 3 },
    pierFront: { key: 'title-pier-occluders-new', group: 'harbor', x: 0, y: 24, w: 960, h: 420 },
    room: { key: 'title-room-ready', group: 'room', x: -6, y: -4, w: 972, h: 548 },
    lamp: { key: 'title-lamp-new', group: 'lamp', x: 548, y: 0, w: 156, h: 124, frames: 5 },
    desk: { key: 'title-desk-depth-v2', group: 'desk', x: 350, y: 206, w: 656, h: 346 },
    light: { key: 'title-light-new', group: 'desk', x: 452, y: 96, w: 360, h: 300 },
    radioFx: { key: 'title-radio-fx-new', group: 'desk', x: 0, y: 0, w: 16, h: 8, frames: 4 },
    chair: { key: 'title-chair-depth-v2', group: 'chair', x: 247, y: 377, w: 292, h: 226 },
    fore: { key: 'title-fore-new', group: 'fore', x: 787, y: -24, w: 112, h: 552, frames: 5 },
    sparks: { key: 'title-sparks-new', group: 'harbor', x: 0, y: 0, w: 8, h: 4, frames: 8 },
    rain: { key: 'title-rain-new', group: 'harbor', x: 0, y: 0, w: 6, h: 16, frames: 3 },
    wordmark: { key: 'title-wordmark-industrial', group: 'fore', x: 0, y: 0, w: 144, h: 66, html: true },
} satisfies Record<string, LayerSpec>;
export type LayerName = keyof typeof layers;
export const LAYERS: Record<LayerName, LayerSpec> = layers;
export const OPENINGS = {
    door: { x: 340, y: 14, w: 161, h: 426 }, window: { x: 736, y: 47, w: 171, h: 258 },
    windowLeft: { x: 618, y: 73, w: 96, h: 213 }, windowTopLeft: { x: 619, y: 0, w: 93, h: 67 },
    windowTopRight: { x: 731, y: 0, w: 176, h: 51 }, doorGlass: { x: 293, y: 61, w: 26, h: 162 },
} as const;
export const ANCHORS = {
    lampPivot: { x: 626, y: 14 }, lampBulb: { x: 624, y: 100 }, radioDial: { x: 670, y: 310 }, radioLed: { x: 702, y: 294 },
    bollard: { x: 370, y: 307 }, boatBow: { x: 467, y: 240 }, horizon: 196,
} as const;
/** Registered bright pixels on the imported harbour. */
export const FAR_LIGHTS: readonly (readonly [
    number,
    number,
    'warm' | 'red'
])[] = [
    [375, 180, 'warm'], [605, 185, 'warm'], [652, 178, 'warm'], [764, 175, 'warm'], [842, 178, 'warm'], [831, 146, 'red'], [707, 170, 'red'],
];
