import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubPromotionController.ts', import.meta.url), 'utf8');

test('captain period buttons update selection and date labels before loading data', () => {
    assert.match(source, /btn_commonOp'.*selectManagerPeriod\(-1\)/);
    assert.match(source, /btn_tian\$\{i\}.*selectManagerPeriod\(i\)/);
    assert.match(source, /updateManagerDates\(\);\s*this\.updateManagerPeriodState\(\);/);
    assert.match(source, /this\.active\(common, 'on', this\.type === -1\)/);
    assert.match(source, /this\.active\(button, 'on', this\.type === index\)/);
    assert.match(source, /Date\.now\(\) - index \* 86400000/);
    assert.match(source, /manager-period-selected/);
});
