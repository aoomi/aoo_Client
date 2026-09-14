import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('club and alliance vocabulary is canonical on all three application surfaces', () => {
    const client = read('assets/Club/Code/Runtime/ClubBusinessVocabulary.ts');
    const admin = read('../Admin/src/config/clubBusinessVocabulary.ts');
    const server = read('../Server/server/LegacyCommDef/src/jsproto/c2s/cclass/union/AllianceBusinessTerms.java');
    for (const term of ['联盟', '盟主', '圈主', '盟友', '联盟管理', '圈管理', '合伙人', '队长', '成员']) {
        assert.match(client, new RegExp(term));
        assert.match(admin, new RegExp(term));
        assert.match(server, new RegExp(term));
    }
});

test('legacy numeric role contracts remain stable', () => {
    const client = read('assets/Club/Code/Runtime/ClubBusinessVocabulary.ts');
    const server = read('../Server/server/LegacyCommDef/src/jsproto/c2s/cclass/union/UnionDefine.java');
    assert.match(client, /Member = 0[\s\S]*Ally = 1[\s\S]*AllianceManager = 2[\s\S]*AllianceOwner = 3/);
    assert.match(server, /AllianceOwner = UNION_CREATE/);
    assert.match(server, /AllianceManager = UNION_MANAGE/);
    assert.match(server, /Ally = UNION_CLUB/);
    assert.match(server, /Member = UNION_GENERAL/);
});

test('club runtime uses new display terms and leaves compatibility aliases centralized', () => {
    const runtimeFiles = [
        'LegacyUnionCreateController.ts',
        'LegacyUnionInviteController.ts',
        'LegacyUnionManagerController.ts',
        'LegacyJoinUnionController.ts',
        'LegacyUnionInfoPopupController.ts',
        'LegacyClubPromotionController.ts',
    ];
    for (const file of runtimeFiles) {
        const source = read(`assets/Club/Code/Runtime/${file}`);
        assert.doesNotMatch(source, /赛事|推广员/);
    }
    assert.match(read('assets/Modules/Tournament/Code/CompetitionController.ts'), /赛事/);
});

test('club and alliance UI no longer display the generic creator title', () => {
    const sources = [
        'assets/Club/Code/Runtime/ClubBusinessVocabulary.ts',
        'assets/Club/Code/Runtime/LegacyUnionZhongzhiManagerController.ts',
        'assets/Club/Code/Runtime/LegacyUnionInviteController.ts',
        'assets/Club/Code/Runtime/LegacyUnionManagerController.ts',
        'assets/Club/Code/Runtime/LegacyClubMainController.ts',
        'assets/Club/Code/Runtime/LegacyClubMemberController.ts',
        'assets/Lobby/Code/ClubList/LobbyClubListController.ts',
        'assets/Club/Prefab/ClubPromoterSet.prefab',
        'assets/Club/Prefab/Skin2UnionManager2.prefab',
        'assets/Club/Prefab/UnionManager.prefab',
    ].map(read);
    for (const source of sources) assert.doesNotMatch(source, /创建者/);
    assert.match(sources.join('\n'), /盟主/);
    assert.match(sources.join('\n'), /圈主/);
});
