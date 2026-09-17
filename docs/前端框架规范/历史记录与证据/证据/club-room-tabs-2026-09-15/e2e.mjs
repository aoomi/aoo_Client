import { chromium } from '/Users/aoo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const browser = await chromium.connectOverCDP('http://127.0.0.1:1237');
const page = browser.contexts()[0].pages()[0];
const errors = [];
const tabLogs = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => {
    if (msg.text().includes('[ClubRoomTabs]')) tabLogs.push(msg.text());
});
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:7456', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5500);
await page.mouse.click(672, 493);
await page.waitForTimeout(800);
await page.mouse.click(640, 354); await page.keyboard.type('31');
await page.mouse.click(640, 416); await page.keyboard.type('1');
await page.mouse.click(733, 484);
await page.waitForTimeout(5000);
await page.mouse.click(900, 438);
await page.waitForTimeout(2500);
await page.mouse.click(399, 468);
await page.waitForTimeout(5000);
await page.screenshot({ path: fileURLToPath(new URL('01-all-tabs.png', import.meta.url)) });
console.log(JSON.stringify({ errors, tabLogs }));
await browser.close();
