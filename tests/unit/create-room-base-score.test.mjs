import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'assets/Modules/CreateRoom/Code/PlaySelectorController.ts'), 'utf8');
const numpad = fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/ui/NumpadService.ts'), 'utf8');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/Modules/CreateRoom/Prefab/CreateRoom.prefab'), 'utf8'));
const numpadPrefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/Common/Prefab/Numpad.prefab'), 'utf8'));
const nodes = prefab.filter(item => item?.__type__ === 'cc.Node');

test('base score uses the shared Numpad and enters the authoritative create rules', () => {
    assert.match(source, /new NumpadService\(\)/);
    assert.match(source, /this\.forms\.loadCommonNumpad\(\)/);
    assert.match(source, /decimalPlaces: 2/);
    assert.match(source, /setValue: value => \{ this\.baseScoreDraft = value; \}/);
    assert.match(source, /\^\\d\+\(\?:\\\.\\d\{1,2\}\)\?\$/);
    assert.match(source, /Math\.round\(value \* 100\) === value \* 100/);
    assert.match(source, /baseScore: this\.baseScore/);
    assert.match(source, /this\.preferences\.save\(preferenceIdentity, submittedRules\)/);
});

test('base score delegates decimal editing to the single shared input state machine', () => {
    assert.match(source, /decimalPlaces: 2/);
    assert.match(source, /最多保留两位小数/);
    assert.doesNotMatch(source, /digit:\s*\(|backspace:|clear:|decimal:\s*\(/);
    assert.match(numpad, /private appendDigit\(/);
    assert.match(numpad, /private appendDecimal\(/);
    assert.match(numpad, /return current \? `\$\{current\}\.` : '0\.'/);
    assert.match(numpad, /dot\.getComponent\(NumpadDotBridge\) \?\? dot\.addComponent\(NumpadDotBridge\)/);
    assert.match(numpad, /contentRoot\.on\(NUMPAD_DECIMAL_EVENT, invokeDecimal\)/);
});

test('renamed base score nodes keep the user-authored hierarchy', () => {
    const button = nodes.find(node => node._name === 'Btn_BaseScore');
    const label = nodes.find(node => node._name === 'Label' && prefab[node._parent?.__id__] === button);
    assert.ok(button && label);
    assert.equal(prefab[button._parent.__id__]?._name, 'Ante');
    assert.equal(label._parent.__id__, prefab.indexOf(button));
});

test('CreateRoom prefab follows the node naming contract without legacy aliases', () => {
    assert.equal(prefab[0]._name, 'CreateRoom');
    assert.equal(nodes[0]._name, 'CreateRoom');
    for (const node of nodes) {
        const hasButton = node._components.some(reference => prefab[reference.__id__]?.__type__ === 'cc.Button');
        if (hasButton && node._name !== 'Bg') assert.match(node._name, /^Btn_[A-Z][A-Za-z0-9]*$/);
    }
    const names = new Set(nodes.map(node => node._name));
    for (const legacy of ['Create_Room', 'CloseButton', 'ResetButton', 'BaseScoreButton',
        'CreateButton', 'LoadGameplayButton', 'btn_next', 'left', 'ValueLabel']) {
        assert.equal(names.has(legacy), false, legacy);
    }
});

test('dot key uses the same button target contract as numeric keys', () => {
    const dot = numpadPrefab.find(item => item?.__type__ === 'cc.Node' && item?._name === 'Btn_Dot');
    assert.ok(dot);
    const button = dot._components
        .map(reference => numpadPrefab[reference.__id__])
        .find(component => component?.__type__ === 'cc.Button');
    assert.ok(button);
    assert.equal(button._target, null);
});
