import assert from 'node:assert/strict';

/** Controlled renderer probe, not a gameplay screenshot: draw the actual desk
 * texture over black at a quarter-pixel offset and compare a painted pixel to the
 * framebuffer. A low-resolution linear filter mixes it with the previous pixel. */
export async function checkPixelEdge(page) {
  const previous = page.viewportSize();
  await page.setViewportSize({ width: 1920, height: 1080 });
  try {
    // Browser viewport changes and the title's resize listener are asynchronous.
    // Sample only after layout and two display frames have consumed the resize.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const result = await page.evaluate(async () => {
      const { app } = window.__bincov.title.debug();
      let desk;
      const visit = node => { if (node.layer === 'desk') desk = node; for (const child of node.children ?? []) visit(child); };
      visit(app.stage);
      if (!desk) throw new Error('Actual desk image missing');
      const source = desk.texture.source.resource;
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
      let point;
      for (let y = 100; y < source.height - 1 && !point; y++) for (let x = 100; x < source.width - 1; x++) {
        const p = (y * source.width + x) * 4;
        const contrast = Math.max(...[0, 1, 2].map(c => Math.abs(pixels[p + c] - pixels[p - 4 + c])));
        if (pixels[p + 3] === 255 && pixels[p - 1] === 255 && contrast > 70) {
          point = { x, y, expected: [...pixels.slice(p, p + 3)], contrast }; break;
        }
      }
      if (!point) throw new Error('No opaque contrasting edge in the desk painting');
      // The scene's own classes and texture: a black plate and the desk drawn one texel per logical unit, .25 right.
      const Sprite = desk.constructor, Texture = desk.texture.constructor;
      const black = new Sprite(Texture.WHITE); black.tint = 0x000000; black.width = 960; black.height = 540;
      const probe = new Sprite(desk.texture); probe.position.set(.25, 0); probe.width = source.width; probe.height = source.height;
      app.stage.addChild(black, probe);
      try {
        const scale = app.renderer.width / 960, gl = app.renderer.gl;
        // Read the default framebuffer right after rendering, before the page composites it.
        const sample = () => {
          app.renderer.render(app.stage);
          const pixel = new Uint8Array(4);
          gl.readPixels(Math.floor((point.x + .75) * scale), gl.drawingBufferHeight - 1 - Math.floor((point.y + .75) * scale), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          return [...pixel.slice(0, 3)];
        };
        const actual = sample(), repeated = sample();
        return { ...point, actual, repeated, error: Math.max(...actual.map((c, i) => Math.abs(c - point.expected[i]))),
          surface: [app.renderer.width, app.renderer.height], renderer: app.renderer.name };
      } finally { app.stage.removeChild(black, probe); probe.destroy(); black.destroy(); }
    });
    assert.ok(result.error <= 1, `A painted pixel was blurred into its neighbour (RGB error ${result.error})`);
    assert.deepEqual(result.surface, [1920, 1080], 'Title is stretched from a low-resolution render surface');
    assert.deepEqual(result.actual, result.repeated, 'A stationary opaque pixel retained previous frame history');
    return result;
  } finally { await page.setViewportSize(previous); }
}
