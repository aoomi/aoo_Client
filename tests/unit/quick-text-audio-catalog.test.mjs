import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../assets/Games/Common/Code/Audio/QuickTextAudioCatalog.ts', import.meta.url), 'utf8');
const soundConfig = JSON.parse(readFileSync(new URL('../../assets/Games/Poker/Common/Config/Legacy/assets/njpdk/jsonData/Sound.json', import.meta.url), 'utf8'));

test('quick-text audio catalog uses the shared audio bundle and stable paths', () => {
    assert.match(source, /QUICK_TEXT_AUDIO_BUNDLE = 'games-common-audio'/);
    assert.match(source, /Chat\/Mandarin\/\$\{request\.gender\}\/\$\{fileName\}/);
    assert.match(source, /quick-text-\$\{String\(request\.quickTextId\)\.padStart\(2, '0'\)\}/);
});

test('regional quick-text audio falls back to Mandarin', () => {
    assert.match(source, /Chat\/Dialect\/\$\{request\.region\}\/\$\{request\.gender\}\/\$\{fileName\}/);
    assert.match(source, /\[.*Dialect.*mandarinPath\]/s);
    assert.deepEqual([...source.matchAll(/'CD'|'NJ'|'LS'/g)].map(match => match[0]), ["'CD'", "'NJ'", "'LS'"]);
});

test('catalog rejects quick-text IDs without confirmed assets', () => {
    assert.match(source, /MIN_QUICK_TEXT_ID = 1/);
    assert.match(source, /MAX_QUICK_TEXT_ID = 10/);
    assert.match(source, /throw new Error\(`快捷文字 ID 无效/);
});

test('confirmed Mandarin clips and their original metas exist at every configured path', () => {
    for (const gender of ['boy', 'girl']) {
        const directory = gender === 'boy' ? 'Boy' : 'Girl';
        for (let id = 1; id <= 10; id += 1) {
            const key = `${gender}_FastVoice_${id}`;
            const fileName = `quick-text-${String(id).padStart(2, '0')}`;
            assert.equal(soundConfig[key].SoundBundle, 'games-common-audio');
            assert.equal(soundConfig[key].SoundPath, `Chat/Mandarin/${directory}/${fileName}`);
            const asset = new URL(`../../assets/Games/Common/Audio/${soundConfig[key].SoundPath}.mp3`, import.meta.url);
            assert.equal(existsSync(asset), true, asset.pathname);
            assert.equal(existsSync(new URL(`${asset.pathname}.meta`, import.meta.url)), true, `${asset.pathname}.meta`);
        }
    }
});

test('unconfirmed legacy clips remain untouched for later classification', () => {
    for (const gender of ['boy', 'girl']) {
        for (const name of ['11', '12', 'ay_1', 'ay_16']) {
            const asset = new URL(`../../assets/Common/Audio/Legacy/assets/njpdk/sound/chat/${gender}/${name}.mp3`, import.meta.url);
            assert.equal(existsSync(asset), true, asset.pathname);
            assert.equal(existsSync(new URL(`${asset.pathname}.meta`, import.meta.url)), true, `${asset.pathname}.meta`);
        }
    }
});
