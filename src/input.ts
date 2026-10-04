/** Device-independent intentions. No gameplay rules or renderer objects live here. */
export type InputAction = 'reload' | 'heal' | 'primary' | 'knife' | 'interact';
export interface InputFrame {
  x: number; y: number; sprint: boolean; aim: { x: number; y: number } | null;
  pointer: { x: number; y: number }; precise: boolean;
  firePressed: boolean; fireHeld: boolean; interactHeld: boolean;
  actions: ReadonlySet<InputAction>; touch: boolean;
}
type Stick = { id: number; x: number; y: number; distance: number };
const actionKeys: Record<string, InputAction> = { r: 'reload', q: 'heal', '1': 'primary', '2': 'knife', e: 'interact' };
export class PlayerInput {
  touch = false;
  pointer = { x: 480, y: 270 };
  private keys = new Set<string>();
  private actions = new Set<InputAction>();
  private sticks = new Map<'move' | 'aim', Stick>();
  private mouseFire = false;
  private pressed = false;
  private precise = false;
  private interaction: number | null = null;

  key(key: string, down: boolean) {
    key = key.toLowerCase();
    if (down && !this.keys.has(key) && actionKeys[key]) this.actions.add(actionKeys[key]);
    if (down) this.keys.add(key); else this.keys.delete(key);
  }
  mouse(button: number, down: boolean) {
    if (button === 0) { if (down && !this.mouseFire) this.pressed = true; this.mouseFire = down; }
    if (button === 2) this.precise = down;
  }
  press(action: InputAction) { this.actions.add(action); }
  beginStick(kind: 'move' | 'aim', id: number): boolean {
    if (this.sticks.has(kind) || [...this.sticks.values()].some(s => s.id === id)) return false;
    this.sticks.set(kind, { id, x: 0, y: 0, distance: 0 });
    return true;
  }
  moveStick(kind: 'move' | 'aim', id: number, x: number, y: number) {
    const stick = this.sticks.get(kind);
    if (!stick || stick.id !== id) return;
    const distance = Math.min(1, Math.hypot(x, y)), length = Math.max(1, Math.hypot(x, y));
    Object.assign(stick, { x: x / length, y: y / length, distance });
  }
  interact(id: number) {
    if (this.interaction !== null) return false;
    this.interaction = id; this.press('interact'); return true;
  }
  release(id: number) {
    for (const [kind, stick] of this.sticks) if (stick.id === id) this.sticks.delete(kind);
    if (this.interaction === id) this.interaction = null;
  }
  clear() {
    this.keys.clear(); this.actions.clear(); this.sticks.clear();
    this.mouseFire = this.pressed = this.precise = false; this.interaction = null;
  }
  read(enabled = true): InputFrame {
    const move = this.sticks.get('move'), aim = this.sticks.get('aim');
    const frame: InputFrame = {
      x: this.touch ? (move && move.distance > .18 ? move.x : 0) : Number(this.keys.has('d')) - Number(this.keys.has('a')),
      y: this.touch ? (move && move.distance > .18 ? move.y : 0) : Number(this.keys.has('s')) - Number(this.keys.has('w')),
      sprint: this.touch ? !!move && move.distance >= .9 : this.keys.has('shift'),
      aim: this.touch && aim && aim.distance > .18 ? { x: aim.x, y: aim.y } : null,
      pointer: { ...this.pointer }, precise: !this.touch && this.precise,
      firePressed: !this.touch && this.pressed,
      fireHeld: this.touch && !!aim && aim.distance >= .62,
      interactHeld: this.touch ? this.interaction !== null : this.keys.has('e'),
      actions: new Set(this.actions), touch: this.touch,
    };
    this.actions.clear(); this.pressed = false;
    if (!enabled) { frame.x = frame.y = 0; frame.sprint = frame.precise = frame.firePressed = frame.fireHeld = frame.interactHeld = false; frame.aim = null; frame.actions = new Set(); }
    return frame;
  }
}
export const playerInput = new PlayerInput();

/** Wall-clock foreground time; simulation uses bounded substeps, never a clamped clock. */
export class ActiveClock {
  private previous: number | null = null;
  reset() { this.previous = null; }
  tick(now: number) {
    const seconds = this.previous === null ? 0 : Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    return { seconds, stalled: seconds > .5, steps: Math.max(1, Math.ceil(Math.min(seconds, .5) / .04)) };
  }
}
