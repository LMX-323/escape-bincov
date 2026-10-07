import assert from 'node:assert/strict';

/** Controlled renderer probe, not a gameplay screenshot: clone the actual desk
 * texture over black at a quarter-pixel offset and compare a painted pixel to the
 * framebuffer. A low-resolution linear filter mixes it with the previous pixel. */
export async function checkPixelEdge(page) {
  const previous = page.viewportSize();
  await page.setViewportSize({ width: 1920, height: 1080 });
  try {
    // Browser viewport changes and Phaser's resize listener are asynchronous.
    // Sample only after layout and two display frames have consumed the resize.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const result = await page.evaluate(async () => {
      const game = window.__bincov.app.game, scene = game.scene.getScene('Menu');
      const originalKey = 'title-desk-master-v3';
      const source = scene.textures.get(originalKey).getSourceImage();
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
      let key;
      for (const group of scene.children.list) for (const image of group.list || [])
        if (image.texture?.key.startsWith(originalKey)) key = image.texture.key;
      if (!key) throw new Error('Actual desk image missing');
      const black = scene.add.rectangle(0, 0, 960, 540, 0x000000).setOrigin(0).setDepth(9999);
      const probe = scene.add.image(.25, 0, key).setOrigin(0).setDisplaySize(source.width, source.height).setDepth(10000);
      try {
        const scale = game.canvas.width / 960;
        // Area snapshots use the same top-left convention in Canvas and WebGL.
        const sample = () => new Promise((done, reject) => game.renderer.snapshotArea(
          Math.floor((point.x + .75) * scale), Math.floor((point.y + .75) * scale), 1, 1, image => {
            if (!image) { reject(new Error('Framebuffer snapshot failed')); return; }
            const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1;
            const context = pixel.getContext('2d'); context.drawImage(image, 0, 0);
            done([...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]);
          }));
        const actual = await sample(), repeated = await sample();
        return { ...point, actual, repeated, error: Math.max(...actual.map((c, i) => Math.abs(c - point.expected[i]))),
          surface: [game.canvas.width, game.canvas.height], renderer: game.renderer.type };
      } finally { probe.destroy(); black.destroy(); }
    });
    assert.ok(result.error <= 1, `A painted pixel was blurred into its neighbour (RGB error ${result.error})`);
    assert.deepEqual(result.surface, [1920, 1080], 'Title is stretched from a low-resolution render surface');
    assert.deepEqual(result.actual, result.repeated, 'A stationary opaque pixel retained previous frame history');
    return result;
  } finally { await page.setViewportSize(previous); }
}
