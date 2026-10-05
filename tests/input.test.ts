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
  assert.equal(clock.tick(4125).stalled, true);
  clock.reset(); assert.equal(clock.tick(90000).seconds, 0);
});
test('phone layout accepts keyboard movement, sprint, interaction and single-shot mouse input', () => {
  const input = new PlayerInput(); input.touch = true;
  input.key('w', true); input.key('d', true); input.key('shift', true); input.key('e', true);
  input.mouse(2, true); input.mouse(0, true);
  const frame = input.read();
  assert.equal(frame.x, 1); assert.equal(frame.y, -1); assert.equal(frame.sprint, true);
  assert.equal(frame.interactHeld, true); assert.equal(frame.precise, true); assert.equal(frame.firePressed, true);
  assert.equal(frame.fireHeld, false); assert.equal(input.read().firePressed, false);
  input.mouse(0, false); input.mouse(2, false); input.key('w', false); input.key('d', false);
  input.key('shift', false); input.key('e', false);
  const released = input.read();
  assert.equal(released.x, 0); assert.equal(released.y, 0); assert.equal(released.precise, false);
  assert.equal(released.sprint, false); assert.equal(released.interactHeld, false); assert.equal(released.firePressed, false);
});
test('active sticks take priority without discarding held physical keys', () => {
  const input = new PlayerInput(); input.touch = true;
  input.key('d', true); input.mouse(2, true);
  input.beginStick('move', 1); input.moveStick('move', 1, -1, 0);
  input.beginStick('aim', 2); input.moveStick('aim', 2, 0, 1);
  const touch = input.read();
  assert.equal(touch.x, -1); assert.deepEqual(touch.aim, { x: 0, y: 1 });
  assert.equal(touch.fireHeld, true); assert.equal(touch.precise, false);
  input.release(1); input.release(2);
  const physical = input.read();
  assert.equal(physical.x, 1); assert.equal(physical.aim, null); assert.equal(physical.precise, true);
  assert.equal(physical.fireHeld, false);
  input.clear(); assert.equal(input.read().x, 0); assert.equal(input.read().precise, false);
});

test('closing a loot panel does not reuse held movement, fire, aim or interaction', () => {
  const input = new PlayerInput();
  input.key('w', true); input.key('shift', true); input.key('e', true);
  input.mouse(0, true); input.mouse(2, true);
  input.suppressHeld(); input.clear();
  input.key('w', true); input.key('shift', true); input.key('e', true);
  input.mouse(0, true); input.mouse(2, true);
  const blocked = input.read();
  assert.equal(blocked.y, 0); assert.equal(blocked.sprint, false); assert.equal(blocked.interactHeld, false);
  assert.equal(blocked.firePressed, false); assert.equal(blocked.precise, false); assert.equal(blocked.actions.size, 0);
  input.key('d', true); assert.equal(input.read().x, 1);
  input.key('w', false); input.key('shift', false); input.key('e', false);
  input.mouse(0, false); input.mouse(2, false);
  input.key('w', true); input.key('shift', true); input.key('e', true);
  input.mouse(0, true); input.mouse(2, true);
  const fresh = input.read();
  assert.equal(fresh.y, -1); assert.equal(fresh.sprint, true); assert.equal(fresh.interactHeld, true);
  assert.equal(fresh.firePressed, true); assert.equal(fresh.precise, true); assert.ok(fresh.actions.has('interact'));
});

test('the E press used to close loot is blocked even when the overlay did not forward keydown', () => {
  const input = new PlayerInput();
  input.suppressHeld('E'); input.clear(); input.key('e', true);
  assert.equal(input.read().interactHeld, false);
  input.key('e', false); input.key('e', true);
  assert.equal(input.read().interactHeld, true);
});

test('opening loot cancels active touch sticks and does not resume them on pointer movement', () => {
  const input = new PlayerInput(); input.touch = true;
  input.beginStick('move', 1); input.beginStick('aim', 2); input.interact(3);
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 1, 0);
  input.suppressHeld();
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 1, 0);
  const blocked = input.read();
  assert.equal(blocked.x, 0); assert.equal(blocked.fireHeld, false); assert.equal(blocked.interactHeld, false);
  input.release(1); input.release(2); input.release(3);
  assert.ok(input.beginStick('move', 1)); input.moveStick('move', 1, 1, 0);
  assert.equal(input.read().x, 1);
});
