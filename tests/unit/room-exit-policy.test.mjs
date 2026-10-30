import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const typescript = require('typescript');
const source = readFileSync(new URL('../../assets/Games/Common/Code/Room/RoomController.ts', import.meta.url), 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', compiled)(loaded.exports, loaded);
const { canLeaveRoom } = loaded.exports;

test('room exit policy permits waiting states and blocks only active dealt rounds', () => {
  assert.equal(canLeaveRoom({ cardsDealt: false, phase: 'COMPETE_DEALER', legacyState: 1 }), true);
  assert.equal(canLeaveRoom({ cardsDealt: false, phase: 'WAITING_EX' }), true);
  assert.equal(canLeaveRoom({ cardsDealt: true, phase: 'PLAYING' }), false);
  assert.equal(canLeaveRoom({ phase: 'RESPONDING' }), false);
  assert.equal(canLeaveRoom({ phase: 'FINISHED' }), true);
  assert.equal(canLeaveRoom({ legacyState: 1 }), false);
});
