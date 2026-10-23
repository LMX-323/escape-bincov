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

const out = resolve('test-results/enemy-browser'); await mkdir(out, { recursive: true });
const report = { screenshots: [], cases: [], errors: [], external: [], status: 'RUNNING' };
function fixture(phase) {
    const data = new Map(), state = createSessionState();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout'; assert.ok(saves.beginRun(42, true), state.storageError);
    const raid = state.expansion.raid, e = raid.maps.coast.enemies.find(e => e.id === 'raider-gunner');
    const context = { definition: BUILDING_WORLD.maps.coast, doors: raid.maps.coast.doors, highTide: raid.highTide };
    const p = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(a => ({ x: e.x + Math.cos(a) * 96, y: e.y + Math.sin(a) * 96 }))
        .find(p => traversable(context, p, 'body', 10) && corridor(context, e, p, 'sight'));
    assert.ok(p, 'a visible, safe observation point');
    raid.player = { ...p, rotation: Math.atan2(e.y - p.y, e.x - p.x) };
    Object.assign(e.tactics, { phase, phaseLeft: phase === 'windup' ? .65 : phase === 'reload' ? 1.8 : .4,
        lockedAim: Math.atan2(p.y - e.y, p.x - e.x), magazine: 1, reserve: 4, stance: 'hostile', awareness: 1,
        memory: { at: p, time: 0, source: 'sight', target: 'player' } });
    assert.ok(saves.persist(), state.storageError);
    const raw = data.get(SESSION_KEY); decodeSession(raw);
    return { raw, uid: e.uid };
}
const browser = await chromium.launch(browserOptions);
try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
        const context = await browser.newContext({ viewport, offline: true }); await resumeStalls(context);
        const f = fixture('windup');
        await context.addInitScript(([key, raw]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, [SESSION_KEY, f.raw]);
        const page = await context.newPage(); page.setDefaultTimeout(60000);
        page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        for (const phase of ['windup', 'reload', 'recovery']) {
            const saved = fixture(phase);
            if (phase !== 'windup') await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, saved.raw]);
            await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs', { waitUntil: 'load' });
            await page.locator('[data-action="enter"]').click(); await raidReady(page);
            await drive(page, 'freezeAI', true);
            const resume = page.locator('.coast-sample [data-do="resume"]');
            if (await resume.isVisible()) await resume.click();
            await frames(page, 20);
            const actual = await page.evaluate(uid => {
                const h = window.__bincovSample.host, actor = h.lastBatch.frame.actors.find(a => a.uid === uid), gfx = h.view.actors.get(uid);
                return { phase: actor.tactics.phase, reloading: !!actor.state.reloading, cue: gfx.telegraph.visible,
                    weapon: actor.weapon, version: JSON.parse(localStorage.getItem('escape-bincov.session.v2')).version };
            }, saved.uid);
            assert.equal(actual.phase, phase); assert.ok(actual.cue); assert.equal(actual.reloading, phase === 'reload');
            assert.equal(actual.weapon, 'pistol'); assert.equal(actual.version, 6);
            const file = `${viewport.width}x${viewport.height}-${phase}.png`;
            await page.screenshot({ path: resolve(out, file) }); report.screenshots.push(file); report.cases.push({ viewport, phase, ...actual });
        }
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
