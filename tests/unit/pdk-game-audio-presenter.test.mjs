import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const sourcePath = path.join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkGameAudioPresenter.ts');
const controllerPath = path.join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');
const commonRoot = path.join(clientRoot, 'assets/Games/Poker/PDK/Common');
const audioRoot = path.join(commonRoot, 'Audio/Game');
const source = fs.readFileSync(sourcePath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

test('game audio is published inside the shared PDK common bundle', () => {
    const meta = JSON.parse(fs.readFileSync(`${commonRoot}.meta`, 'utf8'));
    assert.equal(meta.userData.isBundle, true);
    assert.equal(meta.userData.bundleName, 'paodekuai-common');
    assert.match(source, /PDK_GAME_AUDIO_BUNDLE = 'paodekuai-common'/);
    assert.match(source, /Audio\/Game\/\$\{gender\}/);
});

test('every registered announcement exists for both genders with meta', () => {
    const staticFiles = [...source.matchAll(/^\s+\d+: '([^']+)',$/gm)].map((match) => match[1]);
    const rankFiles = ['ge4_0', 'ge10_0', 'gea_0', 'dui5_0', 'duiq_0', 'sange6_0', 'sangek_0'];
    for (const gender of ['Boy', 'Girl']) {
        for (const file of [...new Set([...staticFiles, ...rankFiles])]) {
            assert.equal(fs.existsSync(path.join(audioRoot, gender, `${file}.mp3`)), true, `${gender}/${file}.mp3`);
            assert.equal(fs.existsSync(path.join(audioRoot, gender, `${file}.mp3.meta`)), true, `${gender}/${file}.mp3.meta`);
        }
    }
});

test('controller plays only newly presented authoritative actions and legacy OpCard events', () => {
    assert.match(controller, /if \(animate\) \{[\s\S]*this\.playGameOperation\(entry\.dataSeat, actionType, values\)/);
    assert.match(controller, /event === 'OpCard'[\s\S]*this\.playGameOperation\(Number\(packet\.pos \?\? packet\.opPos\), opType/);
    assert.match(controller, /const actionKey = this\.authorityActionKey\(latest\);[\s\S]*this\.tableActionIds\.add\(actionKey\);[\s\S]*this\.playGameOperation\(dataSeat, actionType, cards\)/);
    assert.match(controller, /private authorityActionKey[\s\S]*if \(operationId\) return operationId;[\s\S]*cards\.map\(Number\)\.join/);
    assert.match(controller, /String\(action\.action\) === 'pass' \? 1/);
    assert.match(controller, /FOUR_WITH_TWO_PAIRS'\) return 20/);
});

test('missing exact rank or pattern returns no route instead of a wrong announcement', () => {
    assert.match(source, /Returns null when this supplied audio set has no exact announcement/);
    assert.match(source, /const rank = RANK_NAMES\[cardRank\(Number\(cards\[0\]\)\)\]/);
    assert.doesNotMatch(source, /8: 'sidaier'/);
    assert.doesNotMatch(source, /10: 'sidaierdui'/);
});
