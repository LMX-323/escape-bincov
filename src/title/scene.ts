import Phaser from 'phaser';
import { GROUPS, LAYERS, OPENINGS, ANCHORS, FAR_LIGHTS, SCENE_W, SCENE_H, type GroupName, type LayerName } from './layout';
import { titleArtReady } from './assets';
import { mountWater } from './water';
import { clampStep, normalizePointer, follow, layerOffset, motionAllowed, decorRandom, wave, poseFrame, blink, twinkle, type MotionGate } from './motion';

type Img = Phaser.GameObjects.Image;
type Glint = { img: Img; period: number; phase: number; still: number };
type Drop = { img: Img; x: number; y: number; speed: number; floor: number };
type Mote = { img: Img; x: number; y: number; vx: number; vy: number; phase: number };

/** Live controllers; tests assert re-entering the menu never leaves an extra one behind. */
let live = 0;
export const liveTitleControllers = () => live;

const SPARK = { warm: 0, warm2: 1, cool: 2, coolLong: 3, warmGlint: 4, warmLong: 5, red: 6, mote: 7 } as const;
const PIER = { top: 292, bottom: 424 };
const WIND = .26;

export type TitleController = ReturnType<typeof mountTitle>;

/**
 * Builds the layered watch-room scene in the Menu scene and owns all of its motion:
 * pointer parallax, lamp sway with its light pool, boat bob, rope sway, water glints,
 * far lights, radio needle, dust, fog drift and rain. A single gate (player toggle,
 * reduced motion, page visibility, scene active) stops every one of them together.
 */
