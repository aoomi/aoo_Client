import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyNamingConventions } from '../../scripts/verify-naming-conventions.mjs';

test('project naming conventions reject every new unregistered violation', () => {
  const result = verifyNamingConventions();
  assert.equal(result.unexpectedCount, 0);
  assert.ok(result.currentCount <= result.baselineCount);
});
