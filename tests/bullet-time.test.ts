import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { PublishedView } from '../src/raid-runtime/contract';

const LANE = { x: 208, y: 1104 };
const held = { ...emptyIntent(), aim: 0, fireHeld: true, source: 'touch' as const };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function fixture(layered: boolean) {
    const state = createSessionState(), data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const saves = new SaveSession(state, () => storage);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(42, layered)); state.state = 'run';
    const r = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(r, '?test=1');
    driver.freezeAI(true); driver.placePlayer(LANE, 0); driver.weapon('pistol');
    r.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 };
    return { r, driver, storage };
}
function shot(batch: PublishedView) {
    const event = batch.events.find(e => e.type === 'shot' && e.shooter === 'player');
    assert.ok(event?.type === 'shot'); return event;
}

for (const layered of [false, true]) {
    test(`a shot due exactly at the frame end has zero flight until the next frame (${layered})`, () => {
        const { r } = fixture(layered);
        r.advance(0, held);
        const birth = shot(r.advance(290, held)), pellet = birth.pellets[0], bullet = r.bullets.find(b => b.uid === pellet.bullet)!;
        assert.ok(bullet); close(bullet.x, pellet.origin.x); close(bullet.y, pellet.origin.y); close(bullet.left, 457);
        const before = { x: bullet.x, y: bullet.y };
        r.advance(300, held);
        const after = r.bullets.find(b => b.uid === pellet.bullet)!;
        close(Math.hypot(after.x - before.x, after.y - before.y), 7.6); close(after.left, 449.4);
    });

    test(`new and existing rounds travel the same distance across different frame partitions (${layered})`, () => {
        const results = [[300], [290, 300], [250, 300]].map(times => {
            const { r } = fixture(layered), first = shot(r.advance(0, held)).pellets[0];
            let second: ReturnType<typeof shot> | undefined;
            for (const now of times) {
                const batch = r.advance(now, held);
                if (batch.events.some(e => e.type === 'shot' && e.shooter === 'player')) second = shot(batch);
            }
            assert.ok(second); assert.equal(r.mag, 6);
            const one = r.bullets.find(b => b.uid === first.bullet)!, pellet = second.pellets[0];
            const two = r.bullets.find(b => b.uid === pellet.bullet)!;
            close(Math.hypot(one.x - first.origin.x, one.y - first.origin.y), 228);
            close(Math.hypot(two.x - pellet.origin.x, two.y - pellet.origin.y), 7.6);
            return { x: two.x, y: two.y, left: two.left, rng: r.snapshot().rng };
        });
        for (const result of results.slice(1)) {
            close(result.x, results[0].x); close(result.y, results[0].y); close(result.left, results[0].left);
            assert.equal(result.rng, results[0].rng);
        }
    });

    test(`a late-born round reaches a nearby wall on the following frame, exactly once (${layered})`, () => {
        const { r, driver } = fixture(layered);
        // Shared coast wall at x=320: the player's body is 10.5 px from its face.
        driver.placePlayer({ x: 309.5, y: 1168 }, 0); r.fireCooldown = .03;
        r.advance(0, held); const birth = r.advance(40, held), uid = shot(birth).pellets[0].bullet;
        assert.ok(r.bullets.some(b => b.uid === uid));
        assert.equal(birth.events.some(e => e.type === 'impact' && e.bullet === uid), false);
        const next = r.advance(50, held);
        assert.equal(next.events.filter(e => e.type === 'impact' && e.bullet === uid && e.reason === 'blocked').length, 1);
        assert.equal(r.bullets.some(b => b.uid === uid), false);
        assert.equal(r.advance(70, held).events.some(e => e.type === 'impact' && e.bullet === uid), false);
    });

    test(`late birth delays lethal contact without losing the death or corpse (${layered})`, () => {
        const { r, driver } = fixture(layered), uid = r.enemies[0].uid;
        driver.placeEnemy(uid, { x: LANE.x + 32, y: LANE.y }, 1); r.fireCooldown = .03;
        r.advance(0, held); const birth = r.advance(40, held);
        assert.equal(r.enemies.find(e => e.uid === uid)!.hp, 1);
        assert.equal(birth.events.some(e => e.type === 'death'), false);
        const contact = r.advance(60, held);
        assert.equal(r.enemies.find(e => e.uid === uid)!.hp, 0);
        assert.equal(contact.events.filter(e => e.type === 'death' && e.uid === uid).length, 1);
        assert.equal(r.kills, 1); assert.equal(r.containers.filter(c => c.id === `corpse-${uid}`).length, 1);
        assert.equal(r.advance(100, held).events.some(e => e.type === 'death'), false);
    });

    test(`a checkpoint needs no bullet birth metadata and restored bullets advance normally (${layered})`, () => {
        const { r, storage } = fixture(layered); r.fireCooldown = .03;
        r.advance(0, held); const pellet = shot(r.advance(40, held)).pellets[0];
        const bullet = r.bullets.find(b => b.uid === pellet.bullet)!;
        close(Math.hypot(bullet.x - pellet.origin.x, bullet.y - pellet.origin.y), 7.6);
        assert.ok(r.checkpoint());
        const state = createSessionState(), saves = new SaveSession(state, () => storage);
        assert.ok(saves.initialize()); assert.ok(saves.resumeRun()); state.state = 'run';
        const restored = new CoastRaidRuntime(state, saves); restored.freezeAI = true;
        assert.deepEqual(restored.bullets.find(b => b.uid === pellet.bullet), bullet);
        restored.advance(0, emptyIntent()); restored.advance(10, emptyIntent());
        const after = restored.bullets.find(b => b.uid === pellet.bullet)!;
        close(Math.hypot(after.x - pellet.origin.x, after.y - pellet.origin.y), 15.2);
    });
}
