import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

// Check newly introduced inline local links; old archival links are not silently
// converted into a new merge blocker. Network links and heading anchors are not
// checked here. Facts, commands and reference-style links still need review.
export function localLinks(text) {
  const prose = text.replace(/```[^]*?```|~~~[^]*?~~~/g, '');
  return [...prose.matchAll(/\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\)/g)]
    .map(m => m[1] ?? m[2]).filter(p => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(p));
}

export function checkDocumentation(paths, base, root = process.cwd()) {
  execFileSync('git', ['diff', '--check', base, 'HEAD'], { cwd: root, stdio: 'pipe' });
  for (const path of paths) {
    const file = resolve(root, path);
    if (!existsSync(file)) continue; // a documentation deletion
    const content = readFileSync(file, 'utf8');
    if (path.endsWith('.json')) { JSON.parse(content); continue; }
    let previous = '';
    try { previous = execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { /* new doc */ }
    const old = new Set(localLinks(previous));
    for (const link of localLinks(content).filter(link => !old.has(link))) {
      const target = decodeURIComponent(link.split(/[?#]/)[0]);
      if (!target) continue;
      const absolute = target.startsWith('/') ? resolve(root, '.' + target) : resolve(dirname(file), target);
      const fromRoot = relative(root, absolute);
      if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..\\') || fromRoot.startsWith('../') || !existsSync(absolute)) {
        throw Error(`Broken or outside-repository documentation link in ${path}: ${link}`);
      }
    }
  }
}
