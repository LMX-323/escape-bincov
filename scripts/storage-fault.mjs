import assert from 'node:assert/strict';

/** Keep periodic checkpoints writable until the trusted click reaches its action.
 * A document capture listener also survives a live panel refreshing its rows. */
export async function failSessionWritesOnClick(page, selector) {
  const savedAt = await page.evaluate(selector => {
    window.__write = Storage.prototype.setItem;
    window.__failedSessionWrites = 0;
    const arm = event => {
      if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest(selector)) return;
      document.removeEventListener('click', arm, true);
      Storage.prototype.setItem = function (key, value) {
        if (key === 'escape-bincov.session.v2') {
          window.__failedSessionWrites++;
          throw new Error('Injected quota failure');
        }
        return window.__write.call(this, key, value);
      };
    };
    document.addEventListener('click', arm, true);
    return window.__bincov.app.lastSavedAt;
  }, selector);
  // Exercise an automatic save while armed, so slow input cannot recreate the
  // race where its protection dialog removes the button before the actual tap.
  await page.waitForFunction(savedAt => window.__bincov.app.lastSavedAt > savedAt, savedAt);
}

export async function restoreSessionWrites(page) {
  const failures = await page.evaluate(() => {
    Storage.prototype.setItem = window.__write;
    return window.__failedSessionWrites;
  });
  assert.ok(failures > 0, 'the clicked transaction must attempt a failing session write');
}
