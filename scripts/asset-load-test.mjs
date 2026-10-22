// Ordinary offline entry, fresh browser context per fault: no game test hooks or preloaded PNG cache.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { skipOpening } from './yard-entry.mjs';
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/asset-load'));
await mkdir(out, { recursive: true });
const report = { sha256: createHash('sha256').update(html).digest('hex'), checks: [], external: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const key = 'escape-bincov.session.v2';
try {
  for (const [asset, path] of [['station', 'assets/station/v1/station-npc-xu-s-idle-f0-v1.png'], ['coast', 'assets/coast/v1/coast-player-body-e-f0-v1.png']]) {
    const url = `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
    for (const fault of ['decode', 'draw']) {
      const row = { asset, fault }; report.checks.push(row);
      const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
      await context.route('https://assets.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
      context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://assets.test/')) report.external.push(r.url()); });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(({ url, fault }) => {
        window.__assetProbe = { consumed: 0, attempts: 0 };
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) {
          if (value === url) {
            window.__assetProbe.attempts++;
            if (fault === 'decode' && !window.__assetProbe.consumed) {
              window.__assetProbe.consumed++; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return;
            }
          }
          src.set.call(this, value);
        } });
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function(...args) {
          if (fault === 'draw' && args[0] instanceof HTMLImageElement && args[0].src === url && !window.__assetProbe.consumed) {
            window.__assetProbe.consumed++; throw new Error('injected cold PNG draw failure');
          }
          return draw.apply(this, args);
        };
      }, { url, fault });
      try {
        await page.goto('https://assets.test/');
        await page.locator('[data-action="enter"]').waitFor();
        const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, key);
        await page.locator('[data-action="enter"]').click(); await skipOpening(page);
        await page.locator('[data-action="base-enter"]').waitFor();
        assert.equal(await page.locator('#station-yard').count(), 0, 'failed cold load must remove the yard and restore usable tabs');
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, key), before);
        assert.deepEqual(await page.evaluate(() => [typeof window.__bincov, typeof window.__station]), ['undefined', 'undefined']);
        await page.locator('[data-action="base-enter"]').click();
        await page.locator('#station-yard [data-quick="gear"]').waitFor();
        assert.equal(await page.locator('#station-yard').count(), 1);
        row.probe = await page.evaluate(() => window.__assetProbe);
        assert.equal(row.probe.consumed, 1); assert.equal(row.probe.attempts, 2, 'retry must decode again in the same page');
        assert.deepEqual(errors, []); assert.deepEqual(report.external, []);
        await page.screenshot({ path: resolve(out, `${asset}-${fault}.png`) });
        row.status = 'passed';
      } catch (e) { row.status = 'failed'; row.error = String(e.stack); row.errors = errors; process.exitCode = 1; }
      finally { await context.close(); }
      console.log(row.status, asset, fault, row.error?.split('\n')[0] ?? '');
      await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
} finally { await browser.close(); }
