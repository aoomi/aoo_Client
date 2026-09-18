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

test('seat actions resolve from the authored Head children', () => {
  assert.match(controller, /Players\/Play_\$\{physicalSlot\}\/Head\/Btn_CardSelection/);
  assert.match(controller, /Players\/Play_\$\{physicalSlot\}\/Head\/Btn_DealQuality/);
  assert.doesNotMatch(controller, /Players\/Play_\$\{physicalSlot\}\/CardSelection/);
});

test('one public warning mount follows the warned player head', () => {
  assert.match(warning, /const MOUNT_PATH = 'RoomCommon\/Warning'/);
  assert.match(warning, /Players\/Play_\$\{physicalSlot\}\/Head/);
  assert.match(warning, /convertToNodeSpaceAR\(head\.worldPosition\)/);
  assert.match(warning, /ddz_szbj_\$\{remaining\}_ani/);
  assert.match(controller, /warning\?\.showAt\(entry\.physicalSlot, remaining\)/);
});
