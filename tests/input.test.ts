import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActiveClock, PlayerInput } from '../src/input';

test('two independent thumbs, third pointer ownership and cancel do not stick', () => {
  const input = new PlayerInput(); input.touch = true;
  assert.ok(input.beginStick('move', 1)); assert.ok(input.beginStick('aim', 2));
  assert.equal(input.beginStick('aim', 3), false);
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 0, -1);
  let frame = input.read(); assert.equal(frame.x, 1); assert.equal(frame.sprint, true); assert.equal(frame.fireHeld, true);
  input.release(3); assert.equal(input.read().fireHeld, true);
  input.release(2); frame = input.read(); assert.equal(frame.fireHeld, false); assert.equal(frame.x, 1);
  input.clear(); frame = input.read(); assert.equal(frame.x, 0); assert.equal(frame.interactHeld, false);
});
test('aim-only inner ring, held fire outer ring, no shot on release or resume', () => {
  const input = new PlayerInput(); input.touch = true; input.beginStick('aim', 2);
  input.moveStick('aim', 2, .35, 0); assert.ok(input.read().aim); assert.equal(input.read().fireHeld, false);
  input.moveStick('aim', 2, .8, 0); assert.equal(input.read().fireHeld, true);
  assert.equal(input.read(false).fireHeld, false);
  input.clear(); input.release(2); assert.equal(input.read().firePressed, false); assert.equal(input.read().fireHeld, false);
});
test('desktop remains press-to-fire; command repeats and lost releases are cleared', () => {
  const input = new PlayerInput(); input.mouse(0, true);
  assert.equal(input.read().firePressed, true); assert.equal(input.read().firePressed, false); assert.equal(input.read().fireHeld, false);
  input.key('R', true); assert.ok(input.read().actions.has('reload'));
  input.key('R', true); assert.equal(input.read().actions.size, 0);
  input.key('e', true); input.clear(); assert.equal(input.read().interactHeld, false);
});
test('clock counts a 125ms frame in full and resets across pause', () => {
  const clock = new ActiveClock(); clock.tick(1000);
  const frame = clock.tick(1125); assert.equal(frame.seconds, .125); assert.equal(frame.steps, 4);
  assert.equal(clock.tick(2125).stalled, true);
  clock.reset(); assert.equal(clock.tick(90000).seconds, 0);
});
