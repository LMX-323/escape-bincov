/** Actual offline v6 saves in the shipped 2.5D host. Fixed phases are valid saved states, not concept images. */
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

const out = resolve('test-results/enemy-browser'); await mkdir(out, { recursive: true });
const report = { screenshots: [], cases: [], errors: [], external: [], status: 'RUNNING' };
function fixture(phase, role = 'raider-gunner') {
    const data = new Map(), state = createSessionState();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout'; assert.ok(saves.beginRun(42, true), state.storageError);
    const raid = state.expansion.raid, e = raid.maps.coast.enemies.find(e => e.id === role);
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
    else Object.assign(e.tactics, { phase, phaseLeft: phase === 'windup' ? archetype(role).windup : phase === 'reload' ? 1.8 : .4,
        lockedAim: Math.atan2(p.y - e.y, p.x - e.x), magazine: role === 'raider-melee' ? 0 : 1, reserve: role === 'raider-melee' ? 0 : 4, stance: 'hostile', awareness: 1,
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
        for (const role of ['raider-melee', 'raider-gunner', 'raider-lookout']) {
            if (touch || role !== 'raider-gunner') scenarios.push({ phase: 'windup', role, name: `${role}-windup` });
            if (!touch) scenarios.push({ phase: 'corpse', role, name: `${role}-corpse` });
        }
        const f = fixture(scenarios[0].phase);
        await context.addInitScript(([key, raw]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, [SESSION_KEY, f.raw]);
        const page = await context.newPage(); page.setDefaultTimeout(60000);
        page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        for (const { phase, role, name } of scenarios) {
            const saved = fixture(phase, role);
            if (name !== scenarios[0].name) await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, saved.raw]);
            await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs', { waitUntil: 'load' });
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
                return { phase: actor.tactics.phase, reloading: !!actor.state.reloading, cue: gfx.telegraph.visible, boundary: actor.tactics.boundary,
                    bodyArt, corpseArt, artStyle: h.view.tex.actorStyle(actor.kind, variant),
                    weapon: actor.weapon, version: JSON.parse(localStorage.getItem('escape-bincov.session.v2')).version };
            }, saved.uid);
            assert.equal(actual.phase, ['parley', 'corpse'].includes(phase) ? 'idle' : phase);
            if (phase !== 'corpse') assert.ok(actual.cue);
            assert.equal(actual.reloading, phase === 'reload');
            assert.equal(actual.weapon, phase === 'parley' ? 'rifle' : role === 'raider-melee' ? 'club' : 'pistol'); assert.equal(actual.version, 7);
            if (phase !== 'parley') {
                assert.equal(actual.artStyle, role); assert.ok(phase === 'corpse' ? actual.corpseArt : actual.bodyArt);
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
        }
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
