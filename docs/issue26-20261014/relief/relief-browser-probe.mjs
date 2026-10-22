/**
 * Issue #26 F12 part B / F04: S1-S3 through the real Runtime and SaveSession of two offline builds.
 * Usage (repo root): node docs/issue26-20261014/relief/relief-browser-probe.mjs <before.html> <after.html>
 * Fixtures use the ?test=1 hooks at the menu, like scripts/station-relief-test.mjs; nothing else is stubbed.
 * Writes relief-browser-probe.json next to this file.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('usage: relief-browser-probe.mjs <before.html> <after.html>');
const browser = await chromium.launch(browserOptions);
const cases = [
  { id: 'S1', state: 'no gun, cash ¥250, empty inventories; runtime.enter()', seed: { cash: 250 } },
  { id: 'S1', state: 'no gun, cash ¥320, empty inventories; runtime.enter()', seed: { cash: 320 } },
  { id: 'S2', state: 'empty relief pistol equipped, no 9mm, cash ¥50; runtime.enter()', seed: { cash: 50, reliefPistol: true } },
  { id: 'S3', state: 'cash ¥60, ordinary pistol in the stash; runtime.enter(), then sell it in the arms shop and settle', seed: { cash: 60, stashPistol: true }, sell: true },
];
async function run(htmlPath, c) {
  const html = await readFile(htmlPath, 'utf8'), errors = [], external = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
  try {
    await context.route('https://relief.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://relief.test/')) external.push(r.url()); });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.clock.setFixedTime(new Date());
    await page.goto('https://relief.test/?test=1');
    await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
    return await page.evaluate(({ seed, sell }) => {
      const { saveSession: s, hideoutRuntime: r } = window.__bincov;
      if (!s.ensureRpg()) throw Error('fixture upgrade');
      const ticket = s.prepareExpansionMutation(d => {
        d.profile.cash = seed.cash;
        d.profile.equipment = { weapon: seed.reliefPistol ? 'pistol' : null, relief: !!seed.reliefPistol, ammo: 0, ammoRelief: 0 };
        for (const key of ['bag', 'stash', 'safe']) d.profile[key].items = [];
        if (seed.stashPistol) d.profile.stash.items.push({ uid: 'probe-pistol', id: 'pistol', qty: 1, x: 0, y: 0 });
        delete d.profile.reliefSupplies;
      });
      if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('fixture commit');
      const kit = () => {
        const p = JSON.parse(localStorage.getItem('escape-bincov.session.v2')).profile, relief = id => [p.bag, p.stash, p.safe]
          .flatMap(inv => inv.items).filter(i => i.id === id && i.relief).reduce((n, i) => n + i.qty, 0);
        return { cash: p.cash, weapon: p.equipment.weapon, reliefWeapon: p.equipment.relief, reliefAmmo9: relief('ammo9'), reliefBandage: relief('bandage'),
          pending: p.reliefSupplies ?? [], stashPistols: p.stash.items.filter(i => i.id === 'pistol').length };
      };
      const entered = r.enter(); const afterEntry = kit();
      let sale = null, afterSale = null;
      if (sell) {
        const shop = r.openShop('arms'), gun = shop.view().stash.items.find(i => i.id === 'pistol');
        const placed = shop.place('stash', 'sell', gun.uid, 0, 0); sale = { placed: placed.ok, settled: shop.settle().ok }; afterSale = kit();
      }
      return { entered: entered.ok, afterEntry, sale, afterSale };
    }, c).then(result => ({ ...result, errors, external }));
  } finally { await context.close(); }
}
// Record a repo-relative path or just the file name, never a local absolute path.
const label = path => { const rel = relative(process.cwd(), resolve(path)); return rel.startsWith('..') || isAbsolute(rel) ? basename(path) : rel.replaceAll('\\', '/'); };
const builds = await Promise.all([beforePath, afterPath].map(async path => ({ file: label(path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
const rows = [];
for (const c of cases) rows.push({ case: c.id, state: c.state, before: await run(beforePath, c), after: await run(afterPath, c) });
await browser.close();
const report = { item: 'issue #26 F12 part B / F04 relief extension', browser: 'headless Chromium via scripts/browser-options.mjs, 1280x720, offline context',
  before: builds[0], after: builds[1], rows };
await writeFile(resolve(dirname(fileURLToPath(import.meta.url)), 'relief-browser-probe.json'), JSON.stringify(report, null, 2) + '\n');
for (const row of rows) console.log(row.case, row.state, '\n  before', JSON.stringify(row.before), '\n  after ', JSON.stringify(row.after));
if (rows.some(row => [row.before, row.after].some(r => r.errors.length || r.external.length))) process.exitCode = 1;
