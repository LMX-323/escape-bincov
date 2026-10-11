import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const html = await readFile('dist/index.html', 'utf8');
const selector = '.radio { display: grid;';
assert.equal(html.split(selector).length - 1, 1, 'one yard radio stylesheet');
const control = html.replace(selector, '.log>small{display:block;width:1px;overflow:hidden;white-space:nowrap}' + selector);
await mkdir('test-results/tier1/clip-control', { recursive: true });
await writeFile('test-results/tier1/clip-control/index.html', control);
console.log('Synthetic CSS clipping fixture written to ignored test-results; production files unchanged.');
