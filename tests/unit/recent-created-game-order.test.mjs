import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Modules/CreateRoom/Code/PlaySelectorController.ts', import.meta.url),
    'utf8',
);

test('the most recently created game is account-scoped and rendered first', () => {
    assert.match(source, /lobby\.recent-created-game\.v1\.\$\{this\.accountId\}/);
    assert.match(source, /const orderedGames = this\.prioritizeRecentGame\(games, recentGameCode\)/);
    assert.match(source, /return recent \? \[recent, \.\.\.games\.filter\(game => game !== recent\)\] : \[\.\.\.games\]/);
    assert.match(source, /this\.renderGames\(orderedGames, selected\)/);
    assert.match(source, /this\.saveRecentGameCode\(selectedGame\.gameCode\)/);
});

test('an explicit entry remains selected while recent ordering is preserved', () => {
    const explicit = source.indexOf('this.findGame(orderedGames, preselect)');
    const recent = source.indexOf('this.findGame(orderedGames, recentGameCode)');
    const fallback = source.indexOf("orderedGames.find(game => game.gameCode === 'CD201')");
    assert.ok(explicit >= 0 && recent > explicit && fallback > recent);
});
