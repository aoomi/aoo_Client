import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controller = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts',
  import.meta.url,
), 'utf8');
const warning = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkWarningPresenter.ts',
  import.meta.url,
), 'utf8');
const coordinator = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts',
  import.meta.url,
), 'utf8');
const registry = readFileSync(new URL(
  '../../assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts',
  import.meta.url,
), 'utf8');

test('seat actions resolve from the authored Head children', () => {
  assert.match(controller, /Players\/Play_\$\{physicalSlot\}\/Head\/Btn_CardSelection/);
  assert.match(controller, /Players\/Play_\$\{physicalSlot\}\/Head\/Btn_DealQuality/);
  assert.match(controller, /this\.openCardSelection\(target\.dataSeat\)/);
  assert.match(controller, /this\.openDealQuality\(target\.dataSeat\)/);
  assert.doesNotMatch(controller, /Players\/Play_\$\{physicalSlot\}\/CardSelection/);
});

test('both head tools preload their authoritative popup and open on one action', () => {
  assert.match(registry, /AddSubtract: \{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/AddSubtract' \}/);
  assert.match(coordinator, /this\.forms\.register\(DEAL_QUALITY_FORM/);
  assert.match(coordinator, /POKER_CARD_SELECTION_FORM,[\s\S]*DEAL_QUALITY_FORM,[\s\S]*this\.forms\.preload\(form\)/);
  assert.match(coordinator, /this\.forms\.register\(DEAL_QUALITY_FORM,[\s\S]*onCreate: \(form\) => this\.bindDealQualityForm\(form\)[\s\S]*onShow: \(form\) => this\.bindDealQualityForm\(form\)/);
  assert.match(coordinator, /\['Btn_Add', 'Btn_Subtract', 'Btn_Close'\]/);
  assert.match(coordinator, /name === 'Btn_Close' \? this\.onDealQualityClose : this\.onDealQualityAction/);
  assert.match(coordinator, /onDealQualityAction[\s\S]*this\.showMessage\('OK了'\)[\s\S]*this\.forms\.closeAfterPointer\(DEAL_QUALITY_FORM\)/);
  assert.match(coordinator, /onDealQualityClose[\s\S]*this\.forms\.closeAfterPointer\(DEAL_QUALITY_FORM\)/);
  assert.match(coordinator, /this\.forms\.show\(DEAL_QUALITY_FORM, \{ targetPlayerId, targetSeat \}\)/);
  assert.match(controller, /openHeadControlAtUi\(location\.x, location\.y, target\)/);
  assert.match(controller, /openHeadControlAtUi\(uiLocation\.x, uiLocation\.y, target\)/);
  assert.match(controller, /target\.name === 'Btn_CardSelection' \|\| target\.name === 'Btn_DealQuality'/);
  assert.match(controller, /target\.name === 'Btn_CardSelection' \? 'card-selection' : 'deal-quality'/);
  assert.match(controller, /event\.propagationStopped = true/);
});

test('one public warning mount follows the warned player head', () => {
  assert.match(warning, /const MOUNT_PATH = 'RoomCommon\/Warning'/);
  assert.match(warning, /Players\/Play_\$\{physicalSlot\}\/Head/);
  assert.match(warning, /convertToNodeSpaceAR\(head\.worldPosition\)/);
  assert.match(warning, /ddz_szbj_\$\{remaining\}_ani/);
  assert.match(controller, /warning\?\.showAt\(entry\.physicalSlot, remaining\)/);
});
