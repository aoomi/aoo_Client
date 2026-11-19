import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(join(root, 'assets/Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');

test('reopening a cached form restores its root before onShow runs', () => {
    const show = source.match(/public show\(args: unknown\[\] = \[\]\): void \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    const mount = show.indexOf('this.parent.addChild(this.node)');
    const reactivate = show.indexOf('this.node.active = true');
    const onShow = show.indexOf('this.options.lifecycle?.onShow?.(this, ...args)');

    assert.ok(mount >= 0, 'cached form must be mounted');
    assert.ok(reactivate > mount, 'cached form root must be reactivated after mounting');
    assert.ok(onShow > reactivate, 'root visibility must be restored before onShow can hide the source surface');
});
