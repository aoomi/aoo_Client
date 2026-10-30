import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');
const bindings = read('assets/Games/Common/Code/Catalog/CatalogFamilyBindings.ts');
const families = read('assets/Games/Common/Code/Catalog/FamilyRuntimeRegistry.ts');
const settlement = read('assets/Games/Common/Code/Settlement/SettlementAssetService.ts');
const selector = read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');

const migrated = ['byzp', 'xpphz', 'ahphz', 'glzp', 'yzchz', 'ycsdr', 'ychp', 'bzp', 'lczp', 'pxphz'];

test('current catalog projects all historical WordCard identities through LongCard', () => {
  for (const code of migrated) {
    assert.match(bindings, new RegExp(`\\{code:"${code}",family:"long-card:pao-hu-zi"`));
    assert.doesNotMatch(bindings, new RegExp(`\\{code:"${code}",family:"word-card:`));
  }
  assert.equal((bindings.match(/category:"WORD_CARD"/g) ?? []).length, 0);
});

test('historical WordCard is explicit Compatibility only', () => {
  assert.match(families, /HistoricalCompatibilityFamilyId='word-card:pao-hu-zi'/);
  assert.match(families, /COMPATIBILITY_FAMILY_RUNTIME_SCHEMAS/);
  assert.match(families, /'long-card:pao-hu-zi':\{family:'long-card:pao-hu-zi',routePrefix:'longcard'/);
  assert.doesNotMatch(families, /'word-card:pao-hu-zi':\{family:'word-card:pao-hu-zi',routePrefix:'wordcard'/);
});

test('settlement and room creation normalize historical category without changing user flow', () => {
  assert.match(settlement, /canonical\.startsWith\('word-card:'\)\) return 'LongCard'/);
  assert.match(selector, /category === 'WORD_CARD'\) return 'LONG_CARD'/);
  assert.match(selector, /family\.startsWith\('word-card:'\)\) return 'LONG_CARD'/);
});
