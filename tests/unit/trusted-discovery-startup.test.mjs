import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

// Executed component methods with controlled Cocos/version/service adapters.
// These are module sequencing checks, not browser/signature/storage/business E2E.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
}, reportDiagnostics: true });
assert.equal((output.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const canonicalOutput = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/config/TrustedConfigurationDiscovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const canonicalModule = { exports: {} };
vm.runInNewContext(`(function(module,exports){${canonicalOutput}\n})(module,module.exports)`, { module: canonicalModule });
const canonical = canonicalModule.exports.canonicalDiscoveryJson;
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const provision = (environment='production') => ({ schemaVersion:1, environment, issuer:'fixture-only', issuerNamespace:'fixture-only',
    clientVersion:'1.2.3', sources:[{url:'https://a.fixture.invalid/discovery',failureDomain:'fixture-a'},{url:'https://b.fixture.invalid/discovery',failureDomain:'fixture-b'}],
    anchors:[], timeoutMs:100, maximumBytes:256, totalResponseBytes:1024 });
function harness(options={}) {
    const events=[]; const errors=[];
    let existing=options.live ?? null;
    const initial={apiBaseUrl:'https://old.fixture.invalid/',bootstrapToken:'synthetic-test-capability',deviceId:'fixture-device',clientChannel:'fixture-channel',environment:'production'};
    const sandbox={ console:{debug(){},info(){},warn(){},error(){}}, setTimeout,clearTimeout,TextDecoder,TextEncoder,URL,AbortController,
        crypto:{subtle:{},randomUUID:()=> 'fixture-boot'}, indexedDB:{open(){}}, location:{host:'fixture.invalid'},
        __aoo_RUNTIME_CONFIG__:initial, __aoo_TRUSTED_DISCOVERY__: options.input === false ? undefined : options.input ?? provision(options.testEnvironment?'test':'production') };
    const bootState={resolveLaunchSelection:()=>({isTestEnvironment:!!options.testEnvironment,isClearLocalData:false,gatewayAddresses:[]}),
        claimAutomaticRestoreReset:()=>false,noteEntrySceneClearIntent(){} };
    const services={auth:{beginBootWithoutLocalDataClear(){},blockAutomaticRestore(){}},scenes:{resetSession(){},recoverBootstrapTarget:async()=> 'NAVIGATED'}};
    class Component { constructor(){this.isValid=true;this.node={uuid:'fixture-node',name:'Canvas',isValid:true,getChildByName:()=>null};} }
    const decorator=()=>()=>{};
    const cc={Component,_decorator:{ccclass:decorator,property:decorator},view:{setDesignResolutionSize(){}},ResolutionPolicy:{FIXED_HEIGHT:1},sys:{isBrowser:options.browser!==false,localStorage:{getItem:()=>null}},Node:class{}};
    for(const key of ['assetManager','Button','BlockInputEvents','CCString','Color','director','EditBox','Label','LabelOutline','ProgressBar','RichText','Toggle','UITransform']) cc[key]??=class{};
    cc.director={getScene:()=>({name:'BootStrap'})};
    class Store { constructor(){events.push('store:new');if(options.storeError)throw new Error('STORE_REJECT');} close(){events.push('store:close');} }
    const deps={
        cc,
        './ClientBootstrap':{getStartedClientServices:()=>existing,startClientServices:()=>{events.push('services');existing=services;return services;}},
        './LoadingEnvironmentPolicy':{currentAooLoadingBootState:()=>bootState,applyLoadingEnvironment:async(_selection,config)=>{
            events.push('apply'); if(options.apply)await options.apply(config,sandbox);
            return {runtimeConfig:{...config,environment:options.testEnvironment?'test':'production'},environment:options.testEnvironment?'test':'production',bootId:'fixture-boot',selectedGateway:null,cleanupRanThisCall:false,cleanupFailures:[],cleanup:{failures:[],removedLocalStorageKeys:0,removedSessionStorageKeys:0,deletedIndexedDatabases:0,deletedCacheStores:0},autoRestoreBlocked:false};}},
        '../../../Common/Code/Runtime/bootstrap/BootstrapRuntime':{bootstrapRuntime:{initialize:async()=>{events.push('initialize');events.push(sandbox.__aoo_RUNTIME_CONFIG__.apiBaseUrl);if(options.initialize)await options.initialize();return options.decision??{status:'OK'};}}},
        '../../../Common/Code/Runtime/platform/LegacyPlatformRuntime':{legacyPlatformRuntime:{audio:{attach(){}}}},
        '../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator':{presentationTransition:{}},
        '../../../Common/Code/Runtime/config/IndexedDbDiscoveryStateStore':{IndexedDbDiscoveryStateStore:Store},
        '../../../Common/Code/Runtime/config/TrustedConfigurationDiscovery':{canonicalDiscoveryJson:canonical,resolveVerifiedDiscovery:async deps=>{
            events.push('discovery');if(options.discovery)await options.discovery(deps,sandbox);
            if(options.discoveryError)throw new Error('TRUSTED_DISCOVERY_REJECTED');
            return {runtimeConfig:{apiBaseUrl:'https://verified.fixture.invalid/',clientVersion:deps.clientVersion,resourceVersion:'artifact-fixture',bootstrapToken:'must-not-install',environment:'test'}};}},
    };
    for(const key of ['../Auth/LoginView','../Auth/AooWeChatLoginController','../../../Common/Code/Runtime/ui/LegacyFormManager','../../../Common/Code/Runtime/ui/MsgDriftLifecycle','../../../Startup/Code/StartupPresentationView'])deps[key]={};
    const module={exports:{}};sandbox.module=module;sandbox.require=key=>{assert.ok(key in deps,`unexpected import ${key}`);return deps[key];};
    vm.runInNewContext(`(function(require,module,exports){${output.outputText}\n})(require,module,module.exports)`,sandbox);
    const component=new module.exports.LoginScreenBootstrap();
    component.setBootstrapStatus=()=>{};component.showBootstrapBlock=message=>errors.push(message);component.releasePersistentBootCover=()=>{};
    return {component,sandbox,events,errors,initial,services,run:()=>component.start()};
}
const blocked=h=>{assert.equal(h.events.includes('initialize'),false);assert.equal(h.events.includes('services'),false);assert.ok(h.errors.length);};
test('verified selection executes before version and services; only three fields install',async()=>{const h=harness();await h.run();assert.ok(h.events.indexOf('discovery')<h.events.indexOf('initialize'));assert.ok(h.events.indexOf('initialize')<h.events.indexOf('services'));assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.apiBaseUrl,'https://verified.fixture.invalid/');assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.clientVersion,'1.2.3');assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.resourceVersion,'artifact-fixture');assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.bootstrapToken,h.initial.bootstrapToken);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.deviceId,h.initial.deviceId);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.environment,'production');assert.equal(h.events.filter(e=>e==='store:close').length,1);});
test('production missing input blocks before environment writes',async()=>{const h=harness({input:false});await h.run();blocked(h);assert.equal(h.events.includes('apply'),false);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__,h.initial);});
test('only explicit test with completely absent input keeps preview',async()=>{const h=harness({testEnvironment:true,input:false});await h.run();assert.ok(h.events.includes('initialize'));assert.ok(h.events.includes('services'));assert.equal(h.events.includes('discovery'),false);});
test('present null and malformed test provision never become absent preview',async()=>{for(const input of [null,{}, {...provision('test'),maximumBytes:Infinity}]){const h=harness({testEnvironment:true});h.sandbox.__aoo_TRUSTED_DISCOVERY__=input;await h.run();blocked(h);}});
test('environment mismatch blocks without production to test downgrade',async()=>{const h=harness({input:provision('test')});await h.run();blocked(h);});
test('present test signature or compatibility rejection never falls back',async()=>{const h=harness({testEnvironment:true,discoveryError:true});await h.run();blocked(h);assert.equal(h.events.filter(e=>e==='store:close').length,1);});
test('production resolver rejection blocks version and services',async()=>{const h=harness({discoveryError:true});await h.run();blocked(h);});
test('native store construction failure blocks without substitute',async()=>{const h=harness({storeError:true});await h.run();blocked(h);});
test('unavailable browser platform blocks before store and version',async()=>{const h=harness({browser:false});await h.run();blocked(h);assert.equal(h.events.includes('store:new'),false);});
test('canceled discovery cannot install endpoint or initialize',async()=>{const wait=deferred();const entered=deferred();const h=harness({discovery:async()=>{entered.resolve();await wait.promise;}});const run=h.run();await entered.promise;h.component.onDestroy();wait.resolve();await run;assert.equal(h.events.includes('initialize'),false);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.apiBaseUrl,h.initial.apiBaseUrl);assert.ok(h.events.includes('store:close'));});
test('changed boot ownership cannot install late config',async()=>{const h=harness({discovery:async(_deps,s)=>{s.__aoo_BOOTSTRAP_ROUTE_OWNER__={bootId:'another-boot',nodeUuid:'other'};}});await h.run();assert.equal(h.events.includes('initialize'),false);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.apiBaseUrl,h.initial.apiBaseUrl);});
test('duplicate boot during discovery is discarded and initializes only once',async()=>{const wait=deferred();const entered=deferred();const h=harness({discovery:async()=>{entered.resolve();await wait.promise;}});const first=h.run();await entered.promise;const duplicate=new h.component.constructor();duplicate.node={...h.component.node,uuid:'duplicate'};duplicate.setBootstrapStatus=()=>{};duplicate.showBootstrapBlock=()=>{};await duplicate.start();wait.resolve();await first;assert.equal(h.events.filter(e=>e==='initialize').length,1);assert.equal(h.events.filter(e=>e==='services').length,1);});
test('live services guard precedes apply and leaves existing config unchanged',async()=>{const h=harness({live:{}});await h.run();blocked(h);assert.equal(h.events.includes('apply'),false);assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__,h.initial);});
test('canceled environment wait never overwrites global config',async()=>{const wait=deferred();const entered=deferred();const h=harness({apply:async()=>{entered.resolve();await wait.promise;}});const run=h.run();await entered.promise;h.component.onDestroy();wait.resolve();await run;assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__,h.initial);assert.equal(h.events.includes('discovery'),false);});
test('input and runtime config snapshot survive caller mutation during loading await',async()=>{let observed;const h=harness({apply:async(_config,s)=>{s.__aoo_TRUSTED_DISCOVERY__.clientVersion='9.9.9';s.__aoo_RUNTIME_CONFIG__.deviceId='changed';},discovery:async deps=>{observed=deps.clientVersion;}});await h.run();assert.equal(observed,'1.2.3');assert.equal(h.sandbox.__aoo_RUNTIME_CONFIG__.deviceId,'fixture-device');});
test('maintenance and force update preserve existing services stop',async()=>{for(const decision of [{status:'MAINTENANCE'},{status:'FORCE_UPDATE'},{status:'OK',forceUpdate:true}]){const h=harness({decision});await h.run();assert.ok(h.events.includes('initialize'));assert.equal(h.events.includes('services'),false);assert.ok(h.errors.length);}});
test('canceled version await cannot start services',async()=>{const wait=deferred();const entered=deferred();const h=harness({initialize:async()=>{entered.resolve();await wait.promise;}});const run=h.run();await entered.promise;h.component.onDestroy();wait.resolve();await run;assert.equal(h.events.includes('services'),false);});
test('actual transport method omits credentials/rejects redirects and enforces shared aggregate byte cap',async()=>{const h=harness();const calls=[];h.sandbox.fetch=async(url,init)=>{calls.push({url,init});return new Response(canonical({configuration:'abc'}));};const signal=new AbortController().signal;const p=provision();const budget={bytes:0};const reply=await h.component.fetchDiscoveryReply(p.sources[0],signal,p,budget);assert.equal(reply.configuration,'abc');assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.signal,signal);const limit=budget.bytes;await assert.rejects(h.component.fetchDiscoveryReply(p.sources[1],signal,{...p,totalResponseBytes:limit},budget),/RESPONSE_TOO_LARGE/);});
test('actual transport rejects oversized envelope, invalid outer fields, absent stream and pre-abort',async()=>{const h=harness();const p=provision();const signal=new AbortController().signal;for(const body of [canonical({configuration:'x'.repeat(257)}),canonical({configuration:'abc',extra:'x'}),'{"configuration":"a","configuration":"b"}']){h.sandbox.fetch=async()=>new Response(body);await assert.rejects(h.component.fetchDiscoveryReply(p.sources[0],signal,p,{bytes:0}));}h.sandbox.fetch=async()=>new Response(null);await assert.rejects(h.component.fetchDiscoveryReply(p.sources[0],signal,p,{bytes:0}));const controller=new AbortController();controller.abort();h.sandbox.fetch=async()=>new Response(canonical({configuration:'abc'}));await assert.rejects(h.component.fetchDiscoveryReply(p.sources[0],controller.signal,p,{bytes:0}),/ABORTED/);});
