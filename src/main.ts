import Phaser from 'phaser';
import { BootScene, MenuScene, HideoutScene, RaidScene, ResultScene } from './game';
import { app, saveSession } from './app';
import { initSave, setOverlay, persist, toast, render } from './ui';
import { SAVE_KEY } from './domain';
initSave();
app.menuMotion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
app.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: '#122021', pixelArt: true, roundPixels: true, antialias: false, audio: { noAudio: true }, input: { mouse: { preventDefaultWheel: true } }, fps: { target: 60, smoothStep: true }, scene: [BootScene, MenuScene, HideoutScene, RaidScene, ResultScene], render: { powerPreference: 'high-performance' } });
function resize() { const scale = Math.max(.25, Math.floor(Math.min(innerWidth / 960, innerHeight / 540)) || Math.min(innerWidth / 960, innerHeight / 540)); document.getElementById('frame')!.style.transform = `scale(${scale})`; if (app.game?.canvas)
    app.game.scale.updateBounds();
else
    setTimeout(resize, 50); }
addEventListener('resize', resize);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    if (!e.matches) return;
    app.menuMotion = false;
    if (app.state === 'menu') {
        app.game?.scene.getScene('Menu').events.emit('title-motion', false);
        render();
    }
});
addEventListener('beforeunload', e => { if (app.pendingSettlement) { e.preventDefault(); e.returnValue = ''; } });
resize();
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden && app.state === 'run')
    setOverlay('pause'); });
addEventListener('keydown', e => { if ((e.target as HTMLElement).tagName === 'INPUT')
    return; if (app.state === 'menu' && app.overlay && e.key === 'Tab') {
    e.preventDefault();
    document.querySelector<HTMLButtonElement>('#ui .modal button')?.focus();
    return;
} if (app.state === 'run' && ['Tab', ' ', 'Escape'].includes(e.key))
    e.preventDefault(); if (e.repeat)
    return; if (app.state === 'run') {
    if (e.key === 'Tab')
        setOverlay(app.overlay === 'inventory' ? '' : 'inventory');
    if (e.key.toLowerCase() === 'm')
        setOverlay(app.overlay === 'map' ? '' : 'map');
    if (e.key === 'Escape')
        setOverlay(app.overlay ? '' : 'pause');
}
else if (e.key === 'Escape')
    setOverlay(''); });
addEventListener('storage', e => { if (e.key === SAVE_KEY) {
    saveSession.markConflict();
    if (app.state === 'run') {
        setOverlay('pause');
        toast('另一个窗口修改了存档。请关闭此页，避免覆盖进度。');
        app.raid?.lock();
    }
    else {
        toast('另一个窗口修改了存档。刷新本页加载最新进度。');
    }
} });
// Deliberately opt-in for automated local acceptance; absent during normal play.
if (new URLSearchParams(location.search).has('test'))
    (window as any).__bincov = { app, persist, setOverlay };
