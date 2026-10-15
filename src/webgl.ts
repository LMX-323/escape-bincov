/**
 * Every game view draws with WebGL (PixiJS). Without it Pixi silently falls back to Canvas 2D, which loses the additive
 * light pass (people turn into black silhouettes), so devices without WebGL are no longer supported: the page shows a
 * notice instead of the game and never reads or writes the save.
 */

/**
 * The same test as PixiJS's isWebGLSupported: a WebGL context with a stencil buffer. Unlike Pixi it does not force the
 * probe's context lost (WEBGL_lose_context): in Chrome that held up the page's later contexts, so Phaser's title scene
 * sometimes had not started yet when the menu was shown (test:title). The probe canvas is simply dropped, as Phaser
 * drops its own.
 */
export function webglSupported(): boolean {
    try {
        if (typeof WebGLRenderingContext === 'undefined') return false;
        const gl = document.createElement('canvas').getContext('webgl', { stencil: true, failIfMajorPerformanceCaveat: false });
        return !!gl?.getContextAttributes()?.stencil;
    } catch {
        return false;
    }
}

export function showWebglRequired() {
    document.getElementById('frame')?.remove();
    const notice = document.createElement('section');
    notice.className = 'webgl-required panel';
    notice.setAttribute('role', 'alert');
    notice.innerHTML = '<div class="section-label">逃离滨科夫</div><h2>需要支持 WebGL 的浏览器</h2>'
        + '<p>这台设备或浏览器不能使用 WebGL，游戏画面无法显示。</p>'
        + '<p>请换用新版 Chrome 或 Edge 打开，并确认浏览器设置里已开启图形加速。</p>'
        + '<p class="muted">存档仍在这个浏览器里，没有改动。</p>';
    document.body.appendChild(notice);
}
