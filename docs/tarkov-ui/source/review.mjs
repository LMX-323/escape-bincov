// Check the discussion artifact itself; these are not game regression claims.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir=resolve('docs/tarkov-ui');
const report={method:'Offline research HTML, DPR 1, identical synthetic inventory across both type modes. Browser screenshots are of a prototype, not game implementation. Source/font/position checks cannot prove human legibility.',checks:[],errors:[],externalRequests:[],screenshots:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try {
 for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]) {
  const c=await browser.newContext({viewport,offline:true});c.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
  await p.goto(pathToFileURL(`${dir}/review.html`).href);await p.evaluate(()=>document.fonts.ready);
  for(const view of ['gear','loot'])for(const mode of ['hybrid','pixel']){
   await p.locator(`[data-view="${view}"]`).click();await p.locator('#font-mode').selectOption(mode);await p.evaluate(()=>document.fonts.ready);
   const name=`${view}-${mode}-${viewport.width}.png`;await p.screenshot({path:`${dir}/${name}`});report.screenshots.push(name);
   const result=await p.evaluate(()=>{
    const work=document.querySelector('.workspace'),frame=document.querySelector('.mock');
    const panels=[...document.querySelectorAll('.workspace .inventory')].map(x=>({source:x.dataset.inventory,...x.getBoundingClientRect().toJSON()}));
    const clipped=[...document.querySelectorAll('.workspace .inventory')].filter(x=>{const r=x.getBoundingClientRect(),w=work.getBoundingClientRect();return r.top<w.top||r.bottom>w.bottom||r.left<w.left||r.right>w.right;}).map(x=>x.dataset.inventory);
    const overlap=[...document.querySelectorAll('.slot-item .quantity')].filter(x=>{const a=x.getBoundingClientRect(),b=x.parentElement.querySelector('.item-name').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
    return {width:innerWidth,height:innerHeight,bodyWidth:document.body.scrollWidth,frameBottom:frame.getBoundingClientRect().bottom,clipped,overlap:overlap.length,panels};
   });
   assert.equal(result.bodyWidth,viewport.width,'Horizontal page clipping');assert.ok(result.frameBottom<=viewport.height,'Frame below viewport');assert.deepEqual(result.clipped,[],'An inventory requires scrolling at the discussion viewport');assert.equal(result.overlap,0,'Quantity overlaps label');
   assert.ok(result.panels.find(x=>x.source==='bag').right<result.panels.find(x=>x.source===(view==='loot'?'container':'stash')).left,'Carried and external sides reversed');
   report.checks.push({viewport,view,mode,geometry:result});
   await p.locator('[data-item="study-bag-1"]').focus();await p.keyboard.press('Enter');
   assert.equal(await p.locator('.inspect-title h3').innerText(),'密封绷带');assert.equal(await p.locator('[data-item="study-bag-1"]').evaluate(el=>el===document.activeElement),true);
   const cdp=await c.newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.inspector p'});const fonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});assert.ok(fonts.fonts.some(f=>f.isCustomFont&&f.familyName===(mode==='hybrid'?'Bincov Study Sans':'Bincov Study Pixel')));await cdp.detach();
  }
  await p.locator('[data-view="fonts"]').click();await p.screenshot({path:`${dir}/fonts-${viewport.width}.png`,fullPage:true});report.screenshots.push(`fonts-${viewport.width}.png`);
  await p.locator('[data-view="notes"]').click();assert.equal(await p.locator('#font-mode').isDisabled(),true);await p.screenshot({path:`${dir}/notes-${viewport.width}.png`,fullPage:true});report.screenshots.push(`notes-${viewport.width}.png`);
  await p.locator('[data-view="gear"]').click();await p.locator('#baseline').check();assert.equal(await p.locator('.baseline-view img').count(),1);await p.locator('#baseline').uncheck();assert.equal(await p.locator('.mock').count(),1);
  assert.deepEqual(await p.evaluate(()=>Object.keys(localStorage)),[],'Study must not write browser saves');await c.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
 report.status='passed';
}catch(e){report.status='failed';report.failure=String(e);throw e;}
finally{await browser.close();report.htmlSha256=createHash('sha256').update(await readFile(`${dir}/review.html`)).digest('hex');await writeFile(`${dir}/review-report.json`,JSON.stringify(report,null,2)+'\n');}
console.log('8 layout/font cases, 12 prototype captures, keyboard selection, comparison toggle and no save/network writes passed.');
