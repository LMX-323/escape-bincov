/** Real UI selection and placement, shared by transaction regressions. */
export async function placeAt(page, source, id, target, x = 0, y = 0) {
  await page.locator(`[data-source="${source}"][data-item-id="${id}"]`).first().click();
  await page.locator('[data-action="place-item"]').click();
  const grid = page.locator(`[data-grid="${target}"]`);
  await grid.scrollIntoViewIfNeeded();
  const slot = await grid.evaluate((el, { x, y }) => {
    const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell) * r.width / el.offsetWidth;
    return { x: r.x + (x + .5) * cell, y: r.y + (y + .5) * cell };
  }, { x, y });
  await page.mouse.click(slot.x, slot.y);
}
