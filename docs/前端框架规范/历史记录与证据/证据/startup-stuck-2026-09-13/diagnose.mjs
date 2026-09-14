import { chromium } from '/Users/aoo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const browser = await chromium.connectOverCDP('http://127.0.0.1:1234');
const context = browser.contexts()[0];
const page = context.pages()[0];
const logs = [];
page.on('console', message => logs.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`));
await page.goto(`http://localhost:7456/?startup-stuck=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20_000);
const state = await page.evaluate(() => ({
    scene: globalThis.cc?.director?.getScene?.()?.name ?? null,
    startup: document.querySelector('#aoo-startup-cover')?.getAttribute('data-state') ?? null,
    startupHidden: document.querySelector('#aoo-startup-cover')?.hidden ?? null,
    navigationHidden: document.querySelector('#aoo-scene-transition-cover')?.hidden ?? null,
    text: document.body.innerText,
}));
await page.screenshot({ path: '/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/证据/startup-stuck-2026-09-13/after-20s.png' });
await fs.writeFile('/Users/aoo/Code/Game/BCG/Aoo/Client/docs/前端框架规范/历史记录与证据/证据/startup-stuck-2026-09-13/result.json', JSON.stringify({ state, logs }, null, 2));
console.log(JSON.stringify({ state, logs: logs.slice(-100) }, null, 2));
await browser.close();
