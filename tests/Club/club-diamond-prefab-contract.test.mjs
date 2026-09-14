import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prefabPath = new URL('../../assets/Club/Prefab/ClubDiamond.prefab', import.meta.url);
const controllerPath = new URL('../../assets/Club/Code/Runtime/LegacyClubManagementController.ts', import.meta.url);
const unionControllerPath = new URL('../../assets/Club/Code/Runtime/LegacyUnionManagerController.ts', import.meta.url);

const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
const names = prefab.filter((item) => item?.__type__ === 'cc.Node').map((item) => item._name);
const controller = fs.readFileSync(controllerPath, 'utf8');
const unionController = fs.readFileSync(unionControllerPath, 'utf8');

test('ClubDiamond hierarchy uses concise semantic node names', () => {
    for (const name of ['Panel', 'Header', 'Title', 'HeaderClose', 'AdminLimit', 'MemberLimit', 'Confirm', 'Cancel']) {
        assert.ok(names.includes(name), `missing semantic node: ${name}`);
    }
    for (const legacy of ['bg_create', 'title', 'New Label', 'btn_close', 'EditBox1', 'EditBox2', 'btn_sure', 'label', 'tip1', 'tip2', 'BACKGROUND_SPRITE', 'TEXT_LABEL', 'PLACEHOLDER_LABEL']) {
        assert.ok(!names.includes(legacy), `legacy node remains: ${legacy}`);
    }
});

test('ClubDiamond controller binds only the renamed business nodes', () => {
    assert.match(controller, /register\('ui\/club\/UIClubDiamond'/);
    for (const name of ['HeaderClose', 'AdminLimit', 'MemberLimit', 'Confirm', 'Cancel']) {
        assert.match(controller, new RegExp(`'${name}'`));
    }
    assert.match(controller, /club\.CClubChangeDimondsAttention/);
    assert.match(controller, /union\.CUnionChangeDimondsAttention/);
    assert.match(unionController, /show\('ui\/club\/UIClubDiamond', this\.context\)/);
});
