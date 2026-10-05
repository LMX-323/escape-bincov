/** Real UI selection and placement, shared by transaction regressions. */
export async function placeAt(page, source, id, target, x = 0, y = 0) {
  await page.locator(`[data-source="${source}"][data-item-id="${id}"]`).first().click();
  await page.locator('[data-action="place-item"]').click();
  await clickSlot(page, target, x, y);
}
export async function clickSlot(page, target, x = 0, y = 0) {
  const grid = page.locator(`[data-grid="${target}"]`);
  const cell = await grid.evaluate(el => Number(el.dataset.cell) * el.getBoundingClientRect().width / el.offsetWidth);
  await grid.click({ position: { x: (x + .5) * cell, y: (y + .5) * cell } });
}
