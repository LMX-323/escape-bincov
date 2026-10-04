import { playerInput, type InputAction } from './input';

export function installControls(overlay: (name: string) => void, isRunning: () => boolean, unlockAudio: () => void) {
  const root = document.getElementById('touch-controls')!;
  root.innerHTML = `<div class="touch-top"><button data-panel="map" aria-label="地图">地图</button><button data-panel="inventory" aria-label="背包">背包</button><button data-panel="pause" aria-label="暂停">Ⅱ</button></div>
    <div class="stick move-stick" data-stick="move" role="group" aria-label="移动摇杆，推到外圈冲刺"><span>移动 · 冲刺</span><i></i></div>
    <div class="touch-tools"><button data-command="heal" aria-label="快捷治疗">治疗</button><button data-command="knife" aria-label="切换匕首">匕首</button><button data-command="primary" aria-label="切换主武器">主武器</button></div>
    <div class="touch-combat"><button data-command="reload" aria-label="换弹">换弹</button><button id="touch-interact" aria-label="拾取或按住撤离">交互</button></div>
    <div class="stick aim-stick" data-stick="aim" role="group" aria-label="瞄准摇杆，推到外圈连续开火"><span>瞄准 · 开火</span><i></i></div>`;
  const owners = new Map<number, HTMLElement>();
  const clearVisuals = () => {
    for (const [id, el] of owners) { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); }
    owners.clear(); root.querySelectorAll<HTMLElement>('.stick').forEach(el => { el.classList.remove('active', 'firing'); el.style.setProperty('--stick-x','0px'); el.style.setProperty('--stick-y','0px'); });
  };
  const usable = () => playerInput.touch && isRunning() && !document.documentElement.dataset.overlay;
  const capture = (e: PointerEvent, el: HTMLElement) => { e.preventDefault(); el.setPointerCapture(e.pointerId); owners.set(e.pointerId, el); unlockAudio(); };
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-stick]'))) {
    const kind = el.dataset.stick as 'move' | 'aim';
    const move = (e: PointerEvent) => {
      if (owners.get(e.pointerId) !== el) return;
      const r = el.getBoundingClientRect(), radius = r.width * .38;
      const x = (e.clientX - r.left - r.width / 2) / radius, y = (e.clientY - r.top - r.height / 2) / radius;
      playerInput.moveStick(kind, e.pointerId, x, y);
      const length = Math.max(1, Math.hypot(x, y));
      el.style.setProperty('--stick-x', `${x / length * radius}px`); el.style.setProperty('--stick-y', `${y / length * radius}px`);
      el.classList.add('active'); el.classList.toggle('firing', kind === 'aim' && Math.hypot(x, y) >= .62);
    };
    el.onpointerdown = e => { if (!usable() || !playerInput.beginStick(kind, e.pointerId)) return; capture(e, el); move(e); };
    el.onpointermove = move;
  }
  const interact = document.getElementById('touch-interact')!;
  interact.onpointerdown = e => { if (usable() && playerInput.interact(e.pointerId)) capture(e, interact); };
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-command]'))) el.onpointerdown = e => {
    if (!usable()) return; e.preventDefault(); unlockAudio(); playerInput.press(el.dataset.command as InputAction);
  };
  for (const el of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-panel]'))) el.onclick = () => {
    if (usable()) overlay(el.dataset.panel!);
  };
  const release = (e: PointerEvent) => {
    const el = owners.get(e.pointerId); if (!el) return;
    owners.delete(e.pointerId); playerInput.release(e.pointerId);
    el.classList.remove('active','firing'); el.style.setProperty('--stick-x','0px'); el.style.setProperty('--stick-y','0px');
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release); root.addEventListener('lostpointercapture', release);
  document.addEventListener('bincov-ui', () => { if (!usable()) { playerInput.clear(); clearVisuals(); } });
  return clearVisuals;
}
