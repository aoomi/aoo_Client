import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubPromotionController.ts', import.meta.url),
    'utf8',
);
const main = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url),
    'utf8',
);

for (const button of [
    'btn_setClubCent', 'btn_xiaji', 'btn_setPromoter', 'btn_record', 'btn_baobiao',
    'btn_delPromoter', 'btn_cancelPromoter', 'btn_jjdz', 'btn_bmffc',
    'btn_changePromoter', 'btn_powerOp', 'btn_ClubCentWarning',
    'btn_spWarningPersonal', 'btn_selfFenCheng', 'btn_Examine',
]) {
    assert.match(controller, new RegExp(`this\\.action\\(control, '${button}'`), `${button} must have an action`);
}

assert.match(controller, /expanded \? 230 : 80/,
    'expanded/collapsed row heights must match 2.22');
assert.match(controller, /for \(const sibling of row\.parent\?\.children \?\? \[\]\) if \(sibling !== row\) this\.setManagerRowExpanded\(sibling, false\)/,
    'opening a row must close all sibling rows');
assert.doesNotMatch(controller, /setManagerRowExpanded\(firstRow, true\)/,
    'manager rows must remain collapsed until the user clicks one');
assert.match(controller, /form\.node\.getComponent\(Button\)[\s\S]*inheritedRootButton\.enabled = false/,
    'promoter display settings must disable the legacy full-screen root button that steals Toggle input');
assert.match(controller, /bindShowToggleClicks\(this\.desc\(form\.node, 'allToggleNode'\)\)/,
    'promoter display toggles must bind their compatibility click targets');
assert.match(controller, /layout\?\.updateLayout\(\)[\s\S]*layout\.enabled = false/,
    'promoter display settings must preserve imported layout positions before changing hit boxes');
assert.match(controller, /toggle\.interactable = true[\s\S]*setContentSize\(200, 50\)/,
    'each native Toggle must receive a full-size clickable area');
assert.doesNotMatch(controller, /LegacyToggleClickArea/,
    'promoter display settings must not maintain a second synthetic toggle state');
assert.match(controller, /rowIndex === 0 \|\| pid === this\.playerId[\s\S]*promotionManagePid[\s\S]*partnerPid[\s\S]*this\.active\(node, 'btn_ShowBtn', false\)[\s\S]*this\.active\(node, 'btn_control', false\)[\s\S]*continue/,
    'the fixed first self-summary row and matching self identities must remain display-only');
assert.match(controller, /club\.CClubSubordinateLevelSportsPoint/,
    'club-point action must load its authoritative limits');
assert.match(controller, /club\.CClubSportsPointExamine/,
    'review action must call the 2.22 review protocol');
assert.match(controller, /club\.CClubGetUplevelPromotion/,
    'change-parent action must load the current authoritative parent before opening');
assert.match(main, /forms\.show\(path, \{ \.\.\.\(this\.club \?\? \{\}\), pid: this\.playerId \}\)/,
    'promoter page must receive the current player id for self-action rules');
assert.match(controller, /private replaceSectionNumberOnInput = true/,
    'decimal input must track the first key independently from the displayed value');
assert.match(controller, /let text = this\.replaceSectionNumberOnInput \? '' : label\.string/,
    'the first digit must replace the old value exactly once');
assert.match(controller, /digit === '\.' && text\.length === 0 \? '0\.' : `\$\{text\}\$\{digit\}`/,
    'a decimal point must form a valid 0.x value and subsequent input must append');
assert.doesNotMatch(controller, /text === String\(this\.sectionContext\.shareToSelfValue/,
    'input state must not be inferred by comparing text with the previous numeric value');

console.log('club promoter 2.22 action contract passed');
