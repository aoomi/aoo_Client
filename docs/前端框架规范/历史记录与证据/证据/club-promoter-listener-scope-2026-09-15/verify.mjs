import { chromium } from '/Users/aoo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const browser = await chromium.connectOverCDP('http://127.0.0.1:1237');
const page = browser.contexts()[0].pages().find(item => item.url().includes('127.0.0.1:7456'));
if (!page) throw new Error('Creator Preview page not found');
await page.mouse.click(952, 203);
await page.waitForTimeout(3500);
await page.screenshot({ path: fileURLToPath(new URL('08-promoter-window.png', import.meta.url)) });
await browser.close();
