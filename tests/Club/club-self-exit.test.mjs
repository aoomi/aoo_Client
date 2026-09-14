import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubManagementController.ts', import.meta.url), 'utf8');
const call = source.match(/client\.request\('club\.CClubChangePlayerStatus', \{([^}]+)\}\)/)?.[1] ?? '';

assert.match(call, /clubId/);
assert.match(call, /status:\s*0x40/);
assert.doesNotMatch(call, /pid/);

console.log('club self exit request contract passed');
