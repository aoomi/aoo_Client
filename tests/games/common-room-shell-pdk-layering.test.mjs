import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../../assets/Games/Common/Code/Room/CommonRoomShellMount.ts', import.meta.url);
const coordinatorUrl = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts', import.meta.url);
const runtimeEntriesUrl = new URL('../../assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts', import.meta.url);

test('shared CommonRoom renders above PDK gameplay and both stay below overlays', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /child\.name === 'PDK_CommonRoom'/);
    assert.match(source, /const pdkTarget = highestSceneIndex >= 0 \? highestSceneIndex \+ 1/);
    assert.match(source, /const commonTarget = pdkGameplayRoot\.getSiblingIndex\(\) \+ 1/);
    assert.match(source, /const overlayTarget = root\.getSiblingIndex\(\) \+ 1 \+ index/);
    assert.ok(source.indexOf('pdkGameplayRoot.setSiblingIndex(clampIndex(pdkTarget))')
        < source.indexOf('root.setSiblingIndex(clampIndex(commonTarget))'));
    assert.doesNotMatch(source, /PDK_CommonRoom\.prefab/);
});

test('PDK reflows the shared shell only after initial presentation settles', async () => {
    const source = await readFile(coordinatorUrl, 'utf8');
    const showIndex = source.indexOf('await this.forms.show(PDK_ROOM_FORM)');
    const presentationIndex = source.indexOf('await this.playController?.waitForInitialPresentation()');
    const reflowIndex = source.indexOf('reflowCommonRoomShell(roomForm.node)');

    assert.ok(showIndex >= 0);
    assert.ok(presentationIndex > showIndex);
    assert.ok(reflowIndex > presentationIndex);
});

test('common lifecycle reflows after its popup and result forms finish installing', async () => {
    const source = await readFile(runtimeEntriesUrl, 'utf8');
    const installIndex = source.indexOf('await lifecycle.install()');
    const reflowIndex = source.indexOf('reflowCommonRoomShell(root)', installIndex);

    assert.ok(installIndex >= 0);
    assert.ok(reflowIndex > installIndex);
});
