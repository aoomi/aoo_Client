import { chromium } from '/Users/aoo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const out = new URL('./final-release-retained/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:1234');
const context = browser.contexts()[0];
let page = context.pages().find(item => item.url().includes('localhost:7456')) ?? context.pages()[0];
await context.clearCookies();
const client = await context.newCDPSession(page);
await client.send('Network.enable');
await client.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.goto(`http://localhost:7456/?account-room-final=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const name of await indexedDB.databases()) if (name.name) indexedDB.deleteDatabase(name.name);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2_000);
const logs = [];
page.on('console', message => logs.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`));
await page.mouse.click(672, 450);
await page.waitForTimeout(200);
await page.mouse.click(640, 309);
await page.keyboard.type('11');
await page.mouse.click(640, 372);
await page.keyboard.type('1');
await page.mouse.click(730, 440);
const frames = [];
for (let index = 0; index < 28; index += 1) {
    await page.waitForTimeout(100);
    const file = new URL(`frame-${String(index).padStart(3, '0')}.png`, out);
    await page.screenshot({ path: decodeURIComponent(file.pathname) });
    frames.push(await page.evaluate(() => ({
        scene: globalThis.cc?.director?.getScene?.()?.name ?? null,
        cover: !document.querySelector('#aoo-scene-transition-cover')?.hidden,
        retained: !document.querySelector('#aoo-presentation-retained-frame')?.hidden,
    })));
}
await page.waitForTimeout(8_000);
const relevantLogs = logs.filter(line => /pageerror|hall request failed|Unhandled|AooPresentationTransition|AuthNavigation/.test(line));
await fs.writeFile(new URL('result.json', out), JSON.stringify({ frames, relevantLogs }, null, 2));
console.log(JSON.stringify({ frames, relevantLogs }, null, 2));
await browser.close();
