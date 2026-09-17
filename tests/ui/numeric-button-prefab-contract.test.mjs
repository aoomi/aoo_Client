import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const assetRoot = path.resolve(import.meta.dirname, '../../assets');
const numericName = /(?:pid|page|percent|sports|prize|score|cost|point|password|active|value|joinGame|leave|panker|diamond|choushui|PL(?:EditBox|Double|Start)|AutoDissolve)/i;
const explicitNumeric = new Set([
    'ClubPromoterAdd/EditBox', 'ForbidAddUser/EditBox', 'ForbidGameAddUser/EditBox',
    'ClubPromoterLevelAdd/EditBox', 'PromoterXIaShuAdd/EditBox', 'PromoterXiaShuList/EditBox',
    'UnionYaoQing/EditBox', 'YaoQing/EditBox',
]);

const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.name.endsWith('.prefab') ? [target] : [];
});

test('all shared numeric-keypad prefab entries use Button + lb', () => {
    let checked = 0;
    for (const file of walk(assetRoot)) {
        const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
        const rootName = objects.find(value => value?.__type__ === 'cc.Node' && value._parent === null)?._name ?? '';
        for (const edit of objects) {
            if (edit?.__type__ !== 'cc.EditBox') continue;
            const node = objects[edit.node?.__id__];
            if (!node || (![2, 3, 5].includes(edit._inputMode) && !numericName.test(node._name ?? '')
                && !explicitNumeric.has(`${rootName}/${node._name ?? ''}`))) continue;
            checked += 1;
            const componentTypes = (node._components ?? []).map(reference => objects[reference.__id__]?.__type__);
            assert.ok(componentTypes.includes('cc.Button'), `${file}: ${node._name} missing cc.Button`);
            assert.equal(edit._enabled, false, `${file}: ${node._name} must not open the native keyboard`);
            const labelComponentId = edit._textLabel?.__id__ ?? edit._N$textLabel?.__id__;
            const labelNode = objects[objects[labelComponentId]?.node?.__id__];
            assert.equal(labelNode?._name, 'lb', `${file}: ${node._name} text child must be named lb`);
        }
    }
    assert.equal(checked, 85, 'numeric entry inventory changed; audit every new entry before updating this count');
});

test('runtime binds buttons without re-enabling legacy EditBox input', () => {
    const source = fs.readFileSync(path.join(assetRoot, 'Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');
    assert.match(source, /edit\.enabled = false;/);
    assert.doesNotMatch(source, /edit\.enabled = true;/);
    assert.match(source, /getChildByName\('lb'\)/);
    assert.match(source, /if \(label\) label\.string = next;/);
    assert.match(source, /'UIClubPromoterLevelAdd\/EditBox'/,
        '添加队长表单必须按运行时表单名绑定公共数字键盘');
    assert.doesNotMatch(source, /\n\s*'ClubPromoterLevelAdd\/EditBox'/,
        '不得使用预制体根节点名冒充运行时表单名');
});
