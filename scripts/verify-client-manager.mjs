import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typecheckOnly = process.argv.includes('--typecheck');
const creatorTscCandidates = [
    process.env.AOO_COCOS_TSC,
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/tsc.js',
].filter(Boolean);
const creatorTsc = creatorTscCandidates.find(existsSync);
if (!creatorTsc) {
    console.error('UNUSED17: Cocos Creator 3.8.8 TypeScript compiler is unavailable; refusing fallback compiler');
    process.exit(1);
}

const version = spawnSync(process.execPath, [creatorTsc, '--version'], { cwd: root, encoding: 'utf8' });
if (version.status !== 0 || !/\b4\.9\.5\b/.test(`${version.stdout ?? ''}${version.stderr ?? ''}`)) {
    console.error(`UNUSED17: expected Cocos TypeScript 4.9.5, got ${`${version.stdout ?? ''}${version.stderr ?? ''}`.trim()}`);
    process.exit(version.status ?? 1);
}

const commands = [];
if (!typecheckOnly) commands.push([process.execPath, ['--test', 'tests/unit/client-manager-lifecycle.test.mjs']]);
commands.push([process.execPath, [creatorTsc, '--noEmit', '-p', 'tsconfig.json']]);
for (const [command, args] of commands) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
