// Research only. Captures the main game and exports explicitly identified PR #11 art.
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';
import { ITEMS, fits } from '../../../src/domain.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const out = resolve('docs/tarkov-ui');
const rows = (source, entries) => entries.map(([id,qty,x,y],i) => ({id,qty,x,y,uid:`study-${source}-${i}`}));
const fixtures = {
  stash:{w:10,h:6,items:rows('stash', [['shotgun',1,0,0],['carbine',1,3,0],['pistol',1,6,0],['ammo9',24,8,0],['ammoR',20,9,0],['medkit',2,0,1],['bandage',4,2,1],['antidote',2,3,1],['water',2,4,1],['food',3,5,1],['shell',12,6,1],['battery',1,7,1],['wire',2,8,1],['fuse',1,9,1],['scrap',3,0,2],['watch',1,1,2],['pearl',1,2,2],['sample',1,0,3],['ledger',1,1,3]])},
  bag:{w:6,h:5,items:rows('bag',[['ammo9',32,0,0],['bandage',2,1,0],['water',1,2,0],['medkit',1,3,0],['food',1,5,0],['antidote',1,0,1],['wire',1,3,2]])},
  safe:{w:2,h:2,items:rows('safe',[['sample',1,0,0],['pearl',1,1,0]])},
  container:{w:6,h:5,items:rows('loot',[['carbine',1,0,0],['ammoR',20,3,0],['watch',1,4,0],['fuse',2,5,0],['medkit',1,0,1],['battery',1,2,1],['wire',2,3,1],['ledger',1,0,3]])}
};
for (const inv of Object.values(fixtures)) {
  const placed={...inv,items:[]};
  for (const item of inv.items) { if (!fits(placed,item.id,item.x,item.y) || item.qty>ITEMS[item.id].stack) throw Error(`Invalid fixture ${item.uid}`); placed.items.push(item); }
}
await mkdir(out,{recursive:true});
await writeFile(`${out}/source/fixtures.json`,JSON.stringify({definitions:ITEMS,fixtures},null,2)+'\n');
const report={main:'e7252e6a595022212a60bcec22ac75068173e480',mainHtmlSha256:createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),artCommit:'09e07137948d8fc0ac5676b6f2369d7e218129c9',method:'Main HTML, test=1 fixtures. Inventories match design specimen; raid positioned at generated crate, simulation paused only to capture reproducibly. Art exported separately from PR #11 candidate, not main.',errors:[],externalRequests:[]};
if(report.mainHtmlSha256!=='2984e201d2b33c0f242e2c290f01425652463ef20b25df47b528471b4be5e731') throw Error('Main HTML differs from the recorded baseline');
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try {
  for (const viewport of [{width:1280,height:720},{width:1920,height:1080}]) {
    const context=await browser.newContext({viewport,offline:true});
    context.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1');
    await page.locator('[data-action="enter"]').click();
    await page.evaluate(f=>{const s=__bincov.app.save;s.stash=f.stash;s.bag=f.bag;s.safe=f.safe;s.cash=2780;s.equipment={weapon:'pistol',ammo:8,ammoRelief:0,relief:false};},fixtures);
    await page.locator('[data-action="tab"][data-id="gear"]').click();
    await page.screenshot({path:`${out}/baseline-gear-${viewport.width}.png`});
    await page.locator('#seed').fill('42');await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(()=>__bincov.app.raid?.player?.active);
    await page.evaluate(f=>{const a=__bincov.app,r=a.raid,c=r.containers.find(c=>c.kind==='crate');r.enemies.forEach(e=>e.cooldown=9999);r.player.setPosition(c.x,c.y);c.inventory=f.container;a.loadout.bag=f.bag;a.loadout.safe=f.safe;a.save.safe=structuredClone(f.safe);r.elapsed=166;r.hp=84;},fixtures);
    await page.keyboard.press('e',{delay:80});await page.locator('.loot-modal').waitFor();
    await page.evaluate(()=>__bincov.app.raid.scene.pause());
    await page.screenshot({path:`${out}/baseline-loot-${viewport.width}.png`});
    await context.close();
  }
  const artHtml=process.argv[2];if(!artHtml)throw Error('Pass the exact PR #11 HTML path to export reference sprites');
  report.artHtmlSha256=createHash('sha256').update(await readFile(artHtml)).digest('hex');
  if(report.artHtmlSha256!=='23e8eee5d6b2cca8579c2ae735f7f20cc649935d78236ed8187343b78d72e1ad') throw Error('Art HTML does not match PR #11 commit');
  const context=await browser.newContext({offline:true});const page=await context.newPage();
  await page.goto(pathToFileURL(resolve(artHtml)).href+'?test=1');await page.locator('[data-action="enter"]').waitFor();
  const icons=await page.evaluate(ids=>Object.fromEntries(ids.flatMap(id=>[id,'small-'+id].map(key=>[key,__bincov.app.game.textures.get('item-'+key).getSourceImage().toDataURL()]))),Object.keys(ITEMS));
  await writeFile(`${out}/source/icons.json`,JSON.stringify(icons,null,2)+'\n');await context.close();
} finally {await browser.close();await writeFile(`${out}/baseline-report.json`,JSON.stringify(report,null,2)+'\n');}
if(report.errors.length||report.externalRequests.length)throw Error('Baseline capture errors');
console.log('4 main captures; fixtures validated against domain; 40 native candidate art references exported.');
