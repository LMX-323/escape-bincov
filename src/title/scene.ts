import { Application, Container, Graphics, Sprite, Texture, TilingSprite, type Ticker } from 'pixi.js';
import { GROUPS, LAYERS, OPENINGS, ANCHORS, FAR_LIGHTS, SCENE_W, SCENE_H, type GroupName, type LayerName } from './layout';
import { titleArtReady, titleFrames, titleTextureCount } from './assets';
import { liveWaterPlanes, mountWater } from './water';
import { titleSurface } from './rendering';
import { clampStep, normalizePointer, follow, layerOffset, motionAllowed, decorRandom, wave, poseFrame, blink, twinkle, type MotionGate } from './motion';

type Img = Sprite & { layer: LayerName; frameIndex: number | null };
type Glint = { img: Img; period: number; phase: number; still: number };
type Drop = { img: Img; x: number; y: number; speed: number; floor: number };
type Mote = { img: Img; x: number; y: number; vx: number; vy: number; phase: number };

/** Live controllers, reported by the test snapshot; re-entering the menu must never leave an extra one behind. */
let live = 0;

const SPARK = { warm: 0, warm2: 1, cool: 2, coolLong: 3, warmGlint: 4, warmLong: 5, red: 6, mote: 7 } as const;
const PIER = { top: 292, bottom: 424 };
const WIND = .26;

let renderer: Application | null = null;
/**
 * The title's own WebGL renderer, created once at boot (after the WebGL check) and kept for the page's life: the menu
 * mounts its scene on it and the canvas leaves the page while another screen shows. The raid and yard hosts keep their
 * shared renderer (pixi-app.ts takeApp), so neither ever draws the other's textures.
 */
export async function prepareTitleRenderer(): Promise<void> {
    if (renderer) return;
    const app = new Application();
    const { w, h } = titleSurface();
    await app.init({ background: 0x122021, antialias: false, resolution: 1, autoDensity: false, preference: 'webgl', width: w, height: h, powerPreference: 'high-performance', autoStart: false });
    // The title reads pointer events from the DOM itself; Pixi's federated events would listen on the page for nothing.
    (app.renderer as unknown as { events?: { setTargetElement(element: HTMLElement | null): void } }).events?.setTargetElement(null);
    app.ticker.stop();
    renderer = app;
}

export type TitleController = ReturnType<typeof mountTitle>;

/**
 * Builds the layered watch-room scene on the title renderer and owns all of its motion:
 * pointer parallax, lamp sway with its light pool, boat bob, rope sway, water glints,
 * far lights, radio needle, dust, fog drift and rain. A single gate (player toggle,
 * reduced motion, page visibility, scene active) stops every one of them together.
 */
