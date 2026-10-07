/** Title-scene motion rules without Phaser or DOM dependencies, so they can be unit tested. */

/** Largest frame step the scene will integrate; tab switches and stalls never fast-forward. */
export const MAX_STEP_MS = 50;
export const clampStep = (ms: number) => Math.max(0, Math.min(MAX_STEP_MS, Number.isFinite(ms) ? ms : 0));

/** Viewport position -> -1..1 on each axis, clamped (window edges and outside both saturate). */
export function normalizePointer(x: number, y: number, width: number, height: number) {
    const n = (v: number, size: number) => size > 0 ? Math.max(-1, Math.min(1, (v / size) * 2 - 1)) : 0;
    return { x: n(x, width), y: n(y, height) };
}

/** Frame-rate independent exponential follow with time constant `tau` seconds. */
export function follow(current: number, target: number, ms: number, tau: number) {
    if (tau <= 0) return target;
    const next = current + (target - current) * (1 - Math.exp(-ms / 1000 / tau));
    return Math.abs(next - target) < 1e-4 ? target : next;
}

/** Continuous layer translation. Pixel artwork must not imply a quantised camera. */
export const layerOffset = (camera: number, max: number) => {
    const v = -Math.max(-1, Math.min(1, camera)) * max;
    return v === 0 ? 0 : v;
};

/** Every condition must allow motion; any one of them stops the whole scene. */
export type MotionGate = { enabled: boolean; reduced: boolean; hidden: boolean; active: boolean };
export const motionAllowed = (g: MotionGate) => g.enabled && !g.reduced && !g.hidden && g.active;

/** Deterministic decoration RNG (mulberry32). Never shared with gameplay randomness. */
export function decorRandom(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** Smooth periodic value in -1..1 for a clock in ms. */
export const wave = (ms: number, periodMs: number, phase = 0) => Math.sin((ms / periodMs + phase) * Math.PI * 2);

/** Quantise -1..1 to a frame index among `frames`, centred on the middle frame. */
export function poseFrame(value: number, frames: number) {
    const half = (frames - 1) / 2;
    return Math.max(0, Math.min(frames - 1, Math.round(half + value * half)));
}

/** On/off blink with a duty cycle: true for the first `duty` fraction of each period. */
export const blink = (ms: number, periodMs: number, duty: number, phase = 0) => ((ms / periodMs + phase) % 1 + 1) % 1 < duty;

/** Stepped twinkle alpha (0, 0.5, 1) so glints change in whole states, not smooth fades. */
export function twinkle(ms: number, periodMs: number, phase: number) {
    const t = ((ms / periodMs + phase) % 1 + 1) % 1;
    return t < .55 ? 0 : t < .65 ? .5 : t < .8 ? 1 : t < .9 ? .5 : 0;
}
