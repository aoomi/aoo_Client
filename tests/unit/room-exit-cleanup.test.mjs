import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';
const url = new URL('../../assets/Common/Code/Runtime/state/RoomExitCleanup.ts', import.meta.url);
const source = ts.transpileModule(await readFile(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const calls = []; const resources = Object.fromEntries(api.REQUIRED_ROOM_EXIT_CLEANUPS.map(name => [name, () => { calls.push(name); if (name === 'cancelTimers') throw new Error('race'); }]));
let cleanupError; try { api.cleanupRoomClient(resources); } catch (error) { cleanupError = error; }
assert.match(cleanupError?.message ?? '', /room exit cleanup failed: cancelTimers/);
assert.deepEqual(cleanupError.failures.map(item => item.name), ['cancelTimers']);
assert.deepEqual(calls, api.REQUIRED_ROOM_EXIT_CLEANUPS);
assert.throws(() => api.cleanupRoomClient({}), /missing room exit cleanup/);
console.log('SEAT11 client cleanup cases passed');
