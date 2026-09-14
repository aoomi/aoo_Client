import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [command, args] of [
    ['node', ['--test', 'tests/unit/client-manager-lifecycle.test.mjs']],
    ['pnpm', ['--package=typescript@5.9.2', 'dlx', 'tsc', '-p', 'tsconfig.json', '--noEmit']],
]) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
