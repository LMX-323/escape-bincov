import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { knownDoor, knownStructurePoint, occupiedStructure, structureContains } from '../src/coast-view/structure-guide';

function fixture() {
  const state = createSessionState(), data = new Map<string, string>();
  const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
  assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42, true), true); state.state = 'run';
  const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
  const at = (x: number, y: number, map = 'coast') => { driver.placePlayer({ x, y }, 0, map); return runtime.advance(0, emptyIntent()); };
  return { runtime, driver, at };
}

test('outside a closed building only the exterior doorway is marked, not its internal doors or stairs', () => {
  const f = fixture(), { map, frame } = f.at(464, 448), occupied = occupiedStructure(map, frame.player);
  assert.equal(occupied, null);
  assert.deepEqual(map.doors.filter(d => knownDoor(map, d, frame.revealed, occupied)).map(d => d.id), ['resident-front']);
  assert.equal(map.entries.some(e => knownStructurePoint(map, e.at, frame.revealed, occupied)), false);
  assert.ok(Object.values(frame.revealed).every(v => !v));
});

test('entering cuts away only the occupied building, including its full southern wall', () => {
  const f = fixture(), { map, frame } = f.at(464, 336), occupied = occupiedStructure(map, frame.player);
  assert.ok(occupied); assert.equal(occupied.name, '褪色居民楼');
  assert.ok(map.doors.every(d => knownDoor(map, d, frame.revealed, occupied)));
  assert.ok(map.entries.every(e => knownStructurePoint(map, e.at, frame.revealed, occupied)));
  assert.equal(structureContains(map, occupied, { x: 592, y: 400 }), true);
  assert.equal(structureContains(map, occupied, { x: 640, y: 400 }), false);
  assert.equal(occupiedStructure(map, { x: 464, y: 432 }), null);
});

test('a layered floor includes its landing and perimeter while hidden room permissions stay unchanged', () => {
  const f = fixture(), { map, frame } = f.at(176, 80, 'resident-f2'), before = JSON.stringify(frame);
  const occupied = occupiedStructure(map, frame.player); assert.ok(occupied);
  assert.equal(map.regions.some(r => frame.player.x >= r.x && frame.player.x < r.x + r.w && frame.player.y >= r.y && frame.player.y < r.y + r.h), false);
  assert.equal(structureContains(map, occupied, { x: 16, y: 304 }), true);
  assert.ok(map.doors.every(d => knownDoor(map, d, frame.revealed, occupied)));
  assert.ok(map.entries.every(e => knownStructurePoint(map, e.at, frame.revealed, occupied)));
  const west = map.regions.find(r => r.id.endsWith('/west-home'))!;
  assert.equal(frame.revealed[west.id], false);
  assert.ok(frame.actors.some(a => a.regionId === west.id));
  assert.equal(JSON.stringify(frame), before, 'cutaway reads must not alter dynamic visibility or world state');
  assert.equal(map.key.mapId, 'resident-f2'); assert.ok(map.entries.every(e => e.targetMap === 'coast'));
});

test('unknown overlapping rooms keep static cues covered outside the occupied building', () => {
  const f = fixture(), { map } = f.at(464, 448), point = { x: 464, y: 336 }, region = map.regions[0];
  const overlapped = { ...map, regions: [...map.regions, { ...region, id: 'hidden-overlap' }] };
  assert.equal(knownStructurePoint(overlapped, point, { [region.id]: true }, null), false);
  assert.equal(knownStructurePoint(overlapped, point, { [region.id]: true, 'hidden-overlap': true }, null), true);
});
