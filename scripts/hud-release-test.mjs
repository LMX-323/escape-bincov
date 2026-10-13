// Targeted SOL-F20-HUD-01 check. Weak DOM probes and actual input-manager references, not a total-heap claim.
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
    const page = await context.newPage(), cdp = await context.newCDPSession(page); page.setDefaultTimeout(20000);
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
      row.sleepingKeyboardQueue = await page.evaluate(() => window.__bincov.app.game.input.keyboard.queue.length);
      await page.keyboard.press('Escape'); await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
      await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
      await cdp.send('HeapProfiler.collectGarbage');
      assert.equal(await page.evaluate(() => !!window.__hudWeak.deref()), true, 'positive control detects a deliberately retained detached HUD');
      await page.evaluate(() => { delete window.__positiveHud; });
      await cdp.send('HeapProfiler.collectGarbage');
      row.result = await page.evaluate(() => {
        const input = window.__bincov.app.game.input;
        return { inputEnabled: input.enabled, oldHudAlive: !!window.__hudWeak.deref(),
          pointers: input.pointers.map(p => ({ eventInHud: !!p.event?.target?.closest?.('.cs-hud'), downInHud: !!p.downElement?.closest?.('.cs-hud'), upInHud: !!p.upElement?.closest?.('.cs-hud') })) };
      });
      assert.equal(row.result.inputEnabled, true, 'Phaser input is available again on results');
      assert.ok(row.result.pointers.every(p => !p.eventInHud && !p.downInHud && !p.upInHud), 'Phaser must release every old HUD pointer edge');
      assert.equal(row.result.oldHudAlive, false, 'old HUD can be collected before clicking away from results');
      assert.equal(row.sleepingKeyboardQueue, 0, 'external input must not accumulate in the sleeping Phaser keyboard queue');
      await page.locator('[data-action="return"]').click();
      await page.locator('#run-world').selectOption('coast'); await page.locator('[data-action="deploy"]').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      const before = await page.evaluate(() => window.__bincov.app.raid.player.x);
      await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
      assert.notEqual(await page.evaluate(() => window.__bincov.app.raid.player.x), before, 'classic movement remains usable after returning from the sample');
      const canvas = page.locator('#game canvas'); await canvas.click({ position: { x: 600, y: 280 } });
      assert.equal(await page.evaluate(() => window.__bincov.app.game.input.mousePointer.event?.target === window.__bincov.app.game.canvas), true);
      row.status = 'passed';
    } catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; }
    finally { await context.close(); }
    console.log(row.status, size.join('x'), row.error?.split('\n')[0] ?? '');
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  }
} finally { await browser.close(); }