export function mountTitle(parent: HTMLElement, motion: boolean) {
    if (!renderer) throw new Error('Title renderer not prepared.');
    const app = renderer, stage = app.stage;
    live++;
    const rng = decorRandom(0x5eed71);
    const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const gate: MotionGate = { enabled: motion, reduced: reducedQuery.matches, hidden: document.hidden, active: true };
    const groups = {} as Record<GroupName, Container>;
    for (const name of Object.keys(GROUPS) as GroupName[]) stage.addChild(groups[name] = new Container());
    const art = titleArtReady();
    const img = (name: LayerName, frame = 0, x: number = LAYERS[name].x, y: number = LAYERS[name].y) => {
        const spec = LAYERS[name], image = Object.assign(new Sprite(titleFrames(name)[spec.frames ? frame : 0]), { layer: name, frameIndex: spec.frames ? frame : null });
        image.position.set(x, y); image.width = spec.w; image.height = spec.h;
        groups[spec.group].addChild(image);
        return image;
    };
    /** Show another frame of a sheet layer; its display size stays the layer's logical size. */
    const setFrame = (image: Img, frame: number) => {
        if (image.frameIndex === frame) return;
        const spec = LAYERS[image.layer];
        image.texture = titleFrames(image.layer)[frame];
        image.width = spec.w; image.height = spec.h; image.frameIndex = frame;
    };

    if (!art) {
        // Decoding failed: keep a calm, readable backdrop; the HTML menu stays fully usable.
        const plain = new Sprite(Texture.WHITE);
        plain.tint = 0x122021; plain.width = SCENE_W; plain.height = SCENE_H;
        groups.far.addChild(plain);
        document.documentElement.dataset.titleArt = 'fallback';
    } else document.documentElement.dataset.titleArt = 'ready';

    // ---- Far: sky, shore lights, water glints, fog ----
    const farLights: { img: Img; red: boolean; period: number; phase: number }[] = [];
    const glints: Glint[] = [];
    const fog: TilingSprite[] = [];
    let boat: Img | undefined, mooring: Img | undefined, lamp: Img | undefined, light: Img | undefined, needle: Img | undefined, led: Img | undefined, rope: Img | undefined;
    const drops: Drop[] = [], motes: Mote[] = [];
    let waterSurface: ReturnType<typeof mountWater> | undefined;
    if (art) {
        img('sky');
        img('harbor');
        waterSurface = mountWater(groups.harbor);
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
            const spec = LAYERS[name], tile = new TilingSprite({ texture: titleFrames(name)[0], width: SCENE_W + GROUPS.harbor.x * 2 + 2, height: spec.h });
            tile.position.set(-GROUPS.harbor.x - 1, spec.y); tile.alpha = name === 'fogHigh' ? .16 : .12;
            groups.harbor.addChild(tile); fog.push(tile);
        }

        // ---- Harbour: pier, boat and bow line, pier puddle glints, rain ----
        boat = img('boat');
        groups.harbor.addChild(waterSurface.front);
        mooring = img('mooring', 1);
        img('pierFront');
        for (let i = 0; i < 8; i++) glints.push({ img: img('sparks', i & 1 ? SPARK.coolLong : SPARK.cool, Math.round(OPENINGS.door.x + 4 + rng() * (OPENINGS.door.w - 16)), Math.round(PIER.top + 8 + rng() * (PIER.bottom - PIER.top - 12))), period: 2200 + rng() * 2600, phase: rng(), still: 0 });
        for (let i = 0; i < 70; i++) {
            const d: Drop = { img: img('rain', 0, 0, 0), x: 0, y: 0, speed: 0, floor: 0 };
            spawnDrop(d, true); drops.push(d);
        }

        // ---- Room, lamp, desk (with radio needle, status lamp, light pool, dust), chair, rope ----
        // All planes retain the same master painting's palette and light direction.
        img('room');
        lamp = img('lamp', 2);
        lamp.anchor.set((ANCHORS.lampPivot.x - LAYERS.lamp.x) / LAYERS.lamp.w, (ANCHORS.lampPivot.y - LAYERS.lamp.y) / LAYERS.lamp.h);
        lamp.position.set(ANCHORS.lampPivot.x, ANCHORS.lampPivot.y);
        img('desk');
        needle = img('radioFx', 1, ANCHORS.radioDial.x - 8, ANCHORS.radioDial.y - 9);
        led = img('radioFx', 3, ANCHORS.radioLed.x - 7, ANCHORS.radioLed.y - 3);
        // The desk already contains directional lighting and contact shadows. Add only a breath.
        light = img('light'); light.blendMode = 'add'; light.alpha = .025;
        for (let i = 0; i < 14; i++) {
            const m: Mote = { img: img('sparks', SPARK.mote, 0, 0), x: 0, y: 0, vx: 0, vy: 0, phase: rng() };
            groups.desk.addChild(m.img);
            respawnMote(m, true); motes.push(m);
        }
        img('chair');
        // Exact near-camera silhouette extracted from the master, including its timber jamb.
        rope = img('fore');
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
        setFrame(d.img, frame);
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

    // ---- Render surface: 960x540 logical units at the denser title resolution ----
    const resize = () => {
        const { w, h } = titleSurface();
        if (app.renderer.width !== w || app.renderer.height !== h) app.renderer.resize(w, h);
        stage.scale.set(w / SCENE_W);
    };
    resize();
    addEventListener('resize', resize);

    // ---- Input: mouse/pen only; touch never steers the camera ----
    const camera = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    let overlay = false, clock = 0, rainOn = true, needleTimer = 0, needleFrame = 1;
    const holdCamera = () => { target.x = camera.x; target.y = camera.y; };
    const onMove = (e: PointerEvent) => {
        if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || overlay || !motionAllowed(gate)) return;
        // Using menu controls must not drag the room behind the player's eyes.
        if (e.target instanceof Element && e.target.closest('button, a, [aria-modal="true"]')) { holdCamera(); return; }
        const n = normalizePointer(e.clientX, e.clientY, innerWidth, innerHeight);
        target.x = n.x; target.y = 0;
    };
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget) holdCamera(); };
    // Hidden tab or unfocused window both pause the scene; it resumes from where it stopped.
    let blurred = false;
    const onVisibility = () => { gate.hidden = document.hidden || blurred; holdCamera(); apply(); };
    const onBlur = () => { blurred = true; onVisibility(); };
    const onFocus = () => { blurred = false; onVisibility(); };
    const onReduced = () => { gate.reduced = reducedQuery.matches; holdCamera(); apply(); };
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('blur', onBlur);
    addEventListener('focus', onFocus);
    reducedQuery.addEventListener('change', onReduced);

    function place(sway: number) {
        for (const name of Object.keys(GROUPS) as GroupName[]) groups[name].position.set(layerOffset(camera.x, GROUPS[name].x), layerOffset(camera.y, GROUPS[name].y));
        if (lamp && light) { lamp.rotation = sway * .006; light.x = LAYERS.light.x + sway * .75; }
    }
    // Freeze the current composition. Resetting positions here caused the visible toggle jump.
    function apply() {
        const allowed = motionAllowed(gate);
        for (const d of drops) d.img.visible = allowed && rainOn;
        for (const m of motes) m.img.visible = allowed;
    }
    for (const g of glints) g.img.alpha = g.still * .25;
    apply();

    function update(rawDelta: number) {
        if (!motionAllowed(gate)) return;
        const ms = clampStep(rawDelta);
        clock += ms;
        // No idle camera drift or timed recenter. Stationary input stays stationary.
        if (!overlay) {
            camera.x = follow(camera.x, target.x, ms, .18);
        }
        const sway = wave(clock, 14000);
        place(sway);
        // Lamp: steady with a rare, short dip, never a strobe.
        if (light) light.alpha = blink(clock, 11300, .012, .4) ? .015 : .025;
        // Continuous subpixel bob, not a sprite that teleports one pixel at a time.
        const b = wave(clock, 7300) * .7;
        if (boat) boat.y = LAYERS.boat.y + b;
        if (mooring) setFrame(mooring, poseFrame(b, 3));
        waterSurface?.draw(clock, b);
        // Foreground has pointer parallax; the fixed jamb must never wobble with the rope.
        // Radio: the needle wanders between three positions; the status lamp blinks briefly.
        needleTimer -= ms;
        if (needleTimer <= 0) { needleFrame = Math.max(0, Math.min(2, needleFrame + (rng() < .5 ? -1 : 1))); if (needle) setFrame(needle, needleFrame); needleTimer = 900 + rng() * 1800; }
        if (led) led.visible = blink(clock, 2600, .14, .2);
        for (const l of farLights) l.img.alpha = l.red ? (blink(clock, l.period, .45, l.phase) ? 1 : .15) : twinkle(clock, l.period, l.phase) > .6 ? .7 : 1;
        for (const g of glints) g.img.alpha = twinkle(clock, g.period, g.phase) * .25;
        // Phaser's tilePositionX scrolled the pattern left as it grew; Pixi's offset moves it right, so negate.
        for (const t of fog) t.tilePosition.x = -Math.floor(clock / (t === fog[0] ? 1900 : 1150));
        if (rainOn) for (const d of drops) {
            d.y += d.speed * ms / 1000; d.x -= d.speed * WIND * ms / 1000;
            if (d.y > d.floor) spawnDrop(d, false);
            d.img.position.set(Math.round(d.x), Math.round(d.y));
        }
        for (const m of motes) {
            m.x += (m.vx + wave(clock, 5000, m.phase) * 1.5) * ms / 1000; m.y += m.vy * ms / 1000;
            const { cx, half } = cone(m.y, sway);
            const d = Math.abs(m.x - cx) / half;
            if (d > 1 || m.y < ANCHORS.lampBulb.y + 10 || m.y > ANCHORS.lampBulb.y + 230) respawnMote(m, false);
            m.img.position.set(Math.round(m.x), Math.round(m.y)); m.img.alpha = d < .45 ? 1 : d < .75 ? .6 : .3;
        }
    }
    // Through the controller, so the performance diagnostic can time a wrapped update.
    const tick = (ticker: Ticker) => controller.update(ticker.deltaMS);

    let destroyed = false;
    function destroy() {
        if (destroyed) return;
        destroyed = true; live--;
        removeEventListener('pointermove', onMove);
        document.documentElement.removeEventListener('mouseleave', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        removeEventListener('blur', onBlur);
        removeEventListener('focus', onFocus);
        removeEventListener('resize', resize);
        reducedQuery.removeEventListener('change', onReduced);
        app.ticker.remove(tick);
        app.ticker.stop();
        waterSurface?.destroy();
        // Scene objects go; the layer textures stay cached for the next visit to the menu.
        for (const child of stage.removeChildren()) child.destroy({ children: true });
        // One empty frame hands the batcher's last batches back to Pixi's pool, so a raid or yard renderer that empties
        // the global pools before it ever draws (a failed mount) cannot leave this renderer holding destroyed batches.
        try { app.render(); } catch { /* a lost context has nothing to hand back */ }
        app.canvas.remove();
        gate.active = false;
    }

    /** Read-only state for the explicit ?test=1 review scripts. */
    function snapshot() {
        return {
            art, allowed: motionAllowed(gate), gate: { ...gate }, overlay, live, camera: [camera.x, camera.y], clock,
            groups: Object.fromEntries((Object.keys(GROUPS) as GroupName[]).map(n => [n, [groups[n].x, groups[n].y]])),
            lamp: lamp?.frameIndex ?? null, lampAngle: lamp?.rotation ?? null, lightX: light?.x ?? null, lightAlpha: light?.alpha ?? null, boatY: boat?.y ?? null, mooring: mooring?.frameIndex ?? null,
            rope: rope?.x ?? null, needle: needle?.frameIndex ?? null, led: led?.visible ?? null,
            fog: fog.map(t => -t.tilePosition.x), waterFrame: waterSurface?.frame ?? null,
            glints: glints.map(g => g.img.alpha).join(','), lights: farLights.map(l => l.img.alpha).join(','),
            rain: drops.filter(d => d.img.visible).map(d => [d.img.x, d.img.y]),
            motes: motes.filter(m => m.img.visible).map(m => `${m.img.x},${m.img.y}`).join(';'),
            objects: stage.children.length,
        };
    }
    /** Ownership counters for the review scripts: display objects, Graphics, cached textures, water canvases, controllers. */
    function counts() {
        let objects = 0, graphics = 0;
        const visit = (c: Container) => { objects++; if (c instanceof Graphics) graphics++; for (const child of c.children) visit(child); };
        for (const child of stage.children) visit(child);
        return { stage: stage.children.length, objects, graphics, textures: titleTextureCount(), water: liveWaterPlanes(), live };
    }
    /** The render surface and loop, for the review scripts (values change with the window and the frame rate). */
    function renderInfo() {
        return { surface: [app.renderer.width, app.renderer.height], scale: stage.scale.x, roundPixels: !!(app.renderer as { roundPixels?: boolean }).roundPixels,
            renderer: app.renderer.name, fps: app.ticker.FPS, running: app.ticker.started };
    }
    const controller = {
        update, destroy, snapshot, counts, renderInfo,
        /** Test hook: the title's renderer (the edge probe draws on it, the performance diagnostic times it). */
        debug: () => ({ app }),
        setRain(on: boolean) { rainOn = on; apply(); for (const d of drops) d.img.visible = on && motionAllowed(gate); },
        /** The player's 动态景物 toggle, or a system reduced-motion change. */
        setMotion(enabled: boolean) { gate.enabled = enabled; holdCamera(); apply(); },
        /** A dialog over the menu freezes pointer parallax. */
        setOverlay(open: boolean) { overlay = open; holdCamera(); },
        /** The opening cutscene covers the menu: stop drawing until it hands the page back. */
        sleep(asleep: boolean) { if (asleep) app.ticker.stop(); else if (!destroyed) app.ticker.start(); },
        /** Test hook: run a callback after each scene update. */
        onFrame(fn: () => void) { const f = () => fn(); app.ticker.add(f); return () => app.ticker.remove(f); },
    };
    app.ticker.add(tick);
    parent.appendChild(app.canvas);
    app.ticker.start();
    return controller;
}
