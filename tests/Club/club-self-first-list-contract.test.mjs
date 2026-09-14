import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('member list pins the authenticated player before every render', () => {
    const source = read('assets/Club/Code/Runtime/LegacyClubMemberController.ts');
    assert.match(source, /const orderedRows = \[\.\.\.rows\]\.sort/);
    assert.match(source, /Number\(left\.shortPlayer\?\.pid \?\? 0\) === this\.playerId/);
    assert.match(source, /for \(const row of orderedRows\)/);
});

test('captain list pins self by identity and never assumes row zero is self', () => {
    const source = read('assets/Club/Code/Runtime/LegacyClubPromotionController.ts');
    assert.match(source, /Number\(left\.pid \?\? 0\) === this\.playerId/);
    assert.match(source, /const isSelf = pid === this\.playerId/);
    assert.doesNotMatch(source, /rowIndex === 0/);
});
