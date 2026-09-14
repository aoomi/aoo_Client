import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const sourceUrl = new URL('../../assets/Common/Code/Runtime/state/SeatPerspective.ts', import.meta.url);
const source = ts.transpileModule(await readFile(sourceUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSeatPerspective, SeatVisualSlot } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (let count = 2; count <= 8; count += 1) {
    for (let local = 0; local < count; local += 1) {
        const mapping = createSeatPerspective(count, local);
        const localIndexes = new Set();
        for (let absolute = 0; absolute < count; absolute += 1) {
            const index = mapping.localIndexOf(absolute);
            localIndexes.add(index);
            assert.equal(mapping.absoluteSeatOf(index), absolute);
        }
        assert.equal(localIndexes.size, count);
        assert.equal(mapping.visualSlotOf(local), SeatVisualSlot.SELF);
    }
}

for (let count = 2; count <= 8; count += 1) {
    for (let before = 0; before < count; before += 1) {
        for (let after = 0; after < count; after += 1) {
            const restored = createSeatPerspective(count, after);
            assert.equal(restored.localIndexOf(after), 0, `reconnect ${count}/${before}->${after}`);
            assert.equal(restored.absoluteSeatOf(0), after);
        }
    }
}

assert.deepEqual([0, 1].map(createSeatPerspective(2, 0).visualSlotOf), ['self', 'opposite']);
assert.deepEqual([0, 1, 2].map(createSeatPerspective(3, 0).visualSlotOf), ['self', 'right', 'left']);
assert.deepEqual([0, 1, 2, 3].map(createSeatPerspective(4, 0).visualSlotOf), ['self', 'right', 'opposite', 'left']);
console.log('SEAT04 seat perspective cases passed');
