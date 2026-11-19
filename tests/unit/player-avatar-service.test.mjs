import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(join(clientRoot, 'assets/Common/Code/UI/PlayerAvatarService.ts'), 'utf8');

test('local avatar fallback is opt-in and stale loopback URLs do not create failed requests', () => {
  const base = source.slice(source.indexOf('function avatarBaseUrl'), source.indexOf('function avatarFileNumber'));
  assert.match(base, /avatarBaseUrl\?\.trim\(\)/);
  assert.doesNotMatch(base, /location\?\.hostname|http:\/\//);
  assert.match(source, /function unavailableImplicitLocalAvatar/);
  assert.match(source, /url\.port === String\(LOCAL_AVATAR_PORT\)/);
  assert.match(source, /preferred && !unavailableImplicitLocalAvatar\(preferred\)/);
});

import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
function realController() {
 const text=readFileSync(join(clientRoot,'assets/Lobby/Code/LobbyScreenController.ts'),'utf8');
 const output=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports);`,{module,require:()=>({}),console});
 return Object.create(module.exports.LobbyScreenController.prototype);
}
test('real headimg updates retain the latest nonempty preferred avatar across empty notifications',()=>{
 const controller=realController(),seen=[];
 controller.role={headImageUrl:'https://avatar.invalid/original.png'};
 controller.updateAvatar=(_root,url)=>seen.push(url);
 controller.applyPlayerChanged({}, {}, {property:'headimg',value:''});
 assert.equal(seen.at(-1),'https://avatar.invalid/original.png');
 controller.applyPlayerChanged({}, {}, {property:'headimg',value:'https://avatar.invalid/new.png'});
 assert.equal(controller.role.headImageUrl,'https://avatar.invalid/new.png');
 controller.applyPlayerChanged({}, {}, {property:'headimg',value:'   '});
 assert.equal(seen.at(-1),'https://avatar.invalid/new.png');
});

test('remote avatar failure reports one fixed diagnostic, preserves rejection and clears failed cache', async () => {
 const warnings=[],requests=[];
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const cc={assetManager:{loadRemote(url,_options,callback){requests.push(url);callback(new Error('PRIVATE_URL_TOKEN_PLAYER_QUERY'),null);}},ImageAsset:class{},Sprite:class{},SpriteFrame:class{},Texture2D:class{}};
 const context={module,require:()=>cc,URL,console:{warn:(...args)=>warnings.push(args)},__aoo_RUNTIME_CONFIG__:{avatarBaseUrl:'http://127.0.0.1:8765/'}};
 vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports);`,context);
 const service=module.exports.PlayerAvatarService;
 await assert.rejects(service.frame(98));
 await assert.rejects(service.frame(98));
 assert.equal(requests.length,2,'failed cached request must be removed without automatic retry');
 assert.deepEqual(warnings,[['[PlayerAvatarService] AVATAR_REMOTE_LOAD_FAILED']]);
 const sprite={node:{isValid:true},spriteFrame:'default'};
 assert.equal(await service.assign(sprite,99),false);
 assert.equal(sprite.spriteFrame,'default');
 assert.equal(warnings.length,1);
 assert.equal(JSON.stringify(warnings).includes('PRIVATE'),false);
 delete context.__aoo_RUNTIME_CONFIG__;
 await assert.rejects(service.frame(99));
 assert.equal(warnings.length,1,'unconfigured default must not add a warning');
});
