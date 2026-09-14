import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Lobby/Code/ClubList/LobbyClubEntryController.ts', import.meta.url),
    'utf8',
);

test('club creation accepts every non-empty character sequence without normalization', () => {
    const start = source.indexOf('private async createClub');
    const end = source.indexOf('private async handleJoinNotification', start);
    const createSource = source.slice(start, end);

    assert.match(createSource, /const name = .*\.string \?\? ''/);
    assert.match(createSource, /if \(!name\.trim\(\)\)/);
    assert.match(createSource, /\{ clubName: name \}/);
    assert.doesNotMatch(createSource, /\\u4E00|\\u9FA5|只能输入中文/);
});

test('club name edit box has unrestricted character mode and length', () => {
    assert.match(source, /editBox\.inputMode = EditBox\.InputMode\.ANY/);
    assert.match(source, /editBox\.inputFlag = EditBox\.InputFlag\.DEFAULT/);
    assert.match(source, /editBox\.maxLength = -1/);
});
