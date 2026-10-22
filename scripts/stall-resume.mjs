/**
 * Raid suites on slow software-GL runners (CI). When a frame comes more than 2 s after the last, the Runtime's stall guard
 * pauses the raid with its notice 画面暂时停顿，行动已暂停。准备好后继续。 — most often on the first frames after a deploy, a
 * reload or a resize. That pause is the guard working, not the step under test, so `resumeStalls` resumes it at once
 * through the pause panel's own 继续 and counts it (window.__stallResumes). Steps that pause on purpose are unaffected:
 * the guard only fires while the raid runs. Install it on every context before its pages load. `hook` names the page's
 * ?test=1 object that holds the raid host: __bincovSample on the game, __bincovRange on the 试枪场 page.
 */
export async function resumeStalls(context, hook = '__bincovSample') {
  await context.addInitScript(hook => {
    window.__stallResumes = 0;
    const seen = new WeakMap();
    const tick = () => {
      const h = window[hook]?.host, log = h?.eventLog;
      if (log?.length) {
        const from = seen.get(h) ?? 0;
        for (const e of log) {
          if (e.seq <= from) continue;
          seen.set(h, e.seq);
          if (e.type !== 'notice' || !String(e.detail?.text ?? '').startsWith('画面暂时停顿') || h.panel !== 'pause') continue;
          const resume = document.querySelector('.coast-sample [data-panel] [data-do="resume"]');
          if (resume && !resume.disabled) { resume.click(); window.__stallResumes++; }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** How many stall pauses were resumed on this page (for the suite report). */
export const stallResumes = page => page.evaluate(() => window.__stallResumes ?? 0).catch(() => null);

/**
 * The raid runs (no panel open, published phase running) on three frames in a row. Use it before holding keys or sticks
 * after a deploy, reload or resize: a pause resumed in between clears held input, as resuming should. `hook` as for
 * resumeStalls.
 */
export async function running(page, timeout = 30000, hook = '__bincovSample') {
  await page.evaluate(() => { window.__runningFrames = 0; });
  await page.waitForFunction(hook => {
    const h = window[hook]?.host, ok = !!h && h.panel === null && h.lastBatch?.frame.phase === 'running';
    window.__runningFrames = ok ? window.__runningFrames + 1 : 0;
    return window.__runningFrames >= 3;
  }, hook, { timeout, polling: 'raf' });
}

/**
 * Hold `key` until `until(arg)` holds in the page, then release it. A stall pause resumed meanwhile clears held keys (as
 * any resume does), so the key is pressed again on a running raid; nothing else re-presses it.
 */
export async function holdKey(page, key, until, arg, timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) {
    const stalls = await stallResumes(page) ?? 0;
    await page.keyboard.down(key);
    let outcome;
    try {
      outcome = await (await page.waitForFunction(([src, arg, s]) => new Function(`return ${src}`)()(arg) ? 'done'
        : (window.__stallResumes ?? 0) !== s ? 'stalled' : false, [until.toString(), arg, stalls], { timeout: Math.max(1000, end - Date.now()) })).jsonValue();
    } finally { await page.keyboard.up(key); }
    if (outcome === 'done') return;
    await running(page);
  }
}

/**
 * Open the raid's pause panel on purpose and make sure it is this pause that stays open: a stall pause shown in the
 * same moment is resumed by `resumeStalls` within a frame, and Escape toggles a pause that is already open.
 */
export async function openPause(page, open = () => page.keyboard.press('Escape')) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await page.evaluate(() => window.__bincovSample.host.panel) !== 'pause') await open();
    await page.waitForFunction(() => window.__bincovSample.host.panel === 'pause', null, { timeout: 20000 });
    // Three frames: a stall pause would be resumed in the first.
    await page.evaluate(() => new Promise(r => { let i = 0; const f = () => ++i >= 3 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }));
    if (await page.evaluate(() => window.__bincovSample.host.panel) === 'pause') return;
  }
  throw new Error('The pause panel did not stay open');
}
