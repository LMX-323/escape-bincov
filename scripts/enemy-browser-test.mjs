/** Actual offline v7 saves in the shipped 2.5D host. Extra roles are saved fixtures, not native encounter claims. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { raidReady, drive, frames } from './raid-view.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { createSessionState, SaveSession } from '../src/session.ts';
import { decodeSession, SESSION_KEY } from '../src/recovery-store.ts';
import { BUILDING_WORLD } from '../src/building-world.ts';
import { corridor, traversable } from '../src/spatial.ts';
import { archetype, initialTactics } from '../src/enemy-archetypes.ts';
import { damageLayerEnemy } from '../src/layer-transition.ts';
import { ENEMY_CATALOG } from './enemy-catalog-data.ts';

const out = resolve('test-results/enemy-browser'); await mkdir(out, { recursive: true });
const artRoles = ENEMY_CATALOG.filter(card => card.assets.status === 'body-and-corpse').map(card => card.id);
const motionRoles = ['tidal-crab', 'saltback-dog', 'sac-spitter', 'salt-dazed', 'tide-chaser', 'salt-hulk'];
const report = { scope: 'First three roles deploy natively; other art roles use valid saved fixtures until their authored encounters are ready.', screenshots: [], cases: [], errors: [], external: [], status: 'RUNNING' };
function fixture(phase, role = 'raider-gunner') {
    const data = new Map(), state = createSessionState();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout'; assert.ok(saves.beginRun(42, true), state.storageError);
    const raid = state.expansion.raid, spec = archetype(role);
    const e = raid.maps.coast.enemies.find(e => e.id === role) ?? raid.maps.coast.enemies.find(e => e.id === 'raider-gunner');
    if (e.id !== role) {
        e.id = role; e.hp = spec.hp; e.tactics = initialTactics(role, 'art-review');
        raid.roster.find(r => r.uid === e.uid).id = role;
    }
    const context = { definition: BUILDING_WORLD.maps.coast, doors: raid.maps.coast.doors, highTide: raid.highTide };
    const p = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(a => ({ x: e.x + Math.cos(a) * 96, y: e.y + Math.sin(a) * 96 }))
        .find(p => traversable(context, p, 'body', 10) && corridor(context, e, p, 'sight'));
    assert.ok(p, 'a visible, safe observation point');
    raid.player = { ...p, rotation: Math.atan2(e.y - p.y, e.x - p.x) };
    if (phase === 'parley') {
        for (const actor of raid.maps.coast.enemies.filter(a => a.tactics)) {
            actor.id = 'blockade-sentry'; actor.hp = 85; actor.tactics = initialTactics(actor.id, 'guard-test');
            raid.roster.find(r => r.uid === actor.uid).id = actor.id;
        }
    } else if (phase === 'corpse') damageLayerEnemy(state.expansion, 'coast', e, e.hp * 2);
    else Object.assign(e.tactics, { phase, phaseLeft: phase === 'windup' ? archetype(role).windup / 2 : phase === 'reload' ? 1.8 : .4,
        lockedAim: Math.atan2(p.y - e.y, p.x - e.x), magazine: Math.min(1, spec.magazine), reserve: Math.min(4, spec.reserve), stance: 'hostile', awareness: 1,
        memory: { at: p, time: 0, source: 'sight', target: 'player' } });
    assert.ok(saves.persist(), `${role}/${phase}: ${state.storageError}`);
    const raw = data.get(SESSION_KEY); decodeSession(raw);
    return { raw, uid: e.uid };
}
const browser = await chromium.launch(browserOptions);
try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
        const touch = viewport.width < 1000;
        const context = await browser.newContext({ viewport, offline: true, hasTouch: touch, isMobile: touch }); await resumeStalls(context);
        const scenarios = (touch ? ['parley'] : ['windup', 'reload', 'recovery', 'parley']).map(phase => ({ phase, role: 'raider-gunner', name: phase }));
        for (const role of artRoles) {
            if (touch || role !== 'raider-gunner') scenarios.push({ phase: 'windup', role, name: `${role}-windup` });
            if (!touch) scenarios.push({ phase: 'corpse', role, name: `${role}-corpse` });
        }
        for (const { phase, role, name } of scenarios) {
            const saved = fixture(phase, role);
            // A previous host can autosave between a storage write and navigation. Close each case first,
            // then install the next save before application startup, without another live writer.
            const page = await context.newPage(); page.setDefaultTimeout(60000);
            await page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, saved.raw]);
            page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
            await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs&freezeAI=1', { waitUntil: 'load' });
            await page.locator('[data-action="enter"]').click(); await raidReady(page);
            await drive(page, 'freezeAI', true);
            const resume = page.locator('.coast-sample [data-do="resume"]');
            if (await resume.isVisible()) await resume.click();
            await frames(page, 20);
            const actual = await page.evaluate(uid => {
                const h = window.__bincovSample.host, actor = h.lastBatch.frame.actors.find(a => a.uid === uid), gfx = h.view.actors.get(uid);
                const variant = actor.tactics.archetype;
                const bodyArt = Array.from({ length: 5 }, (_, f) => h.view.tex.actor(actor.kind, gfx.dir, f, variant)).includes(gfx.body.texture);
                const corpseArt = !actor.alive && [1, -1].some(face => h.view.tex.corpse(actor.kind, face, variant) === gfx.corpse?.texture);
                const held = h.view.tex.weapon(actor.weapon, actor.kind, variant);
                return { phase: actor.tactics.phase, reloading: !!actor.state.reloading, cue: gfx.telegraph.visible, boundary: actor.tactics.boundary,
                    bodyArt, corpseArt, artStyle: h.view.tex.actorStyle(actor.kind, variant),
                    bodyPose: { x: gfx.body.scale.x, y: gfx.body.scale.y, tilt: gfx.body.rotation },
                    heldWidth: held.canvas.width, heldArt: gfx.weapon.texture === held.texture, hands: gfx.arms.filter(a => a.visible).length,
                    weapon: actor.weapon, version: JSON.parse(localStorage.getItem('escape-bincov.session.v2')).version };
            }, saved.uid);
            assert.equal(actual.phase, ['parley', 'corpse'].includes(phase) ? 'idle' : phase, `${viewport.width}/${name}: saved phase survives mount`);
            if (phase !== 'corpse') assert.ok(actual.cue);
            assert.equal(actual.reloading, phase === 'reload');
            assert.equal(actual.weapon, phase === 'parley' ? 'rifle' : archetype(role).weapon); assert.equal(actual.version, 7);
            if (phase !== 'parley') {
                assert.equal(actual.artStyle, role); assert.ok(phase === 'corpse' ? actual.corpseArt : actual.bodyArt);
            }
            if (role === 'tide-ritualist' && phase === 'windup') {
                assert.ok(actual.heldArt && actual.heldWidth >= 40, 'ritualist visibly carries the long fishing tool');
                assert.equal(actual.hands, 2, 'both hands grip the polearm');
            }
            if (motionRoles.includes(role) && phase === 'windup') {
                assert.notDeepEqual(actual.bodyPose, { x: 1, y: 1, tilt: 0 }, 'preparation is visible on the body');
                if (viewport.width === 1280) {
                    const motion = await page.evaluate(uid => {
                        const h = window.__bincovSample.host, v = h.view, original = h.lastBatch, gfx = v.actors.get(uid);
                        const pose = () => ({ x: gfx.body.scale.x, y: gfx.body.scale.y, tilt: gfx.body.rotation });
                        const shown = phase => {
                            const copy = structuredClone(original), a = copy.frame.actors.find(a => a.uid === uid);
                            Object.assign(a.tactics, { phase, left: phase === 'recovery' ? .1 : .3, total: 1 });
                            v.present({ ...copy, events: [] }, 0); return pose();
                        };
                        const release = shown('release'), recovered = shown('recovery');
                        const reduced = v.opts.reducedMotion; v.opts.reducedMotion = true;
                        v.present({ ...original, events: [] }, 0);
                        const accessible = { pose: pose(), telegraph: gfx.telegraph.visible };
                        v.opts.reducedMotion = reduced; v.present({ ...original, events: [] }, 0);
                        return { release, recovered, accessible };
                    }, saved.uid);
                    assert.notDeepEqual(motion.release, actual.bodyPose);
                    assert.deepEqual(motion.recovered, { x: 1, y: 1, tilt: 0 });
                    assert.deepEqual(motion.accessible, { pose: { x: 1, y: 1, tilt: 0 }, telegraph: true });
                    report.cases.push({ viewport, scenario: `${role}-motion-contract`, ...motion });
                }
            }
            if (phase === 'parley') {
                assert.equal(actual.boundary.radius, 90);
                if (touch) await page.getByRole('button', { name: '询问 · 检查哨兵', exact: true }).tap();
                else await page.keyboard.press('e');
                await frames(page, 10);
                const result = await page.evaluate(uid => {
                    const h = window.__bincovSample.host;
                    return { notices: h.eventLog.filter(e => e.type === 'notice').map(e => e.detail.text),
                        stance: h.lastBatch.frame.actors.find(a => a.uid === uid).tactics.stance };
                }, saved.uid);
                assert.ok(result.notices.some(text => text.includes('外围公共通道')), JSON.stringify(result));
                assert.equal(result.stance, 'idle');
            }
            const file = `${viewport.width}x${viewport.height}-${name}.png`;
            await page.screenshot({ path: resolve(out, file) }); report.screenshots.push(file); report.cases.push({ viewport, scenario: name, ...actual });
            if (viewport.width === 1280 && name === 'windup') {
                // Render the shipped synthesizer into Web Audio buffers: mapping/visibility are covered separately.
                // This measures the cue generator, not a natural encounter or subjective audibility over gunfire.
                const cues = await page.evaluate(async () => {
                    const Synth = window.__bincovSample.host.sound.out.constructor, results = [];
                    for (const voice of ['crab', 'dog', 'spit', 'heavy', 'salt', 'polearm', 'raider', 'radio']) {
                        for (const phase of ['prepare', 'release', 'warning', 'reload']) {
                            const ctx = new OfflineAudioContext(2, 22050, 44100), audio = new Synth();
                            audio.context = ctx; audio.master = ctx.createGain(); audio.master.connect(ctx.destination);
                            audio.noise = ctx.createBuffer(1, 44100 * 4, 44100);
                            const noise = audio.noise.getChannelData(0);
                            for (let i = 0; i < noise.length; i++) noise[i] = Math.sin(i * 1.37) * .15;
                            audio.resumeAt = performance.now(); audio.enemy(voice, phase, { pan: .5, gain: .7 });
                            const buffer = await ctx.startRendering();
                            const energy = [0, 1].map(channel => buffer.getChannelData(channel).reduce((sum, x) => sum + x * x, 0));
                            results.push({ voice, phase, energy });
                        }
                    }
                    return results;
                });
                assert.equal(cues.length, 32);
                for (const cue of cues) {
                    assert.ok(cue.energy.every(n => Number.isFinite(n) && n > .001), `${cue.voice}/${cue.phase} has real nonzero output`);
                    assert.ok(cue.energy[1] > cue.energy[0] * 2, 'positional cue pans toward its source');
                }
                report.cases.push({ viewport, scenario: 'enemy-synth-output-contract', cues });
            }
            if (viewport.width === 1280 && role === 'sac-spitter' && phase === 'windup') {
                // Presentation-only contract probe using the real saved actor. It does not claim a played encounter.
                const acid = await page.evaluate(uid => {
                    const h = window.__bincovSample.host, v = h.view, original = h.lastBatch;
                    const a = original.frame.actors.find(a => a.uid === uid), p = { x: a.x + 30, y: a.y };
                    const bullet = { uid: 'art-acid', owner: uid, enemy: true, x: a.x, y: a.y, vx: 180, vy: 0 };
                    const publish = (events, bullets = []) => v.present({ ...original, events, frame: { ...original.frame, bullets } }, 0);
                    const event = detail => ({ ...detail, stamp: original.stamp });
                    const shot = event({ type: 'shot', shooter: uid, weapon: 'claw', shotId: 'art-acid',
                        pellets: [{ bullet: 'art-acid', origin: { x: a.x, y: a.y }, angle: 0 }] });
                    const impact = event({ type: 'impact', bullet: 'art-acid', owner: uid, reason: 'range', lastFree: p,
                        contact: null, normal: null, surface: null, target: null });
                    v.fx.clear(); const muzzleBefore = v.muzzles.length;
                    publish([], [bullet]); publish([shot], [{ ...bullet, x: p.x }]);
                    const box = v.bullets.get('art-acid').g.getLocalBounds();
                    const fired = { particles: v.fx.live.length, muzzles: v.muzzles.length - muzzleBefore, projectileHeight: box.height, projectileY: box.y - a.y };
                    v.fx.clear(); publish([impact]);
                    const landed = { particles: v.fx.live.length, permanent: v.fx.decals.length };
                    v.fx.update(2); landed.remaining = v.fx.count;
                    // Diagnostic unrevealed room around the saved actor: exercise the real visibility predicate.
                    // This temporary view map never enters Runtime or storage.
                    const hidden = structuredClone(original), map = v.map;
                    const room = { id: 'art-hidden', name: 'probe', x: a.x - 60, y: a.y - 60, w: 150, h: 120, inside: true, sealed: true, buildingId: null };
                    v.map = { ...map, regions: [...map.regions, room] };
                    hidden.frame.actors = hidden.frame.actors.map(actor => actor.uid === uid ? { ...actor, regionId: room.id } : actor);
                    v.present({ ...hidden, events: [shot, impact] }, 0);
                    const hiddenParticles = v.fx.count;
                    v.map = map;
                    v.present({ ...original, events: [] }, 0);
                    return { fired, landed, hiddenParticles };
                }, saved.uid);
                assert.equal(acid.fired.muzzles, 0); assert.equal(acid.fired.particles, 4);
                assert.ok(acid.fired.projectileHeight >= 4 && acid.fired.projectileY >= -10 && acid.fired.projectileY <= -6);
                assert.deepEqual(acid.landed, { particles: 7, permanent: 0, remaining: 0 });
                assert.equal(acid.hiddenParticles, 0);
                report.cases.push({ viewport, scenario: 'spit-presentation-contract', ...acid });
            }
            await page.close();
        }
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
