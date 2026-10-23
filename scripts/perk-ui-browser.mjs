/**
 * CP-T09 (#77): the base perk UI on the real HideoutRuntime, in the station yard's 身体与成长 panel and on the old tab
 * page (docs/CRITICAL-PERK-DESIGN.md sections 2.3 and 5). Offline packaged build, real session and localStorage, real
 * mouse, keyboard and touch input. ?test=1 only seeds save fixtures through the session's own transaction (the role of
 * another entry writing) and injects a storage fault around one confirm.
 * Usage: node scripts/perk-ui-browser.mjs [--only=Y1,T2,S1] [--shots=<dir>]
 *   -> test-results/perk-ui/{report.json, *.png}; --shots=<dir> also copies the reviewed screenshots there.
 */
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';

const out = resolve('test-results/perk-ui'); await mkdir(out, { recursive: true });
const shotsArg = process.argv.find(a => a.startsWith('--shots='))?.slice(8), shots = shotsArg ? resolve(shotsArg) : null;
if (shots) await mkdir(shots, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
const filter = stepFilter();
const browser = await chromium.launch(browserOptions);
const report = { browser: browser.version(), startedAt: new Date().toISOString(), methodology: 'Packaged offline build at https://perk.test/ (routed, no network). Real session/localStorage; real mouse, keyboard and touch input in headless Chrome (phone sizes are viewport/touch emulation). ?test=1 fixtures: permanent levels, perks, cash, weapon, focus and stamina written through SaveSession transactions (as another entry would), and a storage fault around one confirm (yard: set, click and cleared in one task so no five-second checkpoint can take the fault instead). No mock Runtime.', steps: [], errors: [], external: [] };
let ctx = null, page = null, ran = 0;

const KEY = 'escape-bincov.session.v2';
/** Strength 26 (15, 25 open; 20 chosen; 30 locked), constitution 15, technique 30; carbine and the focus drug. */
const FX = { cash: 1200, permanent: { strength: 26, constitution: 15, technique: 30 }, perks: ['strength-20-b', 'technique-15-a', 'technique-20-a', 'technique-25-a'],
  weapon: 'carbine', effects: { focus: 110 }, body: { stamina: 152 } };
const SEED = `(fx => {
  const { saveSession: s } = window.__bincov;
  const t = s.prepareExpansionMutation(d => {
    if ('cash' in fx) d.profile.cash = fx.cash;
    if (fx.permanent) d.expansion.growth.permanent = fx.permanent;
    if (fx.perks) d.expansion.growth.perks = fx.perks;
    if ('weapon' in fx) d.profile.equipment = { weapon: fx.weapon, ammo: 0, ammoRelief: 0, relief: false };
    if (fx.effects) Object.assign(d.expansion.body.effects, fx.effects);
    if (fx.body) Object.assign(d.expansion.body, fx.body);
  });
  if (!t || s.commitExpansionMutation(t) !== 'committed') throw new Error('fixture write failed');
})`;

async function open({ entry = 'yard', size = [1280, 720], mobile = false, fixture = FX } = {}) {
  if (ctx) await ctx.close().catch(() => {});
  ctx = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
  await ctx.route('https://perk.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  ctx.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://perk.test/')) report.external.push(r.url()); });
  page = await ctx.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(`[console] ${m.text()}`); });
  await page.goto(`https://perk.test/?test=1${entry === 'tabs' ? '&entry=tabs' : ''}`);
  const enter = page.locator('[data-action="enter"]');
  if (mobile) await enter.tap(); else await enter.click();
  if (entry === 'yard') {
    await yardReady();
    // The yard closes while the fixture is written and opens again (no fixture plays an event).
    if (fixture) { await page.evaluate(([src, fx]) => window.__station.reseed(() => (0, eval)(src)(fx)), [SEED, fixture]); await yardReady(); }
  } else {
    await page.locator('#ui .panel.hideout').waitFor();
    if (fixture) await seed(fixture);
  }
  return page;
}
const yardReady = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const seed = fx => page.evaluate(([src, fx]) => (0, eval)(src)(fx), [SEED, fx]);
const raw = () => page.evaluate(k => localStorage.getItem(k), KEY);
const record = async () => JSON.parse(await raw());
const snap = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const y = sel => page.locator(`#station-yard ${sel}`);
const t = sel => page.locator(`#ui ${sel}`);
const yardToasts = () => page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.toast')].map(e => ({ text: e.textContent, tone: e.className.replace('toast', '').replace('out', '').trim() })));
const yardFocus = () => page.evaluate(() => { const a = document.querySelector('#station-yard').shadowRoot.activeElement; return a ? `${a.className}|${a.dataset.act ?? ''}` : ''; });
const tabToast = () => page.evaluate(() => document.getElementById('toast').textContent);
/** Yard dialogs fade in for 0.2 s: a screenshot waits until the dialog is fully drawn. */
const settled = () => page.waitForFunction(() => { const d = document.querySelector('#station-yard')?.shadowRoot.querySelector('.dialog'); return !d || d.hidden || getComputedStyle(d).opacity === '1'; });
const fault = on => page.evaluate(on => {
  window.__write ??= Storage.prototype.setItem;
  Storage.prototype.setItem = on ? function (k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('fixture', 'QuotaExceededError'); return window.__write.call(this, k, v); } : window.__write;
}, on);
async function shot(name, evidence = true) {
  const path = resolve(out, `${name}.png`);
  await page.screenshot({ path, scale: 'css' });
  if (evidence && shots) await copyFile(path, resolve(shots, `${name}.png`));
}
async function step(name, fn) {
  if (!filter.selects(name)) return;
  ran++;
  const row = { name, status: 'running' }, t0 = Date.now(), errors0 = report.errors.length; report.steps.push(row);
  try {
    row.detail = await fn() ?? '';
    assert.deepEqual(report.errors.slice(errors0), [], 'page errors'); assert.deepEqual(report.external, [], 'network');
    row.status = 'passed'; console.log('PASS', name, row.detail);
  } catch (e) {
    row.status = 'failed'; row.error = String(e.stack ?? e); console.log('FAIL', name, e.message ?? e); process.exitCode = 1;
    await page?.screenshot({ path: resolve(out, `fail-${report.steps.length}.png`) }).catch(() => {});
  }
  row.ms = Date.now() - t0;
}
/** The yard's body panel by its digit shortcut (6), as a player opens it. */
async function yardBody() { await page.keyboard.press('6'); await y('.panel.k-body .perks').waitFor(); }
/** Card states of the strength board as text: open / chosen / other / locked per card. */
const yardCards = () => page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.perks .pcard')].map(c => c.className.replace('pcard', '').trim()));
const tabCards = () => page.evaluate(() => [...document.querySelectorAll('#ui .rpg-perks .perk-card')].map(c => c.className.replace('perk-card', '').trim()));

