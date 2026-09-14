import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const template = readFileSync(`${clientRoot}/build-templates/web-desktop/index.html`, 'utf8');

test('web desktop Canvas fits the viewport without changing the 16:9 game coordinates', () => {
  assert.doesNotMatch(template, /style="width:\s*1280px;\s*height:\s*720px;"/);
  assert.match(template, /width:min\(100vw, calc\(100d?vh \* 16 \/ 9\)\) !important/);
  assert.match(template, /height:min\(100d?vh, calc\(100vw \* 9 \/ 16\)\) !important/);
  assert.match(template, /#Cocos3dGameContainer, #GameCanvas \{ width:100% !important; height:100% !important; \}/);
  assert.match(template, /<canvas id="GameCanvas" width="1280" height="720"/);
});
