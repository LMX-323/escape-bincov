import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

async function compile() {
  const result = await build({entryPoints:['src/main.ts'],bundle:true,write:false,minify:true,target:'es2020',format:'iife',legalComments:'inline',define:{'process.env.NODE_ENV':'"production"'}});
  const css = (await Promise.all(['src/style.css', 'src/title.css'].map(path => readFile(path, 'utf8')))).join('\n');
  const notices = (await readFile('THIRD_PARTY_NOTICES.md','utf8')).replace(/-->/g,'--&gt;');
  const js = result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><!--\n${notices}\n--><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#10272b"><title>逃离滨科夫 · Escape Bincov</title><style>${css}</style></head><body><main id="frame"><div id="game"></div><div id="ui"></div></main><div id="toast" role="status"></div><script>${js}</script></body></html>`;
  await mkdir('dist',{recursive:true});
  await writeFile('dist/index.html',html);
  await writeFile('start the game.html',html);
  console.log(`Built dist/index.html and start the game.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB each), completely offline.`);
  return html;
}
let html = await compile();
if(process.argv.includes('--serve')) {
  createServer(async(req,res)=>{try { if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;} html=await compile();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html); }catch(e){res.writeHead(500);res.end(String(e));}}).listen(4173,'127.0.0.1',()=>console.log('Local game: http://127.0.0.1:4173'));
}
