import assert from 'node:assert/strict';
import test from 'node:test';
import { resumeStalls } from '../stall-resume.mjs';

// The resumer runs inside the page and sees only the argument passed along with it: once the hook was dropped there, no
// suite resumed a stall pause and test:issue26-spatial waited 30 s on one (PR #39). Run it here against a stand-in page.
test('resumeStalls resumes stall pauses on the page object it is told to watch, and nothing else', async t => {
  const saved = ['window', 'document', 'requestAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  t.after(() => { for (const [k, d] of saved) if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; });
  for (const hook of [undefined, '__bincovRange']) {
    let script, arg;
    await resumeStalls({ addInitScript: async (fn, a) => { script = fn; arg = a; } }, hook);
    const clicks = [], frames = [], host = { panel: 'pause', eventLog: [] };
    const button = { disabled: false, click: () => clicks.push(host.eventLog.length) };
    globalThis.window = { [hook ?? '__bincovSample']: { host } };
    globalThis.document = { querySelector: s => s === '.coast-sample [data-panel] [data-do="resume"]' ? button : null };
    globalThis.requestAnimationFrame = f => frames.push(f);
    script(arg);
    const tick = () => frames.shift()();
    host.eventLog.push({ seq: 3, type: 'notice', detail: { text: '已使用绷带' } });
    tick(); assert.deepEqual(clicks, [], 'another notice under a pause the player opened');
    host.eventLog.push({ seq: 4, type: 'notice', detail: { text: '画面暂时停顿，行动已暂停。准备好后继续。' } });
    tick(); tick(); assert.deepEqual(clicks, [2], `one stall resumed (hook ${hook ?? 'default'})`);
    assert.equal(window.__stallResumes, 1);
  }
});
