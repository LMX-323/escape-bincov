import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const executablePath = process.env.BINCOV_CHROME || (existsSync(windowsChrome) ? windowsChrome : chromium.executablePath());
const extraArgs = process.env.BINCOV_CHROME_ARGS ? JSON.parse(process.env.BINCOV_CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) throw new Error('BINCOV_CHROME_ARGS must be a JSON string array.');
export const browserOptions = {
  executablePath, headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', ...extraArgs],
};
