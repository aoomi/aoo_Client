import { chromium } from '/Users/aoo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const browser = await chromium.connectOverCDP('http://127.0.0.1:1237');
const page = browser.contexts()[0].pages()[0];
const errors = [];
const tabLogs = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => msg.text().includes('[ClubRoomTabs]') && tabLogs.push(msg.text()));
await page.mouse.click(329, 215);
await page.waitForTimeout(3500);
await page.mouse.click(900, 438);
await page.waitForTimeout(2500);
await page.mouse.click(399, 468);
await page.waitForTimeout(5000);
await page.screenshot({ path: fileURLToPath(new URL('01-all-tabs.png', import.meta.url)) });
// GameTabs is authored on the left edge of the 1280x720 canvas. Click its first dynamic gameplay tab.
await page.mouse.click(254, 340);
await page.waitForTimeout(1200);
await page.screenshot({ path: fileURLToPath(new URL('02-game-selected.png', import.meta.url)) });
console.log(JSON.stringify({ errors, tabLogs }));
await browser.close();
