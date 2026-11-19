import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/lib/typescript.js';

function compile(relative){return ts.transpileModule(fs.readFileSync(new URL(relative,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
function run(code,require,globals={}){const module={exports:{}};const sandbox={module,exports:module.exports,require,URL,AbortController,setTimeout,clearTimeout,console,...globals};vm.createContext(sandbox);new vm.Script(code).runInContext(sandbox);return module.exports;}

test('remote runtime has no private token while LAN preview retains local token',()=>{
  let preview='http://localhost:8080';
  const policy={gatewayOrigin:value=>new URL(value),httpGatewayUrl:(p,b)=>new URL(p,b).toString(),webSocketGatewayUrl:()=>'',testPreviewGatewayOrigin:()=>preview};
  const api=run(compile('../../assets/Common/Code/Runtime/config/RuntimeEndpoints.ts'),()=>policy,{globalThis:{location:{href:'http://localhost:7456',origin:'http://localhost:7456'},__aoo_RUNTIME_CONFIG__:{environment:'test',apiBaseUrl:'https://test.example'},crypto:{randomUUID:()=> 'device-1'}}});
  const remote=api.resolveRuntimeEndpoints();
  assert.equal(remote.apiBaseUrl,'https://test.example/');
  assert.equal(remote.bootstrapToken,'');
  const lan=run(compile('../../assets/Common/Code/Runtime/config/RuntimeEndpoints.ts'),()=>policy,{globalThis:{__aoo_RUNTIME_CONFIG__:{environment:'test'},crypto:{randomUUID:()=> 'device-2'}}});
  assert.equal(lan.resolveRuntimeEndpoints().apiBaseUrl,'http://localhost:8080/');
  assert.equal(lan.resolveRuntimeEndpoints().bootstrapToken,'local-version-bootstrap-token-32-bytes');
});

test('bootstrap request omits empty token and carries device id',async()=>{
  let init;
  const api=run(compile('../../assets/Common/Code/Runtime/bootstrap/BootstrapGateway.ts'),id=>{
    if(id==='cc')return{sys:{os:'web',OS:{ANDROID:'android',IOS:'ios'}}};
    if(id.includes('GatewayEntryPolicy'))return{API_VERSION:'1',API_VERSION_HEADER:'X-Aoo-Api-Version',httpGatewayUrl:(p,b)=>new URL(p,b).toString()};
    if(id.includes('ProtocolHttpClient'))return{ProtocolHttpClient:{fetch:async(_url,value)=>{init=value;return{ok:true,json:async()=>({code:'OK',data:{directory:{},featureFlags:[]}})}}}};
    return{};
  },{globalThis:{setTimeout,clearTimeout}});
  await new api.BootstrapGateway({apiBaseUrl:'https://test.example',bootstrapToken:'',deviceId:'device-9',clientChannel:'stable',clientVersion:'1',resourceVersion:'1'}).resolve(null);
  assert.equal(init.headers['X-Device-Id'],'device-9');
  assert.equal(Object.hasOwn(init.headers,'Authorization'),false);
});
