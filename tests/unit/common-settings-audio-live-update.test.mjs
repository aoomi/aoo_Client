import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const settings = read('../../assets/Common/Code/UI/CommonSettingsController.ts');
const audio = read('../../assets/Common/Code/Runtime/core/LegacyAudioService.ts');
const roomAudio = read('../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoomAudioPresenter.ts');
const gameAudio = read('../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkGameAudioPresenter.ts');

test('shared settings slider applies every change immediately', () => {
    assert.match(settings, /slider\.node\.on\('slide', changed/);
    assert.match(settings, /legacyAudioService\.applySettings\(\)/);
    assert.match(audio, /for \(const listener of this\.settingsListeners\) listener\(settings\)/);
});

test('active PDK music and effects subscribe to shared volume settings', () => {
    assert.match(roomAudio, /legacyAudioService\.onSettingsChanged/);
    assert.match(roomAudio, /this\.music\.volume = settings\.musicVolume/);
    assert.match(roomAudio, /this\.effect\.volume = settings\.effectsVolume/);
    assert.match(gameAudio, /legacyAudioService\.onSettingsChanged/);
    assert.match(gameAudio, /this\.source\.volume = settings\.effectsVolume/);
});

test('effect volume uses AudioSource as the single gain stage', () => {
    assert.match(audio, /this\.effects\.playOneShot\(await this\.load\(path\), 1\)/);
    assert.match(roomAudio, /this\.effect\.playOneShot\(clip, 1\)/);
    assert.match(gameAudio, /this\.source\.playOneShot\(clip, 1\)/);
});
