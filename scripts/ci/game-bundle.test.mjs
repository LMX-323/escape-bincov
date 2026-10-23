// #60 Q-B06: live diagnostics swap a variant of the formal game bundle into dist/index.html. Building it on every CI
// run catches a new source loader, a moved probe target or a copied set of esbuild options here, not at the start of a
// manual diagnostic. Building is all this checks: a diagnostic that starts can still fail or stay PARTIAL.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGameScript, pagePoolProbe, withGameScript } from '../game-bundle.mjs';

test('the heap diagnostics build the formal game bundle unminified with the page-pool probe', async () => {
  const js = await buildGameScript({ minify: false, plugins: [pagePoolProbe] });
  assert.ok(js.includes('globalThis.__solPagePool = () =>'), 'the probe must reach src/pixi-app.ts');
});

test('scripts build the game bundle through game-bundle.mjs instead of copying its options', () => {
  const copies = readdirSync('scripts', { recursive: true }).filter(path => /\.(m?js|ts)$/.test(path) && path !== 'game-bundle.mjs')
    .filter(path => /entryPoints\s*:\s*\[\s*['"]src\/main\.ts['"]/.test(readFileSync(`scripts/${path}`, 'utf8')));
  assert.deepEqual(copies, [], 'Use buildGameScript and override only what differs, such as minify or a probe plugin.');
});

test('a swapped game script replaces only the last inline script and cannot end it early', () => {
  assert.equal(withGameScript('<script>keep</script><p></p><script>old</script></body>', 'a="</script>"'),
    '<script>keep</script><p></p><script>a="<\\/script>"</script></body>');
});