export function mountTitle(scene: Phaser.Scene, motion: boolean) {
    live++;
    const rng = decorRandom(0x5eed71);
    const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const gate: MotionGate = { enabled: motion, reduced: reducedQuery.matches, hidden: document.hidden, active: true };
    const groups = {} as Record<GroupName, Phaser.GameObjects.Container>;
    for (const name of Object.keys(GROUPS) as GroupName[]) groups[name] = scene.add.container(0, 0);
    const art = titleArtReady();
    const img = (name: LayerName, frame = 0, x: number = LAYERS[name].x, y: number = LAYERS[name].y) => {
        const image = scene.add.image(x, y, LAYERS[name].key, LAYERS[name].frames ? frame : undefined).setOrigin(0);
        groups[LAYERS[name].group].add(image);
        return image;
    };

    if (!art) {
        // Decoding failed: keep a calm, readable backdrop; the HTML menu stays fully usable.
        groups.far.add(scene.add.rectangle(0, 0, SCENE_W, SCENE_H, 0x122021).setOrigin(0));
        document.documentElement.dataset.titleArt = 'fallback';
    } else document.documentElement.dataset.titleArt = 'ready';

    // ---- Far: sky, shore lights, water glints, fog ----
    const farLights: { img: Img; red: boolean; period: number; phase: number }[] = [];
    const glints: Glint[] = [];
    const fog: Phaser.GameObjects.TileSprite[] = [];
    let boat: Img | undefined, mooring: Img | undefined, lamp: Img | undefined, light: Img | undefined, needle: Img | undefined, led: Img | undefined, rope: Img | undefined;
    const drops: Drop[] = [], motes: Mote[] = [];
    let waterSurface: ReturnType<typeof mountWater> | undefined;
    if (art) {
        img('sky');
        img('harbor');
        waterSurface = mountWater(scene, groups.harbor);
        for (const [x, y, kind] of FAR_LIGHTS) {
            const red = kind === 'red';
            farLights.push({ img: img('sparks', red ? SPARK.red : SPARK.warm, x - 3, y - 1), red, period: red ? 2400 + rng() * 1400 : 3000 + rng() * 5000, phase: rng() });
        }
        const water = (n: number, x0: number, x1: number, y0: number, y1: number, frames: number[]) => {
            for (let i = 0; i < n; i++) {
                const y = Math.round(y0 + Math.pow(rng(), .8) * (y1 - y0));
                glints.push({ img: img('sparks', frames[Math.floor(rng() * frames.length)], Math.round(x0 + rng() * (x1 - x0)), y), period: 1600 + rng() * 3200, phase: rng(), still: rng() < .35 ? .5 : 0 });
            }
        };
        water(26, OPENINGS.window.x, OPENINGS.window.x + OPENINGS.window.w - 8, ANCHORS.horizon + 3, 262, [SPARK.cool, SPARK.coolLong, SPARK.cool]);
        water(12, OPENINGS.door.x, OPENINGS.door.x + OPENINGS.door.w - 8, ANCHORS.horizon + 3, 286, [SPARK.cool, SPARK.coolLong]);
        for (const [x, y, kind] of FAR_LIGHTS) if (kind === 'warm' && y > 150) for (let k = 0; k < 2; k++)
            glints.push({ img: img('sparks', k ? SPARK.warmGlint : SPARK.warm2, x - 3 + Math.round((rng() - .5) * 4), ANCHORS.horizon + 4 + Math.round(rng() * 16)), period: 1400 + rng() * 2000, phase: rng(), still: k ? 0 : .5 });
        for (const name of ['fogHigh', 'fogLow'] as const) {
            const spec = LAYERS[name], tile = scene.add.tileSprite(-GROUPS.harbor.x - 1, spec.y, SCENE_W + GROUPS.harbor.x * 2 + 2, spec.h, spec.key).setOrigin(0).setAlpha(name === 'fogHigh' ? .16 : .12);
            groups.harbor.add(tile); fog.push(tile);
        }

        // ---- Harbour: pier, boat and bow line, pier puddle glints, rain ----
        boat = img('boat');
        groups.harbor.add(waterSurface.front);
        mooring = img('mooring', 1);
        img('pierFront');
        for (let i = 0; i < 8; i++) glints.push({ img: img('sparks', i & 1 ? SPARK.coolLong : SPARK.cool, Math.round(OPENINGS.door.x + 4 + rng() * (OPENINGS.door.w - 16)), Math.round(PIER.top + 8 + rng() * (PIER.bottom - PIER.top - 12))), period: 2200 + rng() * 2600, phase: rng(), still: 0 });
        for (let i = 0; i < 70; i++) {
            const d: Drop = { img: img('rain', 0, 0, 0), x: 0, y: 0, speed: 0, floor: 0 };
            spawnDrop(d, true); drops.push(d);
        }

        // ---- Room, lamp, desk (with radio needle, status lamp, light pool, dust), chair, rope ----
        img('room');
        lamp = img('lamp', 2);
        img('desk');
        needle = img('radioFx', 1, ANCHORS.radioDial.x - 8, ANCHORS.radioDial.y - 9);
        led = img('radioFx', 3, ANCHORS.radioLed.x - 7, ANCHORS.radioLed.y - 3);
        light = img('light').setBlendMode(Phaser.BlendModes.ADD);
        for (let i = 0; i < 14; i++) {
            const m: Mote = { img: img('sparks', SPARK.mote, 0, 0), x: 0, y: 0, vx: 0, vy: 0, phase: rng() };
            groups.desk.add(m.img);
            respawnMote(m, true); motes.push(m);
        }
        img('chair');
        rope = img('fore', 2);
    }
    function spawnDrop(d: Drop, initial: boolean) {
        const panes = [OPENINGS.door, OPENINGS.door, OPENINGS.window, OPENINGS.window, OPENINGS.windowLeft, OPENINGS.windowTopLeft, OPENINGS.windowTopRight, OPENINGS.doorGlass];
        const o = panes[Math.floor(rng() * panes.length)], door = o === OPENINGS.door;
        const depth = rng(), frame = depth < .45 ? 0 : depth < .85 ? 1 : 2;
        d.speed = [150, 240, 360][frame] * (.85 + rng() * .3);
        d.floor = door ? (frame === 0 ? 310 : PIER.top + rng() * (PIER.bottom - PIER.top)) : o.y + o.h + 16;
        // New lives always start above the openings, hidden behind the room's wall and beam;
        // the start is chosen upwind so landings spread evenly across each opening.
        d.y = initial ? -20 + rng() * (d.floor + 20) : -18 - rng() * 40;
        d.x = o.x - 6 + rng() * (o.w + 12) + (d.floor - d.y) * WIND;
        d.img.setFrame(frame);
    }
    function cone(y: number, sway: number) {
        const t = (y - (ANCHORS.lampBulb.y + 8)) / 230;
        return { cx: ANCHORS.lampBulb.x + sway * 2 * t, half: 26 + t * 120 };
    }
    function respawnMote(m: Mote, initial: boolean) {
        m.y = ANCHORS.lampBulb.y + 14 + rng() * 200;
        const { cx, half } = cone(m.y, 0);
        m.x = cx + (rng() - .5) * half * (initial ? 1.6 : 1.8);
        m.vx = (rng() - .5) * 3; m.vy = (rng() - .45) * 2;
    }

    // ---- Input: mouse/pen only; touch never steers the camera ----
    const camera = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    let pointerSeen = -1e9, pointerInside = false, overlay = false, clock = 0, rainOn = true, needleTimer = 0, needleFrame = 1;
    const onMove = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
        const n = normalizePointer(e.clientX, e.clientY, innerWidth, innerHeight);
        target.x = n.x; target.y = n.y; pointerSeen = clock; pointerInside = true;
    };
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget) { pointerInside = false; target.x = 0; target.y = 0; } };
    // Hidden tab or unfocused window both pause the scene; it resumes from where it stopped.
    let blurred = false;
    const onVisibility = () => { gate.hidden = document.hidden || blurred; apply(); };
    const onBlur = () => { blurred = true; onVisibility(); };
    const onFocus = () => { blurred = false; onVisibility(); };
    const onReduced = () => { gate.reduced = reducedQuery.matches; apply(); };
    const onMotion = (enabled: boolean) => { gate.enabled = enabled; apply(); };
    const onOverlay = (open: boolean) => { overlay = open; };
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('blur', onBlur);
    addEventListener('focus', onFocus);
    reducedQuery.addEventListener('change', onReduced);
    scene.events.on('title-motion', onMotion);
    scene.events.on('title-overlay', onOverlay);

    function place(sway: number) {
        for (const name of Object.keys(GROUPS) as GroupName[]) groups[name].setPosition(layerOffset(camera.x, GROUPS[name].x), layerOffset(camera.y, GROUPS[name].y));
        if (lamp && light) { lamp.setFrame(sway + 2); light.x = LAYERS.light.x + sway * 2; }
    }
    // Freeze the current composition. Resetting positions here caused the visible toggle jump.
    function apply() {
        const allowed = motionAllowed(gate);
        for (const d of drops) d.img.setVisible(allowed && rainOn);
        for (const m of motes) m.img.setVisible(allowed);
    }
    for (const g of glints) g.img.setAlpha(g.still * .25);
    apply();

    function update(rawDelta: number) {
        if (!motionAllowed(gate)) return;
        const ms = clampStep(rawDelta);
        clock += ms;
        // Parallax: follow the pointer; drift back to centre after it leaves; tiny idle drift.
        if (!overlay) {
            const idle = clock - pointerSeen > 6000;
            const tx = idle ? .12 * wave(clock, 23000) : target.x, ty = idle ? .1 * wave(clock, 31000, .3) : target.y;
            const tau = pointerInside && !idle ? .26 : 1.3;
            camera.x = follow(camera.x, tx, ms, tau); camera.y = follow(camera.y, ty, ms, tau);
        }
        const sway = poseFrame(wave(clock, 9400, .1), 5) - 2;
        place(sway);
        // Lamp: steady with a rare, short dip, never a strobe.
        light?.setAlpha(blink(clock, 11300, .012, .4) ? .82 : 1);
        // Boat bob (1 px each way) with the bow line following, rope end swaying on its own period.
        const bob = Math.round(wave(clock, 7300, .6) * 1.2);
        const b = Math.max(-1, Math.min(1, bob));
        boat?.setY(LAYERS.boat.y + b); mooring?.setFrame(b + 1);
        waterSurface?.draw(clock, b);
        rope?.setFrame(poseFrame(wave(clock, 11700, .25), 5));
        // Radio: the needle wanders between three positions; the status lamp blinks briefly.
        needleTimer -= ms;
        if (needleTimer <= 0) { needleFrame = Math.max(0, Math.min(2, needleFrame + (rng() < .5 ? -1 : 1))); needle?.setFrame(needleFrame); needleTimer = 900 + rng() * 1800; }
        led?.setVisible(blink(clock, 2600, .14, .2));
        for (const l of farLights) l.img.setAlpha(l.red ? (blink(clock, l.period, .45, l.phase) ? 1 : .15) : twinkle(clock, l.period, l.phase) > .6 ? .7 : 1);
        for (const g of glints) g.img.setAlpha(twinkle(clock, g.period, g.phase) * .25);
        for (const t of fog) t.tilePositionX = Math.floor(clock / (t === fog[0] ? 1900 : 1150));
        if (rainOn) for (const d of drops) {
            d.y += d.speed * ms / 1000; d.x -= d.speed * WIND * ms / 1000;
            if (d.y > d.floor) spawnDrop(d, false);
            d.img.setPosition(Math.round(d.x), Math.round(d.y));
        }
        for (const m of motes) {
            m.x += (m.vx + wave(clock, 5000, m.phase) * 1.5) * ms / 1000; m.y += m.vy * ms / 1000;
            const { cx, half } = cone(m.y, sway);
            const d = Math.abs(m.x - cx) / half;
            if (d > 1 || m.y < ANCHORS.lampBulb.y + 10 || m.y > ANCHORS.lampBulb.y + 230) respawnMote(m, false);
            m.img.setPosition(Math.round(m.x), Math.round(m.y)).setAlpha(d < .45 ? 1 : d < .75 ? .6 : .3);
        }
    }

    let destroyed = false;
    function destroy() {
        if (destroyed) return;
        destroyed = true; live--;
        removeEventListener('pointermove', onMove);
        document.documentElement.removeEventListener('mouseleave', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        removeEventListener('blur', onBlur);
        removeEventListener('focus', onFocus);
        reducedQuery.removeEventListener('change', onReduced);
        scene.events.off('title-motion', onMotion);
        scene.events.off('title-overlay', onOverlay);
        scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
        scene.events.off(Phaser.Scenes.Events.DESTROY, destroy);
        gate.active = false;
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
    scene.events.once(Phaser.Scenes.Events.DESTROY, destroy);

    /** Read-only state for the explicit ?test=1 review scripts. */
    function snapshot() {
        return {
            art, allowed: motionAllowed(gate), gate: { ...gate }, overlay, live, camera: [camera.x, camera.y], clock,
            groups: Object.fromEntries((Object.keys(GROUPS) as GroupName[]).map(n => [n, [groups[n].x, groups[n].y]])),
            lamp: lamp ? Number(lamp.frame.name) : null, lightX: light?.x ?? null, lightAlpha: light?.alpha ?? null, boatY: boat?.y ?? null, mooring: mooring ? Number(mooring.frame.name) : null,
            rope: rope ? Number(rope.frame.name) : null, needle: needle ? Number(needle.frame.name) : null, led: led?.visible ?? null,
            fog: fog.map(t => t.tilePositionX), waterFrame: waterSurface?.frame ?? null,
            glints: glints.map(g => g.img.alpha).join(','), lights: farLights.map(l => l.img.alpha).join(','),
            rain: drops.filter(d => d.img.visible).map(d => [d.img.x, d.img.y]),
            motes: motes.filter(m => m.img.visible).map(m => `${m.img.x},${m.img.y}`).join(';'),
            objects: scene.children.length,
        };
    }
    return { update, destroy, snapshot, setRain(on: boolean) { rainOn = on; apply(); for (const d of drops) d.img.setVisible(on && motionAllowed(gate)); } };
}
