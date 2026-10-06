// Rebuild the standalone research artifact, never the game release files.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const dir=resolve('docs/tarkov-ui');
const read=(p)=>readFile(`${dir}/${p}`,'utf8');
const uri=async(p,type)=>`data:${type};base64,${(await readFile(`${dir}/${p}`)).toString('base64')}`;
const manifest=JSON.parse(await read('fonts/manifest.json'));
for(const [i,slug] of ['pixel','sans'].entries()){if(createHash('sha256').update(await readFile(`${dir}/fonts/${slug}.woff2`)).digest('hex')!==manifest.fonts[i].subsetSha256)throw Error('Unexpected subset font hash');}
const base={};for(const view of ['gear','loot'])for(const size of [1280,1920])base[`${view}-${size}`]=await uri(`baseline-${view}-${size}.png`,'image/png');
const fonts=`@font-face{font-family:'Study Sans';src:url(${await uri('fonts/sans.woff2','font/woff2')}) format('woff2');font-weight:400;}@font-face{font-family:'Study Pixel';src:url(${await uri('fonts/pixel.woff2','font/woff2')}) format('woff2');font-weight:400;}`;
const data=`const STUDY_DATA=${await read('source/fixtures.json')};const ICONS=${await read('source/icons.json')};const BASELINES=${JSON.stringify(base)};`;
let html=(await read('source/prototype.html')).replace('/* FONTS */',fonts).replace('/* STYLES */',await read('source/prototype.css')).replace('/* DATA */',data).replace('/* SCRIPT */',await read('source/prototype.js'));
html=html.replace('<html lang="zh-CN">',`<html lang="zh-CN"><!-- Embedded font attribution and licenses:\n${await read('fonts/ChillBitmap-OFL.txt')}\n${await read('fonts/Noto-COPYRIGHT.txt')}\n-->`);
await writeFile(`${dir}/review.html`,html);console.log(`Built research-only review.html (${Buffer.byteLength(html)} bytes).`);