try {
  await step('Y1 院子：四档两卡与静态暴击；卡片预览后取消不改档，键盘回到卡片；确认写入后才显示成功', async () => {
    await open(); await yardBody();
    assert.deepEqual(await yardCards(), ['open', 'open', 'other', 'chosen', 'open', 'open', 'locked', 'locked']);
    assert.match(await y('.pcard.chosen').innerText(), /耐力储备[\s\S]*耐力上限 \+20[\s\S]*已选择/);
    assert.match(await y('.pcard.other').innerText(), /重装步伐[\s\S]*重置本属性后才能改选/);
    assert.match(await y('.pcard.locked').first().innerText(), /搬运大师[\s\S]*永久力量 30 级解锁/);
    const crit = await y('.crit').innerText();
    assert.match(crit, /枪械暴击 · 半自动卡宾枪\s*21\.12%/);
    for (const row of ['角色 · 技巧 30', '独立 5.00% 暴击来源', '半自动卡宾枪', '独立 8.00% 暴击来源', '致命直觉', '专注剂', '暴击伤害 ×1.7（要害打击）', '屏息狙击另计']) assert.ok(crit.includes(row), row);
    assert.doesNotMatch(crit, /个百分点|中心命中/);
    const before = await raw();
    await y('[data-act="perk:strength-15-a"]').click();
    await y('.dialog.k-perk').waitFor();
    const text = await y('.dialog').innerText();
    for (const s of ['选择「负重行家」', '力量 15 级', '负重上限 +4 kg', '负重上限 33.6 kg → 37.6 kg', '选择免费，写入存档后生效。', '确认选择']) assert.ok(text.includes(s), s);
    assert.match(await yardFocus(), /perk-cancel/, 'the keyboard lands on 取消 in the dialog');
    await y('.dialog .perk-cancel').click();
    await y('.dialog').waitFor({ state: 'hidden' });
    assert.equal(await raw(), before, 'cancel wrote nothing');
    assert.match(await yardFocus(), /pcard open\|perk:strength-15-a/, 'the keyboard is back on the card');
    // Enter on the focused card opens the preview again (keyboard), the confirm is clicked.
    await page.keyboard.press('Enter'); await y('.dialog.k-perk').waitFor();
    await y('.dialog [data-act="perk-ok"]').click();
    await y('.dialog').waitFor({ state: 'hidden' });
    const r = await record();
    assert.deepEqual(r.expansion.growth.perks, ['strength-15-a', 'strength-20-b', 'technique-15-a', 'technique-20-a', 'technique-25-a']);
    assert.equal(r.profile.cash, 1200, 'choosing is free');
    assert.ok((await yardToasts()).some(x => x.tone === 'ok' && x.text === '已选择「负重行家」，已写入存档。'));
    await page.waitForFunction(() => document.querySelector('#station-yard').shadowRoot.querySelector('.perks .pcard.chosen b')?.textContent === '负重行家');
    return `取消后字节不变；确认后 perks=${r.expansion.growth.perks.join(',')}`;
  });

  await step('Y2 院子：预览后存档被另一入口改动 → 确认过期，不显示成功、不改选择', async () => {
    await y('[data-act="perk:strength-25-a"]').click(); await y('.dialog.k-perk').waitFor();
    await seed({ cash: 1300 });
    await page.waitForTimeout(200);
    await y('.dialog [data-act="perk-ok"]').click();
    await y('.dialog').waitFor({ state: 'hidden' });
    const toasts = await yardToasts(), r = await record();
    assert.ok(toasts.some(x => x.tone === 'error' && x.text.startsWith('情况已有变化')), JSON.stringify(toasts));
    assert.ok(!toasts.some(x => x.text.includes('近身猛击')), 'no success for the stale confirm');
    assert.ok(!r.expansion.growth.perks.includes('strength-25-a')); assert.equal(r.profile.cash, 1300);
    assert.equal(await y('[data-act="perk:strength-25-a"]').isEnabled(), true, 'the node stays open');
    return '过期确认：提示“情况已有变化”，选择与现金未变';
  });

  await step('Y3 院子：现金 499 时重置禁用并说明原因；500 时预览、取消不扣款、确认扣 500 并裁切耐力', async () => {
    await seed({ cash: 499 }); await page.waitForTimeout(200);
    const button = y('[data-act="perk-reset:strength"]');
    assert.equal(await button.isDisabled(), true);
    assert.equal(await y('.preset small').innerText(), '现金不足：重置需要 ¥500，现有 ¥499。');
    await seed({ cash: 500 }); await page.waitForTimeout(200);
    assert.equal(await button.isEnabled(), true);
    const before = await raw();
    await button.click(); await y('.dialog.k-perk-reset').waitFor();
    const text = await y('.dialog').innerText();
    for (const s of ['重置力量 Perk', '费用 ¥500', '现金 ¥500 → ¥0', '移除：负重行家（15 级）、耐力储备（20 级）', '耐力上限 152 → 132', '当前耐力 152 → 132', '支付 ¥500 并重置']) assert.ok(text.includes(s), s);
    await y('.dialog .perk-cancel').click(); await y('.dialog').waitFor({ state: 'hidden' });
    assert.equal(await raw(), before, 'cancel charged nothing');
    await button.click(); await y('.dialog.k-perk-reset').waitFor();
    await y('.dialog [data-act="perk-ok"]').click(); await y('.dialog').waitFor({ state: 'hidden' });
    const r = await record();
    assert.equal(r.profile.cash, 0); assert.deepEqual(r.expansion.growth.perks, ['technique-15-a', 'technique-20-a', 'technique-25-a']);
    assert.equal(r.expansion.body.stamina, 132);
    assert.ok((await yardToasts()).some(x => x.tone === 'ok' && x.text === '已重置力量 Perk，支付 ¥500。'));
    await page.waitForFunction(() => document.querySelector('#station-yard').shadowRoot.querySelector('.preset button')?.disabled);
    assert.equal(await y('.preset small').innerText(), '力量还没有已选的 Perk。');
    return '499 拒绝；500 扣款、移除力量 Perk、耐力 152 → 132';
  });

  await step('Y4 院子：写入失败只提示保留待重试、不显示成功；导出含该选择；重试保存后只生效一次', async () => {
    await y('[data-act="perk:strength-15-b"]').click(); await y('.dialog.k-perk').waitFor();
    const before = await record();
    await page.evaluate(() => {
      const root = document.querySelector('#station-yard').shadowRoot, write = Storage.prototype.setItem;
      root.querySelector('.toasts').replaceChildren(); // earlier steps' toasts, so only this confirm's feedback is read
      Storage.prototype.setItem = function (k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('fixture', 'QuotaExceededError'); return write.call(this, k, v); };
      try { root.querySelector('.dialog [data-act="perk-ok"]').click(); } finally { Storage.prototype.setItem = write; }
    });
    await y('.dialog.k-storage').waitFor();
    assert.match(await y('.dialog').innerText(), /「长途奔袭」没能写入浏览器存档，还没有生效/);
    const toasts = await yardToasts();
    assert.ok(toasts.some(x => x.tone === 'error' && x.text === '存档没有写入：这次选择保留在本页，重试保存成功后才生效。'), JSON.stringify(toasts));
    assert.ok(!toasts.some(x => x.tone === 'ok'), 'no success toast');
    assert.deepEqual(await record(), before, 'nothing written');
    const s = await snap(); assert.equal(s.storage.ok, false); assert.equal(s.storage.pendingBase, true);
    assert.equal(await page.evaluate(() => window.__bincov.hideoutRuntime.perkBoard().blocked?.reason), 'storage');
    const backup = await page.evaluate(() => JSON.parse(window.__bincov.hideoutRuntime.exportBackup()));
    assert.ok(backup.record.expansion.growth.perks.includes('strength-15-b'), 'the export carries the waiting choice');
    await settled(); await shot('yard-storage-1280x720');
    await y('.dialog [data-act="retry-save"]').click();
    await y('.dialog').waitFor({ state: 'hidden' });
    const r = await record();
    assert.equal(r.revision, before.revision + 1, 'one write');
    assert.deepEqual(r.expansion.growth.perks, ['strength-15-b', 'technique-15-a', 'technique-20-a', 'technique-25-a']);
    const after = await yardToasts();
    assert.ok(after.some(x => x.tone === 'ok' && x.text === '已重新保存，「长途奔袭」已生效。'), JSON.stringify(after));
    return '失败：存档对话框 + 保留提示；重试后修订号 +1、选择生效一次';
  });

  await step('T1 旧页签：同一服务的四档两卡与静态暴击；预览焦点与 Tab 循环、Esc 取消不改档；确认后成功', async () => {
    await open({ entry: 'tabs' });
    await t('[data-action="tab"][data-id="body"]').click();
    await t('.rpg-perks').waitFor();
    assert.deepEqual(await tabCards(), ['open', 'open', 'other', 'chosen', 'open', 'open', 'locked', 'locked']);
    const crit = await t('.rpg-crit').innerText();
    assert.match(crit, /枪械暴击 · 半自动卡宾枪\s*21\.12%/);
    for (const row of ['角色 · 技巧 30', '独立 5.00% 暴击来源', '独立 8.00% 暴击来源', '致命直觉', '专注剂']) assert.ok(crit.includes(row), row);
    assert.doesNotMatch(await t('.rpg-property').innerText(), /基础暴击|中心命中|个百分点/);
    assert.match(await t('.rpg-property').innerText(), /力量[\s\S]*26/);
    const before = await raw();
    await t('[data-action="perk-pick"][data-id="strength-15-a"]').click();
    await t('.perk-modal').waitFor();
    for (const s of ['选择「负重行家」', '负重上限 33.6 kg → 37.6 kg', '确认选择']) assert.ok((await t('.perk-modal').innerText()).includes(s), s);
    const active = () => page.evaluate(() => document.activeElement?.dataset.action ?? '');
    assert.equal(await active(), 'close', 'focus on 取消');
    await page.keyboard.press('Tab'); assert.equal(await active(), 'perk-confirm', 'Tab wraps inside the dialog');
    await page.keyboard.press('Tab'); assert.equal(await active(), 'close');
    await page.keyboard.press('Escape'); await t('.perk-modal').waitFor({ state: 'detached' });
    assert.equal(await raw(), before, 'Esc wrote nothing');
    await t('[data-action="perk-pick"][data-id="strength-15-a"]').click(); await t('.perk-modal').waitFor();
    await t('[data-action="perk-confirm"]').click(); await t('.perk-modal').waitFor({ state: 'detached' });
    assert.equal(await tabToast(), '已选择「负重行家」，已写入存档。');
    const r = await record();
    assert.ok(r.expansion.growth.perks.includes('strength-15-a')); assert.equal(r.profile.cash, 1200);
    assert.deepEqual(await tabCards(), ['chosen', 'other', 'other', 'chosen', 'open', 'open', 'locked', 'locked']);
    return '旧页签与院子同一 Runtime；Esc 取消字节不变；确认后选择写入';
  });

  await step('T2 旧页签：过期确认不生效；499 禁用重置并说明，500 预览确认扣款', async () => {
    await t('[data-action="perk-pick"][data-id="strength-25-a"]').click(); await t('.perk-modal').waitFor();
    await seed({ cash: 1300 });
    await t('[data-action="perk-confirm"]').click(); await t('.perk-modal').waitFor({ state: 'detached' });
    assert.match(await tabToast(), /^情况已有变化/);
    let r = await record(); assert.ok(!r.expansion.growth.perks.includes('strength-25-a')); assert.equal(r.profile.cash, 1300);
    await seed({ cash: 499 }); await t('[data-action="tab"][data-id="body"]').click();
    assert.equal(await t('[data-action="perk-reset"]').isDisabled(), true);
    assert.equal(await t('.perk-reset .perk-note').innerText(), '现金不足：重置需要 ¥500，现有 ¥499。');
    await seed({ cash: 500 }); await t('[data-action="tab"][data-id="body"]').click();
    await t('[data-action="perk-reset"]').click(); await t('.perk-modal').waitFor();
    for (const s of ['重置力量 Perk', '现金 ¥500 → ¥0', '移除：负重行家（15 级）、耐力储备（20 级）', '耐力上限 152 → 132']) assert.ok((await t('.perk-modal').innerText()).includes(s), s);
    await t('[data-action="perk-confirm"]').click(); await t('.perk-modal').waitFor({ state: 'detached' });
    assert.equal(await tabToast(), '已重置力量 Perk，支付 ¥500。');
    r = await record(); assert.equal(r.profile.cash, 0); assert.deepEqual(r.expansion.growth.perks, ['technique-15-a', 'technique-20-a', 'technique-25-a']);
    assert.equal(r.expansion.body.stamina, 132);
    return '过期不生效；499 拒绝；500 扣款';
  });

  await step('T3 旧页签：写入失败不显示成功，提示条的导出含待写入选择；重试保存经 HideoutRuntime 只生效一次', async () => {
    await t('[data-action="perk-pick"][data-id="strength-15-b"]').click(); await t('.perk-modal').waitFor();
    const before = await record();
    await fault(true); await t('[data-action="perk-confirm"]').click(); await fault(false);
    await t('.perk-modal').waitFor({ state: 'detached' });
    assert.equal(await tabToast(), '存档没有写入：这次选择保留在本页，重试保存成功后才生效。');
    assert.deepEqual(await record(), before, 'nothing written');
    assert.match(await t('.save-alarm').innerText(), /「长途奔袭」没能写入存档，还没有生效/);
    assert.equal(await t('[data-action="perk-pick"][data-id="strength-15-a"]').isDisabled(), true, 'the board waits for the retry');
    // Another old-tab write cannot slip past the waiting candidate.
    assert.equal(await page.evaluate(() => window.__bincov.saveSession.setVolume(.2)), false);
    const download = page.waitForEvent('download');
    await t('.save-alarm [data-action="export-save"]').click();
    const file = await (await download).path();
    const backup = JSON.parse(await readFile(file, 'utf8'));
    assert.ok(backup.record.expansion.growth.perks.includes('strength-15-b'), 'the tab page export carries the waiting choice');
    await t('.save-alarm [data-action="retry-save"]').click();
    await t('.save-alarm').waitFor({ state: 'detached' });
    assert.equal(await tabToast(), '已重新保存，「长途奔袭」已生效。');
    const r = await record();
    assert.equal(r.revision, before.revision + 1, 'one write');
    assert.deepEqual(r.expansion.growth.perks, ['strength-15-b', 'technique-15-a', 'technique-20-a', 'technique-25-a']);
    return '失败提示 + 提示条；导出含待写入选择；重试修订号 +1';
  });

  await step('S1 截图：院子 1280×720 与 1920×1080（面板、选择预览、重置预览）', async () => {
    for (const size of [[1280, 720], [1920, 1080]]) {
      await open({ size }); await yardBody(); await page.waitForTimeout(300);
      await shot(`yard-body-${size[0]}x${size[1]}`);
      const over = await page.evaluate(() => { const b = document.querySelector('#station-yard').shadowRoot.querySelector('.panel .pbody'); return b.scrollHeight - b.clientHeight; });
      if (size[0] === 1920) assert.ok(over <= 1, `1920×1080 body panel scrolls ${over}px`);
      else {
        // 1280×720: the board fills the first screen; the critical display is one scroll below it.
        await page.evaluate(() => { const b = document.querySelector('#station-yard').shadowRoot.querySelector('.panel .pbody'); b.scrollTop = b.scrollHeight; });
        await page.waitForTimeout(100); await shot('yard-crit-1280x720');
        await page.evaluate(() => { document.querySelector('#station-yard').shadowRoot.querySelector('.panel .pbody').scrollTop = 0; });
      }
      await y('[data-act="perk:strength-15-a"]').click(); await y('.dialog.k-perk').waitFor(); await settled();
      await shot(`yard-choice-${size[0]}x${size[1]}`, size[0] === 1280);
      await y('.dialog .perk-cancel').click();
      await y('[data-act="perk-reset:strength"]').click(); await y('.dialog.k-perk-reset').waitFor(); await settled();
      await shot(`yard-reset-${size[0]}x${size[1]}`, size[0] === 1920);
      const dialogOver = await page.evaluate(() => { const b = document.querySelector('#station-yard').shadowRoot.querySelector('.dialog .pbody'); return b.scrollHeight - b.clientHeight; });
      assert.ok(dialogOver <= 1, `reset dialog scrolls ${dialogOver}px`);
    }
  });

  await step('S2 截图：旧页签 1280×720 与 1920×1080（面板、选择预览、重置预览；按钮不需滚动）', async () => {
    const unscrolled = async () => { const over = await page.evaluate(() => { const m = document.querySelector('#ui .perk-modal'); return m.scrollHeight - m.clientHeight; }); assert.ok(over <= 1, `the preview scrolls ${over}px`); };
    for (const size of [[1280, 720], [1920, 1080]]) {
      await open({ entry: 'tabs', size }); await t('[data-action="tab"][data-id="body"]').click(); await t('.rpg-perks').waitFor();
      await shot(`tabs-body-${size[0]}x${size[1]}`);
      await t('[data-action="perk-pick"][data-id="strength-15-a"]').click(); await t('.perk-modal').waitFor(); await unscrolled();
      await shot(`tabs-choice-${size[0]}x${size[1]}`, size[0] === 1280);
      await page.keyboard.press('Escape'); await t('.perk-modal').waitFor({ state: 'detached' });
      await t('[data-action="perk-reset"]').click(); await t('.perk-modal').waitFor(); await unscrolled();
      await shot(`tabs-reset-${size[0]}x${size[1]}`, size[0] === 1920);
    }
  });

  await step('S3 手机竖屏与横屏：院子与旧页签的触控目标、点卡片预览、点取消', async () => {
    const sizes = [];
    for (const size of [[390, 844], [844, 390]]) {
      await open({ size, mobile: true });
      // Narrow screens fold the shortcut bar into “功能”, as a player sees it.
      if (!await y('[data-quick="body"]').isVisible()) await y('[data-quickmenu]').tap();
      await y('[data-quick="body"]').tap(); await y('.panel.k-body .perks').waitFor();
      const small = await page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.perks .pcard, .perks button')]
        .map(e => e.getBoundingClientRect()).filter(r => r.height < 44).length);
      assert.equal(small, 0, 'touch targets of at least 44 px');
      await page.waitForTimeout(250); await shot(`yard-phone-${size[0]}x${size[1]}`);
      const before = await raw();
      await y('[data-act="perk:strength-15-a"]').tap(); await y('.dialog.k-perk').waitFor(); await settled();
      await shot(`yard-phone-choice-${size[0]}x${size[1]}`, size[0] === 390);
      await y('.dialog .perk-cancel').tap(); await y('.dialog').waitFor({ state: 'hidden' });
      assert.equal(await raw(), before);
      await open({ entry: 'tabs', size, mobile: true });
      await t('[data-action="tab"][data-id="body"]').tap(); await t('.rpg-perks').waitFor();
      const smallTabs = await page.evaluate(() => [...document.querySelectorAll('#ui .rpg-perks .perk-card, #ui .rpg-perks button')].map(e => e.getBoundingClientRect()).filter(r => r.height < 44).length);
      assert.equal(smallTabs, 0, 'tab page touch targets of at least 44 px');
      await page.evaluate(() => document.querySelector('#ui .rpg-perks').scrollIntoView({ block: 'start' })); await page.waitForTimeout(150);
      await shot(`tabs-phone-${size[0]}x${size[1]}`);
      const tabsBefore = await raw();
      await t('[data-action="perk-pick"][data-id="strength-15-a"]').tap(); await t('.perk-modal').waitFor();
      await t('.perk-modal [data-action="close"]').tap(); await t('.perk-modal').waitFor({ state: 'detached' });
      assert.equal(await raw(), tabsBefore);
      sizes.push(`${size[0]}×${size[1]}`);
    }
    return sizes.join('、');
  });
  report.status = report.steps.every(s => s.status === 'passed') ? 'passed' : 'failed';
} catch (e) { report.status = 'failed'; report.failure = String(e.stack ?? e); process.exitCode = 1; console.error(e); }
finally {
  report.filter = reportFilter(filter, ran);
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await ctx?.close().catch(() => {}); await browser.close();
  console.log(`${report.steps.filter(s => s.status === 'passed').length} / ${report.steps.length} passed`);
}
