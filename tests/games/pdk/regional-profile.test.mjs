import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import test from'node:test';import{fileURLToPath}from'node:url';
const p=x=>fileURLToPath(new URL(x,import.meta.url));
const[nj,ls,registry,protocol,lsAdapter,runtime,switcher]=await Promise.all([
 readFile(p('../../../assets/Games/Poker/PDK/NJPDK/Code/NJ201RoomProfile.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/LSPDK/Code/LS201RoomProfile.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/Common/Code/Regional/PdkRegionalProfileRegistry.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/Common/Code/Regional/PdkRegionalProtocolAdapter.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/LSPDK/Code/LS201Adapter.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts'),'utf8'),
 readFile(p('../../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'),'utf8')]);
test('regional PDK profiles preserve independent identities and only reference common runtime',()=>{
 assert.match(nj,/gameId:629,gameCode:PDK_BUSINESS_CODES\.NEIJIANG/);assert.match(nj,/xqpArea:6,xqpGameType:5/);
 assert.match(ls,/gameId:90005,gameCode:PDK_BUSINESS_CODES\.LIANGSHAN/);assert.match(ls,/xqpArea:9,xqpGameType:5/);
 for(const source of[nj,ls]){assert.match(source,/family:'poker:pao-de-kuai'/);assert.match(source,/commonRuntime:'PDK\/Common'/);assert.doesNotMatch(source,/canBeat|recognize\(|settlement\(|currentSeat|stateVersion/);}
 assert.match(registry,/PDK_BUSINESS_CODES\.NEIJIANG\]:NJ201_PROFILE/);assert.match(registry,/PDK_BUSINESS_CODES\.LIANGSHAN\]:LS201_PROFILE/);
});
test('regional protocol uses gameCode-specific envelopes while delegating common state',()=>{
 assert.match(protocol,/poker\.\$\{this\.profile\.gameCode\}\.dispatch/);
 assert.match(protocol,/CommonPdkRuntime/);assert.doesNotMatch(protocol,/currentSeat|stateVersion|settlement\(/);
 assert.match(lsAdapter,/dispatch\('robDealer',\{compete\}/);
 assert.match(runtime,/`poker\.\$\{this\.options\.gameCode\}\.dispatch`/);
 assert.match(runtime,/poker\.\$\{this\.options\.gameCode\}\.state_push/);
 assert.match(switcher,/if \(!isPdkBusinessCode\(gameCode\)\)/);
 assert.match(switcher,/gameCode,/);
});
test('Liangshan published choices include all six JinHua values and XQP dependencies',()=>{
 assert.match(ls,/\[1,2,3,4,5,'no_compare'\]/);assert.match(ls,/dealCardCount:8/);
 assert.match(ls,/robDealerRule:'dealer_first'/);assert.match(ls,/compare_attachments/);
});
