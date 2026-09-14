import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import test from'node:test';
import{fileURLToPath}from'node:url';
const read=relative=>readFile(fileURLToPath(new URL(relative,import.meta.url)),'utf8');
const[registry,bindings,map]=await Promise.all([read('../../../assets/Games/Common/Code/Catalog/FamilyRuntimeRegistry.ts'),read('../../../assets/Games/Common/Code/Catalog/CatalogFamilyBindings.ts'),read('../../../../Server/work/audit/r04-authoritative-four-layer-map.json')]);
const catalog=JSON.parse(map);const families=[...new Set(catalog.items.map(item=>item.gameplayFamily).filter(family=>family!=='UNCLASSIFIED_MISSING_SOURCE'))];

test('all 15 core families have one shared intent adapter and snapshot contract',()=>{
  assert.equal(families.length,15);
  assert.equal((registry.match(/export class \w+FamilyAdapter extends FamilyGameplayAdapter/g)||[]).length,15);
  for(const family of families){assert.match(registry,new RegExp(`'${family.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));}
  for(const action of['state','reconnect','join','ready','start','act'])assert.match(registry,new RegExp(`${action}\\(`));
  assert.match(registry,/snapshot\.gameCode!==this\.binding\.code/);
  assert.match(registry,/snapshot\.stateVersion<this\.current\.stateVersion/);
  assert.doesNotMatch(registry,/canWin|isWinning|calculateScore|patternScore|settlement\s*\(/);
});

test('all catalog codes plus NJ201/LS201 bind once to their authoritative family and region config',()=>{
  const entries=[...bindings.matchAll(/\{code:"([^"]+)",family:"([^"]+)",regionConfig:"([^"]+)"\}/g)].map(match=>({code:match[1],family:match[2],regionConfig:match[3]}));
  assert.equal(entries.length,530);assert.equal(new Set(entries.map(entry=>entry.code)).size,530);
  const expected=new Map(catalog.items.map(item=>[item.code,{family:item.gameplayFamily,regionConfig:item.regionRuleConfig}]));
  expected.set('NJ201',{family:'poker:pao-de-kuai',regionConfig:'CONFIG:NJ201@sichuan/neijiang'});
  expected.set('LS201',{family:'poker:pao-de-kuai',regionConfig:'CONFIG:LS201@sichuan/liangshan'});
  for(const entry of entries)assert.deepEqual({family:entry.family,regionConfig:entry.regionConfig},expected.get(entry.code));
});

test('each family schema exposes generic action submission and authoritative snapshots',()=>{
  for(const family of families){const marker=`'${family}':{family:'${family}'`;assert.ok(registry.includes(marker),family);}
  assert.match(registry,/unsupported \$\{this\.schema\.family\} action/);
  assert.match(registry,/this\.schema\.phases\.includes\(snapshot\.phase\)/);
});
