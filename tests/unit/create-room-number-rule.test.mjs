import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presenter = readFileSync(new URL('../../assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts', import.meta.url), 'utf8');

test('published continuous number rules use the shared bounded stepper contract', () => {
    assert.match(presenter, /type RuleControl = 'radio' \| 'checkbox' \| 'number'/);
    assert.match(presenter, /control === 'number'[\s\S]*appendNumberControl/);
    assert.match(presenter, /private normalizeNumber\(/);
    assert.match(presenter, /private nextNumber\(/);
    assert.match(presenter, /private validNumber\(/);
    assert.match(presenter, /field\.min/);
    assert.match(presenter, /field\.max/);
    assert.match(presenter, /field\.step/);
    assert.match(presenter, /数值无效/);
});

test('number values are serialized as numbers rather than guessed options or text', () => {
    assert.match(presenter, /this\.values\.set\(field\.key, next\)/);
    assert.doesNotMatch(presenter, /parseInt\(|parseFloat\(/);
    assert.match(presenter, /typeof raw !== 'number'/);
});
