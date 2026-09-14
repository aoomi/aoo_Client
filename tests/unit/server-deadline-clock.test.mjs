import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path = new URL('../../assets/Common/Code/Runtime/state/ServerDeadlineClock.ts', import.meta.url);
let source = fs.readFileSync(path, 'utf8')
    .replace(/export interface ServerTimedResponse \{[\s\S]*?\n\}/, '')
    .replace('export class ServerDeadlineClock', 'class ServerDeadlineClock')
    .replace(/: ServerTimedResponse/g, '').replace(/: number/g, '').replace(/: void/g, '').replace(/: string/g, '').replace(/: boolean/g, '')
    .replace(/private /g, '');
const sandbox = {}; vm.createContext(sandbox); vm.runInContext(`${source};globalThis.ServerDeadlineClock=ServerDeadlineClock`, sandbox);
const clock = new sandbox.ServerDeadlineClock();
clock.update({serverTimeEpochMillis: 10_000, operationDeadline: {operationId: 'play', deadlineEpochMillis: 30_000}}, 1_000);
assert.equal(clock.remainingMillis(6_000), 15_000);
assert.equal(clock.currentOperationId(), 'play');
assert.equal(clock.locallyExpired(21_000), true);
assert.throws(() => clock.update({serverTimeEpochMillis: 0}, 1));
console.log('server deadline display clock passed');
