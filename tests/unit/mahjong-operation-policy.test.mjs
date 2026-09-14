import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const url = new URL('../../assets/Games/Mahjong/Packs/Pack01/Code/Runtime/hzmj/HzmjOperationPolicy.ts', import.meta.url);
const source = (await readFile(url, 'utf8'))
    .replace(/<string, number>/g, '')
    .replace(/<number>/g, '')
    .replace(/: readonly number\[\]/g, '')
    .replace(/: number\[\]/g, '')
    .replace(/: (?:unknown|number|any)/g, '');
const policy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const round = {
    waitID: 19,
    opPosList: [
        { waitOpPos: 1, opList: [1, 2, 8] },
        { waitOpPos: 2, opList: [3, 7] },
    ],
};
assert.deepEqual(policy.operationsForPosition(round, 1), [1, 2, 8]);
assert.deepEqual(policy.operationsForPosition(round, 2), [3, 7]);
assert.deepEqual(policy.operationsForPosition(round, 0), []);
assert.deepEqual(policy.operationsForPosition({ opPosList: [{ waitOpPos: 1, opList: ['OpType_Chi', 'OpType_SQPass'] }] }, 1), [6, 16]);
assert.equal(policy.passOperation([2, 8]), 8);
assert.equal(policy.passOperation([16, 8]), 16);
assert.equal(policy.passOperation([1, 2]), 0);
assert.deepEqual(policy.operationsForPosition(null, 1), []);
console.log('MJ-C01—MJ-C04 operation policy cases passed');
