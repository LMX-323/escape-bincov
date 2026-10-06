// Diagnostic only: captures baseline facts, not acceptance of proposed improvements.
import { chromium } from 'playwright';
import { browserOptions } from '../../scripts/browser-options.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const expectedHash = '2984e201d2b33c0f242e2c290f01425652463ef20b25df47b528471b4be5e731';
assert.equal(createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), expectedHash, 'Use the documented main HTML, not another build.');
const out = resolve('test-results/art-audit');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { base: 'a34c7a1ba810919fc33d4fce158aba0a028a0f78', browser: browser.version(), method: 'Unmodified committed main HTML served over localhost HTTP; fresh saves; seed 42; reduced title motion; raid position and enemy readiness fixtures. CSS and screenshots are not modified.', views: [], errors: [], externalRequests: [] };
try {
for (const [width,height,touch] of [[1280,720,false],[1920,1080,false],[844,390,true],[740,300,true]]) {
  const context = await browser.newContext({ viewport:{width,height}, hasTouch:touch, isMobile:touch, deviceScaleFactor:1, reducedMotion:'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('request',r=>{if(/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173/'))report.externalRequests.push(r.url());});
  const action = (name,id) => page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
  async function capture(view) {
    await page.evaluate(()=>document.fonts.ready);
    const data = await page.evaluate(()=>{
      const transform=getComputedStyle(document.querySelector('#frame')).transform;
      const scale=transform==='none'?1:new DOMMatrixReadOnly(transform).a;
      const selectors=['#frame','.title-copy h1','.title-story','.item-label','.item .qty','.item-icon','.item-actions button','.item-description','.shop-card strong','.shop-card .small','.quest p','.vital-row','#status','#reload','.timer strong','.loot-risk','.loot-header','.loot-details','.loot-footer','#map'];
      return Object.fromEntries(selectors.flatMap(sel=>{const e=document.querySelector(sel);if(!e)return[];const s=getComputedStyle(e),r=e.getBoundingClientRect();return [[sel,{font:s.fontFamily,size:s.fontSize,color:s.color,background:s.backgroundColor,transform:s.transform,rect:{x:r.x,y:r.y,w:r.width,h:r.height},effectiveFontPx:parseFloat(s.fontSize)*scale,text:e===document.querySelector('#frame')?'':e.textContent.slice(0,180)}]];}));
    });
    const file=`${width}x${height}-${view}.png`;
    await page.screenshot({path:resolve(out,file)});
    report.views.push({viewport:{width,height},touch,view,file,data});
    console.log('CAPTURE',file);
  }
  const response = await page.goto('http://127.0.0.1:4173/?test=1');
  assert.equal(createHash('sha256').update(await response.body()).digest('hex'), expectedHash, 'The HTTP server must serve the documented baseline HTML.');
  await action('enter').waitFor();
  if(!touch) await capture('title');
  await action('enter').click(); await capture('gear');
  if(!touch) {
    await page.locator('[data-source="bag"][aria-label^="密封绷带"]').click(); await capture('item');
    for(const tab of ['med','quests']){await action('tab',tab).click();await capture(tab);}
    const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.quest h3'});
    report.views.at(-1).platformFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    await action('tab','gear').click();
  }
  await page.locator('#seed').fill('42');await action('deploy').click();
  await page.waitForFunction(()=>window.__bincov.app.raid?.player?.active);
  await page.evaluate(()=>{const r=window.__bincov.app.raid;r.enemies.forEach(e=>{e.sprite.setPosition(208,1456);e.home={x:208,y:1456};e.target={x:208,y:1456};e.cooldown=9999;e.timer=9999;e.alert=0;e.state='patrol';e.path=[];});r.player.setPosition(700,784);});
  await page.waitForTimeout(200);await capture('hud');
  if(!touch){await page.keyboard.press('m');await capture('map');await action('close').click();}
  await page.evaluate(()=>{const r=window.__bincov.app.raid,c=r.containers.find(c=>c.kind==='crate');r.player.setPosition(c.x,c.y);});
  await page.waitForTimeout(180);await page.keyboard.press('e',{delay:80});await page.locator('.loot-modal').waitFor();
  await capture('loot');await page.locator('[data-source="container"][data-uid]').first().click();await capture('loot-detail');
  await context.close();
}
} finally { await writeFile(resolve(out,'observations.json'),JSON.stringify(report,null,2));await browser.close(); }
