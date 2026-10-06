import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
/** A conservative source-wide set, including comments, so translated strings cannot silently fall back. */
export async function fontCharacters() {
  const chars=new Set(Array.from({length:95},(_,i)=>String.fromCodePoint(i+32)));
  async function visit(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,entry.name);
      if(entry.isDirectory()) await visit(path);
      else if(/\.(ts|css)$/.test(entry.name))for(const c of await readFile(path,'utf8'))if(c.codePointAt(0)>=160)chars.add(c);
    }
  }
  await visit('src');return [...chars].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0)).join('');
}
