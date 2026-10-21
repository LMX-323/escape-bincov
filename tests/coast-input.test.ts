import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputState, inputKey } from '../src/coast-view/input';

// InputState reads innerWidth/innerHeight in a field initializer; Node has no window.
Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720 });
const pointerAim = () => 1.25;

test('touch: with the aim stick idle the body faces the move stick direction, and moving never fires (F08)', () => {
  const input = new InputState(); input.touch = true;
  input.beginStick('move', 1); input.moveStick('move', 1, 0, .5);
  const r = input.read(true, pointerAim);
  assert.equal(r.aim, Math.PI / 2); assert.deepEqual(r.move, { x: 0, y: .5, sprint: false });
  assert.equal(r.fireHeld, false); assert.equal(r.firePressed, false); assert.equal(r.source, 'touch');
  // Full deflection (sprint) still only faces, never fires.
  input.moveStick('move', 1, -1, 0);
  const sprint = input.read(true, pointerAim);
  assert.equal(sprint.aim, Math.PI); assert.equal(sprint.move.sprint, true); assert.equal(sprint.fireHeld, false);
});

test('touch: a held aim stick overrides the move stick and alone decides firing', () => {
  const input = new InputState(); input.touch = true;
  input.beginStick('move', 1); input.moveStick('move', 1, 1, 0);
  input.beginStick('aim', 2); input.moveStick('aim', 2, 0, -.4);
  let r = input.read(true, pointerAim);
  assert.equal(r.aim, -Math.PI / 2); assert.equal(r.fireHeld, false);
  input.moveStick('aim', 2, 0, -.8); r = input.read(true, pointerAim);
  assert.equal(r.aim, -Math.PI / 2); assert.equal(r.fireHeld, true);
  // Releasing the aim stick hands the facing back to the move stick, and firing stops.
  input.release(2); r = input.read(true, pointerAim);
  assert.equal(r.aim, 0); assert.equal(r.fireHeld, false);
});

test('touch: a move stick inside the dead zone, keyboard movement and no stick all leave the aim null', () => {
  const input = new InputState(); input.touch = true;
  assert.equal(input.read(true, pointerAim).aim, null);
  input.beginStick('move', 1); input.moveStick('move', 1, .1, 0);
  assert.equal(input.read(true, pointerAim).aim, null, 'dead zone');
  input.release(1); input.key('d', true);
  const keys = input.read(true, pointerAim);
  assert.equal(keys.move.x, 1); assert.equal(keys.aim, null, 'keyboard-only movement');
});

test('desktop aim still follows the pointer; a disabled read clears the touch facing', () => {
  const input = new InputState();
  input.key('a', true); assert.equal(input.read(true, pointerAim).aim, 1.25);
  const touch = new InputState(); touch.touch = true;
  touch.beginStick('move', 1); touch.moveStick('move', 1, 0, 1);
  const off = touch.read(false, pointerAim);
  assert.equal(off.aim, null); assert.deepEqual(off.move, { x: 0, y: 0, sprint: false }); assert.equal(off.fireHeld, false);
});

test('keys go by physical key: Shift+2 picks the knife, a 1 released under Shift is released, AZERTY digits work', () => {
  const input = new InputState(), key = (k: string, code: string, down: boolean) => input.key(inputKey({ key: k, code }), down);
  // US layout, sprinting: Shift+2 reports "@".
  key('Shift', 'ShiftLeft', true); key('@', 'Digit2', true);
  let r = input.read(true, pointerAim);
  assert.deepEqual(r.commands, ['knife']); assert.equal(r.move.sprint, true);
  key('@', 'Digit2', false); key('Shift', 'ShiftLeft', false);
  // 1 pressed, Shift pressed, 1 released as "!": the next 1 is a fresh press again.
  key('1', 'Digit1', true); assert.deepEqual(input.read(true, pointerAim).commands, ['primary']);
  key('Shift', 'ShiftRight', true); key('!', 'Digit1', false); key('Shift', 'ShiftRight', false);
  key('1', 'Digit1', true); assert.deepEqual(input.read(true, pointerAim).commands, ['primary']);
  key('1', 'Digit1', false);
  // AZERTY: the digit row sends "&" and "é" without Shift; ZQSD sits where WASD is.
  key('é', 'Digit2', true); key('z', 'KeyW', true);
  r = input.read(true, pointerAim);
  assert.deepEqual(r.commands, ['knife']); assert.equal(r.move.y, -1);
  // Keys outside letters, digits and Shift (or events without a code) keep their key value.
  assert.equal(inputKey({ key: 'Escape', code: 'Escape' }), 'Escape'); assert.equal(inputKey({ key: 'd', code: '' }), 'd');
});
