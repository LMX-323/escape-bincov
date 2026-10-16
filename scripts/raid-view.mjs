/**
 * Helpers for browser suites that play a raid on the 2.5D host (every raid since the Phaser view was removed). They
 * read the explicit ?test=1 hooks only: window.__bincovSample (host, driver, counts) and window.__bincov (app, session).
 * The host decides panels from the Runtime's published phase; wait on the published state, never on fixed sleeps.
 */

/** Wait until the raid host has mounted and published a frame; returns the world key of that frame. */
export async function raidReady(page, { timeout = 30000 } = {}) {
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch && !!document.querySelector('.coast-sample canvas'), null, { timeout });
  return page.evaluate(() => window.__bincovSample.host.lastBatch.stamp.world);
}
/** n display frames (the host advances the Runtime once per frame). */
export const frames = (page, n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
/** Call a test driver fixture (freezeAI, placePlayer, placeEnemy, kill, door, weapon, magazine, vitals, clock, spawnLoot, container, hurt). */
export const drive = (page, name, ...args) => page.evaluate(([name, args]) => window.__bincovSample.driver[name](...args), [name, args]);
/** The last published batch, cloned for the test: stamp, map key/name, frame (player, actors, loot, containers, hud, phase). */
export const batch = page => page.evaluate(() => { const b = window.__bincovSample.host.lastBatch; return { stamp: b.stamp, map: { key: b.map.key, name: b.map.name, floor: b.map.floor, exits: b.map.exits, entries: b.map.entries, notes: b.map.notes }, frame: b.frame }; });
/** The host's open panel: null, 'pause', 'inventory', 'loot', 'map', 'reading' or 'ending'. */
export const panel = page => page.evaluate(() => window.__bincovSample.host.panel);
export const waitPanel = (page, value, timeout = 15000) => page.waitForFunction(v => window.__bincovSample?.host?.panel === v, value, { timeout });
/** Client point of a world point on the chest plane (where aim and bullets are drawn) or, with lift 0, the ground. */
export const screenOf = (page, point, lift = 22) => page.evaluate(([p, lift]) => window.__bincovSample.host.view.worldToClient({ x: p.x, y: p.y - lift }), [point, lift]);
/** Stand at a point (validated body fit) with enemies frozen, then let the camera settle on it. */
export async function stand(page, point, angle = 0, mapId) {
  await drive(page, 'freezeAI', true);
  await drive(page, 'placePlayer', point, angle, mapId);
  await frames(page, 4);
}
/**
 * Drag an inventory item onto a cell of another grid. The panel takes the drop cell from the ghost's top-left corner,
 * so grab 6 px inside the item's corner and release 6 px inside the target cell.
 */
export async function dragItem(page, from, toGrid, x, y) {
  const a = await from.boundingBox(); if (!a) throw new Error('Drag source is not on screen.');
  const to = await page.locator(`.coast-sample [data-grid="${toGrid}"]`).evaluate((el, at) => {
    const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell) * r.width / el.offsetWidth;
    return { x: r.left + at.x * cell + 6, y: r.top + at.y * cell + 6 };
  }, { x, y });
  await page.mouse.move(a.x + 6, a.y + 6); await page.mouse.down();
  await page.mouse.move(a.x + 22, a.y + 22, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up(); await frames(page, 2);
}
/** Abandon from the pause panel and wait for the result page (the outro runs first). */
export async function abandon(page) {
  if (await panel(page) !== 'pause') { await page.keyboard.press('Escape'); await waitPanel(page, 'pause'); }
  await page.locator('.coast-sample [data-do="abandon"]').click();
  await page.locator('.coast-sample [data-do="abandon-yes"]').click();
  await settled(page);
}
/** The settlement is saved and the host has handed the page to the result screen. */
export const settled = (page, timeout = 30000) => page.waitForFunction(() => !document.querySelector('.coast-sample') && window.__bincov?.app.state === 'result', null, { timeout });
