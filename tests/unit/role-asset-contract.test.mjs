import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
function load(path, name) {
 const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})(require,module,module.exports);`,{module,require:()=>({}),console});
 return module.exports[name];
}
const Gateway=load('../../assets/Common/Code/Runtime/role/LegacyRoleGateway.ts','LegacyRoleGateway');
const Top=load('../../assets/Lobby/Code/LobbyTopBarController.ts','LobbyTopBarController');
test('role projection ignores conflicting legacy balances',()=>{
 const gateway=Object.create(Gateway.prototype),account={displayName:'fixture',headImageUrl:''};
 const role=gateway.toRoleSession({pid:7,roomCard:7,gold:11,diamond:99,crystal:88,clubCard:77},account);
 assert.equal(role.roomCard,7);assert.equal(role.gold,11);assert.equal(Object.hasOwn(role,'diamond'),false);
 const absent=gateway.toRoleSession({pid:7,gold:11,diamond:99,crystal:88},account);
 assert.equal(absent.roomCard,0);assert.equal(absent.gold,11);
});
test('top bar updates the two assets independently without retired aliases',()=>{
 const top=new Top({},{playerId:7,name:'fixture',roomCard:7,gold:11});
 top.setGold(23);assert.equal(top.getRoomCard(),7);assert.equal(top.getGold(),23);
 top.setRoomCard(31);assert.equal(top.getRoomCard(),31);assert.equal(top.getGold(),23);
 for(const key of ['getDiamond','setDiamond','getClubCard','setClubCard'])assert.equal(typeof top[key],'undefined');
});

const ClubEntry=load('../../assets/Lobby/Code/ClubList/LobbyClubEntryController.ts','LobbyClubEntryController');
test('club create consumes only explicit roomCard and never legacy diamond',async()=>{
 for(const packet of [{id:1,roomCard:7,diamond:99},{id:1,diamond:99}]) {
  const calls=[],entry=Object.create(ClubEntry.prototype);
  Object.assign(entry,{createPending:false,client:{request:async()=>packet},top:{setRoomCard:v=>calls.push(v)},forms:{show:async()=>{},close:()=>{}},mainNode:{emit:()=>{}},enterClub:async()=>true});
  const root={getChildByPath:()=>({getComponent:()=>({string:'fixture'})})};
  await entry.createClub(root);
  assert.deepEqual(calls,Object.hasOwn(packet,'roomCard')?[7]:[]);
 }
});
