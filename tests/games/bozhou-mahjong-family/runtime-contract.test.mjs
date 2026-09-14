import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import test from'node:test';
import{fileURLToPath}from'node:url';

const source=relative=>readFile(fileURLToPath(new URL(relative,import.meta.url)),'utf8');
const[family,bz,bzqz]=await Promise.all([
  source('../../../assets/Games/Mahjong/Common/Code/BozhouMahjongFamilyAdapter.ts'),
  source('../../../assets/Games/Mahjong/Common/Code/BzmjGameplayAdapter.ts'),
  source('../../../assets/Games/Mahjong/Common/Code/BzqzmjGameplayAdapter.ts')
]);

test('Bozhou family owns the nine-stage transport and action schema once',()=>{
  assert.match(family,/BOZHOU_MAHJONG_REGISTRY=\{bzmj:\{code:'bzmj',version:'bzmj-native-1'\},bzqzmj:\{code:'bzqzmj',version:'bzqzmj-native-1'\}\}/);
  for(const action of['state','reconnect','join','ready','start','draw','discard','chi','peng','gang','hu','pass'])assert.match(family,new RegExp(`${action}\\(`));
  for(const phase of['LOBBY','WAITING_EX','PLAYING','SETTLED'])assert.match(family,new RegExp(`'${phase}'`));
  for(const thin of[bz,bzqz]){
    assert.match(thin,/extends BozhouMahjongFamilyAdapter/);
    assert.doesNotMatch(thin,/private sequence|private current|connect\(|disconnect\(|reconnect\(|discard\(|peng\(|gang\(|hu\(|pass\(/);
    assert.doesNotMatch(thin,/canWin|patternScore|estimatedPoints|settlement/);
  }
});

test('BZ and BZQZ bindings retain their distinct immutable config matrix',()=>{
  assert.match(bz,/BzmjOption='ZhangZhuang'\|'QueMen'\|'LingFeng'/);
  assert.match(bz,/zhangzhuang:0\|1\|2/);
  assert.match(bz,/code:'bzmj',version:'bzmj-native-1'/);
  assert.match(bz,/wildcard===47&&v\.wallReserve===14/);
  assert.match(bzqz,/BzqzmjOption=0\|1\|2\|3\|4/);
  assert.match(bzqz,/zhangzhuang:-1\|0\|1\|2/);
  assert.match(bzqz,/rise&&rules\.zhangzhuang<0\|\|!rise&&rules\.zhangzhuang!==-1/);
  assert.match(bzqz,/code:'bzqzmj',version:'bzqzmj-native-1'/);
  assert.match(bzqz,/wildcard===47&&v\.wallReserve===14&&Array\.isArray\(v\.baoTing\)/);
  assert.match(bzqz,/baoTing\(seatId:number\)/);
});
