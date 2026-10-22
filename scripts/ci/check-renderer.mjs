/**
 * Launch Chromium exactly as the browser suites do (scripts/browser-options.mjs, so BINCOV_CHROME_ARGS applies) and
 * report its WebGL renderer. With BINCOV_EXPECT_RENDERER set (a regular expression), any other renderer, or no
 * WebGL at all, fails the job before the suites start. Exit codes: 0 ok, 1 wrong or missing renderer, 2 Chromium
 * did not start (the workflow then installs Playwright's apt dependencies and checks again).
 */
import { appendFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function rendererProblem(renderer, expected) {
  if (!renderer) return 'WebGL is unavailable';
  if (expected && !new RegExp(expected).test(renderer)) return `WebGL renderer "${renderer}" does not match /${expected}/`;
  return null;
}

/** One line for $GITHUB_ENV; a renderer string never legitimately spans lines. */
export const envLine = (name, value) => `${name}=${String(value).replace(/[\r\n]+/g, ' ')}\n`;

async function main(env = process.env) {
  const { chromium } = await import('playwright');
  const { browserOptions } = await import('../browser-options.mjs');
  let browser;
  try { browser = await chromium.launch(browserOptions); }
  catch (error) { console.error(`Chromium did not start: ${error.message}`); return 2; }
  try {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null;
    });
    const { gpu } = await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo');
    const features = ['webgl', '2d_canvas', 'rasterization', 'gpu_compositing']
      .map(name => `${name}=${gpu?.featureStatus?.[name] ?? 'unknown'}`).join(', ');
    const cpu = `${cpus()[0]?.model ?? 'unknown CPU'} × ${availableParallelism()}`;
    const problem = rendererProblem(renderer, env.BINCOV_EXPECT_RENDERER);
    console.log(`WebGL renderer: ${renderer ?? 'none'}\nChromium features: ${features}\nCPU: ${cpu}`);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, `\n### Browser renderer\n\n- WebGL: \`${renderer ?? 'none'}\`\n- Chromium features: ${features}\n- CPU: ${cpu}\n`);
    }
    if (env.GITHUB_ENV && renderer) appendFileSync(env.GITHUB_ENV, envLine('BINCOV_RENDERER', renderer));
    if (problem) { console.error(problem); return 1; }
    return 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.stack ?? error); process.exitCode = 1; });
}
