// Targeted SOL-F20-HUD-01 check: a settled raid's HUD can be collected, and the next raid still takes real input. Weak DOM
// probes, not a total-heap claim. (The Phaser input-manager checks went with the Phaser view.)
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/hud-release'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions), report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), checks: [] };
try {
  for (const size of [[1280, 720], [1920, 1080]]) {
    const row = { size }; report.checks.push(row);
    const context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] } });
    await context.route('https://hud.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const errors = [];
    context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://hud.test/')) errors.push(`External request: ${r.url()}`); });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(String(e.stack)));
    try {
      await page.goto('https://hud.test/?test=1&entry=tabs&sample=village');
      await page.locator('[data-action="enter"]').click();
      await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42');
      await page.locator('[data-action="deploy"]').click();
      await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch);
      await page.evaluate(() => {
        window.__bincovSample.driver.freezeAI(true);
        window.__hudWeak = new WeakRef(document.querySelector('.cs-hud'));
        window.__positiveHud = document.querySelector('.cs-hud');
      });
      for (let i = 0; i < 20; i++) await page.keyboard.press('z');
      await page.keyboard.press('Escape'); await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
      await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
      await cdp.send('HeapProfiler.collectGarbage');
      assert.equal(await page.evaluate(() => !!window.__hudWeak.deref()), true, 'positive control detects a deliberately retained detached HUD');
      await page.evaluate(() => { delete window.__positiveHud; });
      await cdp.send('HeapProfiler.collectGarbage');
      row.result = await page.evaluate(() => ({ oldHudAlive: !!window.__hudWeak.deref(), hosts: document.querySelectorAll('.coast-sample').length }));
      assert.equal(row.result.oldHudAlive, false, 'old HUD can be collected before clicking away from results');
      assert.equal(row.result.hosts, 0, 'no raid view is left on the result page');
      // The next raid gets a fresh host on the same page: a classic coast checkpoint raid (still deployable under ?test=1)
      // must move with the keyboard and fire with the mouse.
      await page.locator('[data-action="return"]').click();
      await page.locator('#run-world').selectOption('coast'); await page.locator('[data-action="deploy"]').click();
      await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch && window.__bincovSample.host.lastBatch.map.name === '沿海封锁区');
      await page.evaluate(() => { window.__bincovSample.driver.freezeAI(true); window.__bincovSample.driver.weapon('pistol'); });
      const before = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.player.x);
      await page.keyboard.down('d');
      try { await page.waitForFunction(x => window.__bincovSample.host.lastBatch.frame.player.x > x + 4, before, { timeout: 15000 }); }
      finally { await page.keyboard.up('d'); }
      row.moved = await page.evaluate(x => window.__bincovSample.host.lastBatch.frame.player.x - x, before);
      const mag = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.hud.weapon.mag);
      await page.locator('.coast-sample canvas').click({ position: { x: 600, y: 280 } });
      await page.waitForFunction(m => window.__bincovSample.host.lastBatch.frame.hud.weapon.mag === m - 1, mag, { timeout: 15000 });
      row.fired = { before: mag, after: mag - 1 };
      assert.deepEqual(errors, []);
      row.status = 'passed';
    } catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; }
    finally { await context.close(); }
    console.log(row.status, size.join('x'), row.error?.split('\n')[0] ?? '');
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  }
} finally { await browser.close(); }
