import assert from 'node:assert/strict';
import test from 'node:test';

import { cocosWorldToClient } from '../../tools/cocos-cdp-coordinate.mjs';

test('maps a standard 1280x720 Canvas without adding a Canvas-origin correction', () => {
  assert.deepEqual(cocosWorldToClient({
    world: { x: 640, y: 360 },
    canvasRect: { left: 0, top: 47 },
    viewport: { x: 0, y: 0 },
    design: { height: 720 },
    scale: { x: 0.9347222222, y: 0.9347222222 },
  }), { x: 598.222222208, y: 383.499999992 });
});

test('maps a mobile SHOW_ALL Canvas using the translated world position exactly once', () => {
  const actual = cocosWorldToClient({
    world: { x: 946.3950152671756, y: 180.673 },
    canvasRect: { left: 0, top: 0 },
    viewport: { x: 0, y: 0 },
    design: { height: 720 },
    scale: { x: 0.5458333333333333, y: 0.5458333333333333 },
  });
  assert.ok(Math.abs(actual.x - 516.5739458333333) < 1e-9);
  assert.ok(Math.abs(actual.y - 294.3826541666667) < 1e-9);
});

test('rejects incomplete coordinate snapshots', () => {
  assert.throws(() => cocosWorldToClient({}), /must be finite/);
});
