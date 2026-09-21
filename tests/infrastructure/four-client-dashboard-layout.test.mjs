import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile(new URL('../../tools/dual-client-preview.mjs', import.meta.url), 'utf8');

test('four-client dashboard scales the complete Creator iPhone landscape viewport without cropping', () => {
  assert.match(dashboard, /--pane-width: 922px/);
  assert.match(dashboard, /--iphone-landscape-width: 852px/);
  assert.match(dashboard, /--iphone-landscape-height: 393px/);
  assert.match(dashboard, /--creator-toolbar-height: 50px/);
  assert.match(dashboard, /--iphone-preview-scale: 1\.0821596244/);
  assert.match(dashboard, /--scaled-device-height: 480px/);
  assert.match(dashboard, /--header-height: 34px/);
  assert.match(dashboard, /grid-template-columns: repeat\(2, var\(--pane-width\)\)/);
  assert.match(dashboard, /\.device-viewport \{ width: var\(--pane-width\); height: var\(--scaled-device-height\); overflow: hidden/);
  assert.match(dashboard, /iframe \{ width: var\(--iphone-landscape-width\); height: calc\(var\(--creator-toolbar-height\) \+ var\(--iphone-landscape-height\)\)/);
  assert.match(dashboard, /transform: scale\(var\(--iphone-preview-scale\)\)/);
  assert.match(dashboard, /scrolling="no"/);
  assert.match(dashboard, /data-src=/);
  assert.match(dashboard, /index \* 2000/);
  assert.match(dashboard, /frame\.dataset\.src \+ '&reload=' \+ Date\.now\(\)/);
  assert.match(dashboard, /iframe \{[^}]*border: 0/);
});

test('dashboard scrolls on smaller windows instead of stretching previews', () => {
  assert.match(dashboard, /body \{ overflow: auto; \}/);
  assert.match(dashboard, /width: max-content/);
  assert.match(dashboard, /margin: 0 auto/);
  assert.doesNotMatch(dashboard, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('dashboard does not restore the removed yellow health label', () => {
  assert.doesNotMatch(dashboard, /healthText|health-/);
});
