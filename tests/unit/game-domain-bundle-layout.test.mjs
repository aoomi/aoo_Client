import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assets = new URL('../../assets/', import.meta.url);
const readMeta = (path) => JSON.parse(readFileSync(new URL(path, assets), 'utf8'));

const expected = new Map([
  ['Games/Common.meta', 'games-common'],
  ['Games/LongCard.meta', 'games-longcard'],
  ['Games/Mahjong.meta', 'games-mahjong'],
  ['Games/WordCard.meta', 'games-wordcard'],
  ['Games/Poker/Common.meta', 'poker-common'],
  ['Games/Poker/CX.meta', 'poker-cx'],
  ['Games/Poker/DDZ.meta', 'poker-ddz'],
  ['Games/Poker/GD.meta', 'poker-gd'],
  ['Games/Poker/NN.meta', 'poker-nn'],
  ['Games/Poker/SG.meta', 'poker-sg'],
  ['Games/Poker/SJ.meta', 'poker-sj'],
  ['Games/Poker/ZJH.meta', 'poker-zjh'],
]);

test('requested game domains are independent Creator bundles', () => {
  for (const [path, bundleName] of expected) {
    const data = readMeta(path);
    assert.equal(data.userData?.isBundle, true, path);
    assert.equal(data.userData?.bundleName, bundleName, path);
    assert.equal(data.userData?.priority, 1, path);
    assert.equal(data.userData?.bundleConfigID, 'default', path);
  }
});

test('Poker remains a non-bundle parent and requested names are unique', () => {
  assert.notEqual(readMeta('Games/Poker.meta').userData?.isBundle, true);
  assert.notEqual(readMeta('Games/Poker/PDK.meta').userData?.isBundle, true);
  for (const [path, bundleName] of [
    ['Games/Poker/PDK/Common.meta', 'paodekuai-common'],
    ['Games/Poker/PDK/DeskBg.meta', 'paodekuai-deskbg'],
    ['Games/Poker/PDK/LSPDK.meta', 'paodekuai-liangshan'],
    ['Games/Poker/PDK/NJPDK.meta', 'paodekuai-neijiang'],
  ]) {
    const data = readMeta(path);
    assert.equal(data.userData?.isBundle, true, path);
    assert.equal(data.userData?.bundleName, bundleName, path);
  }
  assert.equal(new Set(expected.values()).size, expected.size);
});
