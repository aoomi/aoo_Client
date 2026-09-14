import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const commonRoot = path.join(clientRoot, 'assets/Games/Poker/PDK/Common');
const audioRoot = path.join(commonRoot, 'Audio/Room');
const source = fs.readFileSync(path.join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoomAudioPresenter.ts'), 'utf8');
const controller = fs.readFileSync(path.join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
const sounds = ['baojing', 'bg', 'chupai', 'daojishi', 'fapai', 'lose', 'win', 'xipai', 'xuanpai', 'zhuang', 'zuoxia'];

test('room audio is published inside the shared PDK common bundle and every semantic sound exists', () => {
    const meta = JSON.parse(fs.readFileSync(`${commonRoot}.meta`, 'utf8'));
    assert.equal(meta.userData.isBundle, true);
    assert.equal(meta.userData.bundleName, 'paodekuai-common');
    assert.match(source, /PDK_ROOM_AUDIO_BUNDLE = 'paodekuai-common'/);
    assert.match(source, /Audio\/Room\/bg/);
    for (const sound of sounds) {
        assert.equal(fs.existsSync(path.join(audioRoot, `${sound}.mp3`)), true, `${sound}.mp3`);
        assert.equal(fs.existsSync(path.join(audioRoot, `${sound}.mp3.meta`)), true, `${sound}.mp3.meta`);
    }
});

test('missing bundle and clip callbacks resolve null without throwing or logging', () => {
    assert.match(source, /resolve\(error \|\| !clip \? null : clip\)/);
    assert.match(source, /resolve\(error \|\| !bundle \? null : bundle\)/);
    assert.doesNotMatch(source, /reject\(|throw new Error|console\./);
});

test('room operations are connected to their semantic sounds', () => {
    for (const sound of ['zuoxia', 'xipai', 'zhuang', 'fapai', 'xuanpai', 'chupai', 'daojishi', 'baojing']) {
        assert.match(controller, new RegExp(`roomAudio\\?\\.play\\('${sound}'`), sound);
    }
    assert.match(controller, /roomAudio\?\.play\(point > 0 \? 'win' : 'lose'\)/);
    assert.match(controller, /roomAudio\?\.playMusic\(\)/);
    assert.match(controller, /!this\.authorityActionsInitialized/);
});
