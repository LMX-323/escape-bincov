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

/** Buy through the visible cart; read-only hooks only decide affordability and capacity. */
export async function buyAffordable(page, id, packs = 1) {
  for (let i = 0; i < packs; i++) {
    await placeAt(page, 'merchant', id, 'buy');
    const allowed = await page.evaluate(() => {
      const { app } = window.__bincov, total = Number(document.querySelector('.shop-checkout strong').textContent.replace(/[^0-9]/g, ''));
      return app.save.cash >= total;
    });
    if (!allowed) { await placeAt(page, 'buy', id, 'merchant'); break; }
    await page.locator('[data-action="checkout"]').click();
    // Capacity can reject an otherwise affordable cart; return it before leaving the merchant.
    if (await page.locator('[data-source="buy"][data-item-id="' + id + '"]').count()) {
      await placeAt(page, 'buy', id, 'merchant'); break;
    }
  }
}
