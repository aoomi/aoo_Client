import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const presenter = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkFloatingPointsPresenter.ts',
  import.meta.url,
), 'utf8');
const controller = readFileSync(new URL(
  '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts',
  import.meta.url,
), 'utf8');

test('round result uses the authored common GoldIcon and public ResultEffect', () => {
  assert.match(presenter, /const GOLD_BUNDLE = 'games-common'/);
  assert.match(presenter, /const GOLD_ASSET = 'Atlas\/GameCommon\/GoldIcon'/);
  assert.match(presenter, /const ROOT_PATH = 'RoomCommon\/FloatingPoints'/);
  assert.match(presenter, /`\$\{ROOT_PATH\}\/ResultEffect`/);
});

test('gold travels from each loser head to the authoritative winner head', () => {
  assert.match(presenter, /point < 0 && goldFrame && winnerHead/);
  assert.match(presenter, /convertToNodeSpaceAR\(loserHead\.worldPosition\)/);
  assert.match(presenter, /convertToNodeSpaceAR\(winnerHead\.worldPosition\)/);
  assert.match(presenter, /const baseMultiples = Math\.floor\(Math\.abs\(point\) \/ baseScore\)/);
  assert.match(presenter, /Math\.min\(MAX_GOLD_COUNT, Math\.max\(1, baseMultiples\)\)/);
  assert.match(presenter, /const MAX_GOLD_COUNT = 10/);
  assert.match(presenter, /const GOLD_HEAD_SCATTER_SIZE = 80/);
  assert.match(presenter, /const GOLD_MAX_GAP = 1/);
  assert.match(presenter, /private dispersedHeadOffsets\(count: number\): Vec3\[\]/);
  assert.match(presenter, /\(GOLD_WIDTH \+ GOLD_MAX_GAP\) \/ 2/);
  assert.match(presenter, /\(GOLD_HEIGHT \+ GOLD_MAX_GAP\) \/ 2/);
  assert.match(presenter, /Vec3\.distance\(offset, candidate\) >= 4/);
  assert.match(presenter, /Math\.random\(\) \* halfX \* 2 - halfX/);
  assert.match(presenter, /Math\.random\(\) \* halfY \* 2 - halfY/);
  assert.match(presenter, /coin\.setPosition\(start\.x \+ startScatter\.x, start\.y \+ startScatter\.y, 1\)/);
  assert.doesNotMatch(presenter, /GOLD_SORT_SECONDS|GOLD_SORT_SPACING|sortedStart/);
  assert.match(presenter, /const GOLD_ARRIVAL_HOLD_SECONDS = 0\.2/);
  assert.match(presenter, /const GOLD_FADE_SECONDS = 0\.3/);
  assert.match(presenter, /\.to\(GOLD_FLIGHT_SECONDS \/ 2,[\s\S]*easing: 'quadIn'/);
  assert.match(presenter, /\.to\(GOLD_FLIGHT_SECONDS \/ 2,[\s\S]*easing: 'quadOut'/);
  assert.match(presenter, /target\.x \+ startScatter\.x/);
  assert.match(presenter, /target\.y \+ startScatter\.y/);
  assert.doesNotMatch(presenter, /arrivalScatter|GOLD_STAGGER_SECONDS/);
  assert.match(presenter, /\.delay\(GOLD_ARRIVAL_HOLD_SECONDS\)/);
  assert.match(presenter, /\.to\(GOLD_FADE_SECONDS, \{ opacity: 0 \}, \{ easing: 'quadOut' \}\)/);
});

test('settlement injects the authoritative room base score and tracks the animation', () => {
  assert.match(controller, /packet\.baseScore \?\? ruleOptions\.baseScore \?\? config\.baseScore \?\? 1/);
  assert.match(controller, /this\.trackPresentation\(settlementEffect\)/);
  assert.match(presenter, /baseScore, winnerSeat, goldCounts/);
});

test('gold settlement is consumed only after its async asset is ready to render', () => {
  const awaitAsset = presenter.indexOf('await this.loadGoldFrame()');
  const commit = presenter.indexOf('this.lastSettlementKey = key', awaitAsset);
  assert.ok(awaitAsset >= 0 && commit > awaitAsset);
  assert.match(presenter, /key === this\.lastSettlementKey \|\| key === this\.pendingSettlementKey/);
  assert.match(presenter, /if \(generation !== this\.generation \|\| !this\.root\.isValid\)[\s\S]*pendingSettlementKey === key/);
  assert.match(presenter, /stage: 'CANCELLED_BEFORE_RENDER'/);
  assert.match(presenter, /constructor\(private readonly root: Node\)[\s\S]*this\.loadGoldFrame\(\)/);
});

test('gold count follows authoritative base-score multiples and caps at ten', () => {
  const body = presenter.match(/private goldCount\(point: number, baseScore: number\): number \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(body);
  const count = new Function('point', 'baseScore', 'MAX_GOLD_COUNT', body);
  assert.equal(count(-5, 5, 10), 1);
  assert.equal(count(-10, 5, 10), 2);
  assert.equal(count(-45, 5, 10), 9);
  assert.equal(count(-50, 5, 10), 10);
  assert.equal(count(-80, 5, 10), 10);
});
