import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { emptyIntent } from '../src/raid-runtime/runtime';
import { SESSION_KEY } from '../src/recovery-store';
import { unsteadyAim, SAMPLE_GUNS } from '../src/shooting';
import { benchRaid, arm, replay, reopen, mouse, mouseHold } from './fixtures/shooting-bench';

// S5 of PR #39: weapon handling is never saved (maintainer, 2026-10-22). These checks hold the save boundary: the
// record keeps its format, a reload starts the aim at its worst, failed writes cannot reset it, and the sample rifle
// and its endless reserve never reach the loadout or the bag.
// ('sample' alone is an item id, so the sample rifle is looked for by its own id.)
const HANDLING_WORDS = ['handling', 'bloom', 'drift', 'sway', 'raise', 'feel', 'trigger', 'clickLeft', 'sampleGun', 'm4a1'];

test('a refresh mid-fight saves no handling: the new Runtime starts unsteady with the saved rounds, cooldown and bullets', () => {
    const b = arm(benchRaid(), 'pistol');
    replay(b, mouse([0, .3, .6]), .62, 60);
    assert.ok(b.runtime.handling.bloom > 0 && b.runtime.handling.drift > 0);
    assert.ok(b.runtime.checkpoint());
    const raw = b.data.get(SESSION_KEY)!;
    for (const word of HANDLING_WORDS) assert.equal(raw.includes(`"${word}"`), false, word);
    const saved = b.runtime.snapshot();
    const page = reopen(b), r = page.runtime;
    assert.deepEqual(r.handling, unsteadyAim());
    assert.equal(r.mag, D.WEAPONS.pistol.magazine - 3);
    assert.equal(r.fireCooldown, saved.fireCooldown);
    assert.deepEqual(r.bullets.map(x => x.uid), saved.bullets.map(x => x.uid));
    // Within a second of play the reopened aim is calm again; it never starts better than it was.
    assert.ok(r.current().frame.hud.aim.cone > b.runtime.current().frame.hud.aim.cone);
});

test('the sample rifle never reaches the save: checkpoints keep the real gun, its rounds and the bag', () => {
    const b = arm(benchRaid(), 'm4a1', { reserve: 60 }), r = b.runtime;
    const bag = structuredClone(r.session.loadout!.bag);
    // Fifteen shots at .1 s from the sample's own 30-round magazine.
    replay(b, mouseHold(0, 1.45), 2, 60);
    assert.equal(r.mag, SAMPLE_GUNS.m4a1.magazine - 15);
    assert.ok(r.checkpoint());
    const record = b.saves.currentRecord()!, loadout = record.expansion!.raid!.loadout;
    assert.equal(loadout.weapon, 'carbine'); assert.equal(loadout.ammo, D.WEAPONS.carbine.magazine);
    assert.deepEqual(loadout.bag, bag);
    assert.equal(JSON.stringify(record).includes('m4a1'), false);
    r.setSampleGun(null);
    assert.equal(r.mag, D.WEAPONS.carbine.magazine); assert.equal(r.current().frame.hud.weapon.id, 'carbine');
    // A reopened page has the carbine; the sample was runtime-only.
    assert.equal(reopen(b).runtime.current().frame.hud.weapon.id, 'carbine');
});

test('a failed write rolls the world back but not the aim; a retried save does not reset it either', () => {
    const b = arm(benchRaid(), 'carbine'), r = b.runtime;
    replay(b, mouse([0, .25, .5]), .55, 60);
    const loot = r.loot[0] ?? null, before = { ...r.handling }, mag = r.mag;
    b.fail(true);
    assert.equal(r.checkpoint(), false);
    if (loot) r.pickupLoot(loot.uid);
    assert.deepEqual(r.handling, before);
    b.fail(false);
    assert.equal(r.retrySave(), true);
    assert.deepEqual(r.handling, before); assert.equal(r.mag, mag);
});

test('stairs keep bloom and drift, and a trigger held through them stays dead until released', () => {
    const b = benchRaid(), r = b.runtime;
    b.driver.freezeAI(true); b.driver.placePlayer({ x: 560, y: 272 }); b.driver.sampleGun('m4a1');
    r.handling = { raise: 0, sway: 0, bloom: .8, drift: .6, settle: 0 };
    const mag = r.mag, held = { ...emptyIntent(), aim: 0, fireHeld: true };
    r.advance(1000, { ...held, interactPressed: true, firePressed: true });
    assert.equal(r.current().stamp.world.mapId, 'resident-f2');
    assert.equal(r.mag, mag, 'no shot on the frame that took the stairs');
    assert.ok(r.handling.bloom > .5 && r.handling.drift > .3, JSON.stringify(r.handling));
    r.advance(1050, held); r.advance(1400, held); assert.equal(r.mag, mag);
    r.advance(1450, { ...emptyIntent(), aim: 0 }); r.advance(1500, { ...held, firePressed: true }); assert.equal(r.mag, mag - 1);
});

test('the endless sample reserve and a reload never duplicate the real rounds', () => {
    const b = arm(benchRaid(), 'carbine', { reserve: 24 }), r = b.runtime;
    const count = () => D.count(r.session.loadout!.bag, 'ammoR') + (r.sampleGun ? r.session.loadout!.ammo : r.mag);
    const total = count();
    b.driver.sampleGun('m4a1'); replay(b, mouseHold(0, 4.5), 5, 30); b.driver.sampleGun(null);
    assert.equal(count(), total);
    replay(b, mouse([0, .3, .6, .9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3, 3.3, 3.6]), 6, 30, undefined, 7000);
    // Twelve real shots empty the magazine and the thirteenth click starts a reload: what is left in the gun and the bag
    // is what was carried minus what was fired.
    assert.equal(count(), total - 12);
    assert.equal(r.mag, D.WEAPONS.carbine.magazine); assert.equal(D.count(r.session.loadout!.bag, 'ammoR'), total - 24);
});
