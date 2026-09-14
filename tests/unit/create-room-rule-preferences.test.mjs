import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/typescript.js';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('rules use fixed document defaults and strictly project remembered values',()=>{
 const presenter=read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
 assert.match(presenter,/defaultCandidateIndexes/);
 assert.match(presenter,/remembered\?\.\[field\.key\]/);
 assert.match(presenter,/saved\.filter\(value => this\.hasEnabledOption/);
 assert.doesNotMatch(presenter,/Math\.random|selectDefaultCandidate|random/);
});

test('three-player PDK removes the two-player-only cut-deck option',()=>{
 const presenter=read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
 assert.match(presenter,/Number\(this\.values\.get\('playerCount'\)\) !== 3/);
 assert.match(presenter,/String\(value\) !== 'remove_three_four'/);
 assert.equal((presenter.match(/this\.reconcileDependencies\(\)/g)??[]).length,2);
 assert.doesNotMatch(presenter,/userAgent|navigator|ontouchstart|matchMedia/i);
});

test('preference scope isolates account, game, version and schema hash',()=>{
 const storage=read('assets/Common/Code/Runtime/core/Storage.ts');
 for(const token of ['identity.accountId','identity.gameId','identity.playVersion','identity.schemaHash']) assert.ok(storage.includes(token));
 assert.doesNotMatch(storage,/create-room.*localStorage|localStorage.*create-room/i);
});

test('unified storage restores only the exact local scope',()=>{
 const compiled=ts.transpileModule(read('assets/Common/Code/Runtime/core/Storage.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports,globalThis,JSON,Number,Error});
 const values=new Map();const storage={get:key=>values.get(key)??null,set:(key,value)=>values.set(key,value),remove:key=>values.delete(key)};
 const store=new module.exports.ScopedPreferenceStore(storage);
 const scope={accountId:'42',gameId:8,playVersion:'1.0.0',schemaHash:'a'.repeat(64)};
 store.save(scope,{roundCount:12});
 assert.deepEqual(store.load(scope),{roundCount:12});
 assert.equal(store.load({...scope,accountId:'43'}),null);
 assert.equal(store.load({...scope,gameId:629}),null);
 assert.equal(store.load({...scope,schemaHash:'b'.repeat(64)}),null);
});

test('controller saves after create succeeds and before scene handoff can dispose it',()=>{
 const source=read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
 const created=source.indexOf('await this.gateway.create');
 const save=source.indexOf('this.preferences.save');
 const handoff=source.indexOf('await this.onCreated');
 assert.ok(created>=0 && save>created && handoff>save);
 assert.match(source,/const submittedRules = \{ \.\.\.this\.presenter\.snapshot\(\), baseScore: this\.baseScore \}/);
 assert.match(source,/this\.preferences\.save\(preferenceIdentity, submittedRules\)/);
 assert.equal((source.match(/this\.preferences\.save/g)??[]).length,1);
});
