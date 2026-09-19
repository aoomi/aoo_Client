import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const coordinator = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts',
  import.meta.url,
), 'utf8');
const prefab = JSON.parse(readFileSync(new URL(
  '../../assets/Games/Common/Prefab/AddSubtract.prefab',
  import.meta.url,
), 'utf8'));

test('AddSubtract exposes three authored buttons', () => {
  const names = prefab
    .filter((entry) => entry?.__type__ === 'cc.Node')
    .map((entry) => entry._name);
  assert.deepEqual(names, ['AddSubtract', 'Btn_Add', 'Btn_Subtract', 'Btn_Close']);
});

test('action buttons confirm and close while Btn_Close only closes', () => {
  assert.match(coordinator, /\['Btn_Add', 'Btn_Subtract', 'Btn_Close'\]/);
  assert.match(coordinator, /name === 'Btn_Close' \? this\.onDealQualityClose : this\.onDealQualityAction/);
  assert.match(coordinator, /onDealQualityAction[\s\S]*this\.showMessage\('OK了'\)[\s\S]*this\.forms\.closeAfterPointer\(DEAL_QUALITY_FORM\)/);
  assert.match(coordinator, /onDealQualityClose[\s\S]*this\.forms\.closeAfterPointer\(DEAL_QUALITY_FORM\)/);
});
