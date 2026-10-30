import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';
const sourceUrl=new URL('../../assets/Common/Code/Runtime/config/TrustedConfigurationDiscovery.ts',import.meta.url);
const source=await readFile(sourceUrl,'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {resolveVerifiedDiscovery:resolve,canonicalDiscoveryJson:canon}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const CONFIG='aoo-runtime-discovery',TRUST='aoo-discovery-trust';
const NOW=1800000000000;
async function fixtureKey(id,purposes=[CONFIG,TRUST]){
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
 return {pair,anchor:{keyId:id,issuer:'fixture-issuer',purposes,notBefore:NOW-100,expiresAt:NOW+100000,publicKey:{kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y}}};
}
const root=await fixtureKey('fixture-root'),next=await fixtureKey('fixture-next');
function payload(changes={}){return {issuer:'fixture-issuer',purpose:CONFIG,version:1,issuedAt:NOW-10,notBefore:NOW-5,expiresAt:NOW+1000,minClientVersion:'1.0.0',maxClientVersion:'2.0.0',artifactVersion:'artifact-new',gatewayEndpoints:[{apiBaseUrl:'https://gateway.fixture.test/',webSocketUrl:'wss://gateway.fixture.test/api/v2/gateway/ws',priority:1}],resourceEndpoints:[{url:'https://resources.fixture.test/v1/',priority:1}],standbySites:[{url:'https://standby.fixture.test/',priority:1}],...changes};}
function fixtureCanonical(value){
 if(Array.isArray(value))return '['+value.map(fixtureCanonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+fixtureCanonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
async function sign(p,k=root){const unsigned={schemaVersion:1,keyId:k.anchor.keyId,payload:p};const sig=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k.pair.privateKey,new TextEncoder().encode(fixtureCanonical(unsigned)));return fixtureCanonical({...unsigned,signature:Buffer.from(sig).toString('base64url')});}
function fixture(replies,changes={}){
 let state;let reads=0,commits=0;
 const deps={sources:[{url:'https://discovery-a.fixture.test/config',failureDomain:'fixture-domain-a'},{url:'https://discovery-b.fixture.test/config',failureDomain:'fixture-domain-b'}],anchors:[root.anchor],issuer:'fixture-issuer',clientVersion:'1.2.0',now:()=>NOW,crypto:webcrypto,timeoutMs:20,maximumBytes:65536,transport:async s=>{const reply=replies[deps.sources.findIndex(x=>x===s)];if(reply instanceof Error)throw reply;return reply;},store:{read:async()=>{reads++;return state===undefined?undefined:structuredClone(state);},compareAndSwap:async(expected,value)=>{if(expected!==state?.revision)return false;state=structuredClone(value);commits++;return true;}},...changes};
 return {deps,get state(){return state;},set state(v){state=v;},get commits(){return commits;},get reads(){return reads;},replies};
}
async function rejected(raw,options={}){const f=fixture([{configuration:raw},{configuration:raw}],options);await assert.rejects(resolve(f.deps));assert.equal(f.commits,0);}
function trust(changes={}){return {issuer:'fixture-issuer',purpose:TRUST,trustVersion:1,issuedAt:NOW-10,notBefore:NOW-5,expiresAt:NOW+1000,keys:[root.anchor,next.anchor],revokedKeyIds:[],...changes};}

test('actual new source valid signature, ranked unified gateway and exact public fields',async()=>{const f=fixture([{configuration:await sign(payload({gatewayEndpoints:[...payload().gatewayEndpoints,{apiBaseUrl:'https://preferred.fixture.test/',webSocketUrl:'wss://preferred.fixture.test/api/v2/gateway/ws',priority:0}]}))},new Error('fixture unavailable')]);const result=await resolve(f.deps);assert.equal(result.runtimeConfig.apiBaseUrl,'https://preferred.fixture.test/');assert.deepEqual(Object.keys(result.runtimeConfig).sort(),['apiBaseUrl','clientVersion','resourceVersion']);assert.equal(result.provenance,'remote');assert.equal(f.state.highestConfigVersion,1);});
test('signed bytes/header/key and duplicate or noncanonical JSON reject',async()=>{const raw=await sign(payload());const parsed=JSON.parse(raw);parsed.payload.artifactVersion='tampered';await rejected(canon(parsed));parsed.keyId=next.anchor.keyId;await rejected(canon(parsed));await rejected(' '+raw);await rejected(raw.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'));parsed.signature='A'.repeat(86);await rejected(canon(parsed));});
test('issuer, purpose, schema, unknown and private key injection reject without store changes',async()=>{for(const change of [{issuer:'foreign'},{purpose:TRUST},{unexpected:'extra'},{version:1.5},{version:-1},{artifactVersion:''}])await rejected(await sign(payload(change)));const badAnchor=structuredClone(root.anchor);badAnchor.publicKey.d='private';await rejected(await sign(payload()),{anchors:[badAnchor]});});
test('time boundaries and signer lifetime reject; lower boundary is inclusive',async()=>{for(const change of [{notBefore:NOW+1},{expiresAt:NOW},{issuedAt:NOW+1},{expiresAt:NOW-1}])await rejected(await sign(payload(change)));const raw=await sign(payload({notBefore:NOW}));assert.equal((await resolve(fixture([{configuration:raw},{configuration:raw}]).deps)).version,1);await rejected(raw,{anchors:[{...root.anchor,expiresAt:NOW}]});});
test('canonical semantic compatibility bounds and unified public HTTPS/WSS only',async()=>{for(const change of [{minClientVersion:'1.3.0'},{maxClientVersion:'1.1.0'},{minClientVersion:'01.0.0'},{gatewayEndpoints:[{apiBaseUrl:'https://10.0.0.1/',webSocketUrl:'wss://10.0.0.1/api/v2/gateway/ws',priority:0}]},{gatewayEndpoints:[{apiBaseUrl:'https://gateway.fixture.test/',webSocketUrl:'wss://other.fixture.test/api/v2/gateway/ws',priority:0}]},{resourceEndpoints:[{url:'https://resources.fixture.test/?token=secret',priority:0}]}])await rejected(await sign(payload(change)));});
test('persistent floor, equal signed content, higher-version rollback to old artifact',async()=>{const f=fixture([{configuration:await sign(payload({version:4}))},new Error('down')]);await resolve(f.deps);f.replies[0]={configuration:await sign(payload({version:3}))};assert.equal((await resolve(f.deps)).provenance,'verified-cache');assert.equal(f.state.highestConfigVersion,4);f.replies[0]={configuration:await sign(payload({version:4}))};assert.equal((await resolve(f.deps)).provenance,'remote');f.replies[0]={configuration:await sign(payload({version:5,artifactVersion:'artifact-old-safe'}))};assert.equal((await resolve(f.deps)).runtimeConfig.resourceVersion,'artifact-old-safe');assert.equal(f.state.highestConfigVersion,5);});
test('same version conflicting remote sources fail closed, highest version wins',async()=>{const f=fixture([{configuration:await sign(payload())},{configuration:await sign(payload({artifactVersion:'different'}))}]);await assert.rejects(resolve(f.deps));assert.equal(f.commits,0);f.replies[1]={configuration:await sign(payload({version:2}))};assert.equal((await resolve(f.deps)).version,2);});
test('cache reverified after both failures, expiry/tamper/floor mismatch never returns',async()=>{const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);f.replies.fill(new Error('down'));assert.equal((await resolve(f.deps)).provenance,'verified-cache');const original=structuredClone(f.state);f.deps.now=()=>NOW+1000;await assert.rejects(resolve(f.deps));f.deps.now=()=>NOW;f.state.acceptedEnvelope=f.state.acceptedEnvelope.replace('artifact-new','tamper');await assert.rejects(resolve(f.deps));f.state=original;f.state.highestConfigVersion=2;await assert.rejects(resolve(f.deps));});
test('distinct origin and failure domain required before transport, bounded bytes and timeout',async()=>{const raw=await sign(payload());await rejected(raw,{sources:[{url:'https://a.fixture.test/config',failureDomain:'same'},{url:'https://b.fixture.test/config',failureDomain:'same'}]});await rejected(raw,{maximumBytes:100});const f=fixture([{},{}],{transport:()=>new Promise(()=>{}),timeoutMs:5});await assert.rejects(resolve(f.deps));assert.equal(f.commits,0);});
test('current designated root signs new trust key, overlap old/new both accepted',async()=>{const update=await sign(trust());const f=fixture([{trustUpdate:update,configuration:await sign(payload({version:2}),next)},{configuration:await sign(payload())}]);assert.equal((await resolve(f.deps)).version,2);assert.equal(f.state.trustVersion,1);f.replies[0]={configuration:await sign(payload({version:3}),root)};f.replies[1]=new Error('down');assert.equal((await resolve(f.deps)).version,3);});
test('self-authorizing update, trust rollback, revoked signer/cache and resurrection',async()=>{const self=fixture([{trustUpdate:await sign(trust(),next),configuration:await sign(payload(),next)},new Error('down')]);await assert.rejects(resolve(self.deps));const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:2}),next)};await resolve(f.deps);assert.ok(f.state.revokedKeyIds.includes(root.anchor.keyId));f.replies[0]={trustUpdate:await sign(trust(),root),configuration:await sign(payload({version:3}),root)};assert.equal((await resolve(f.deps)).provenance,'verified-cache');f.replies[0]={trustUpdate:await sign(trust({trustVersion:2,keys:[root.anchor,next.anchor]}),next)};await assert.rejects(resolve(f.deps));});
test('revocation invalidates previously accepted cache during update',async()=>{const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]}))};await assert.rejects(resolve(f.deps));assert.equal(f.state.trustVersion,1);assert.deepEqual(f.state.revokedKeyIds,[root.anchor.keyId]);assert.equal(f.state.highestConfigVersion,1);assert.equal(f.commits,2);});
test('trust same-version conflict rejects and revoked key cannot rebind',async()=>{const f=fixture([{trustUpdate:await sign(trust()),configuration:await sign(payload(),next)},{trustUpdate:await sign(trust({keys:[next.anchor]}))}]);await assert.rejects(resolve(f.deps));assert.equal(f.commits,0);});
test('atomic persistence failure and concurrent stale CAS do not return installations',async()=>{const raw=await sign(payload());const failed=fixture([{configuration:raw},{configuration:raw}],{store:{read:async()=>undefined,compareAndSwap:async()=>false}});await assert.rejects(resolve(failed.deps));const f=fixture([{configuration:raw},{configuration:raw}]);const results=await Promise.allSettled([resolve(f.deps),resolve(f.deps)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.commits,1);});
test('expiry after async transport is checked again before installation',async()=>{let now=NOW;const raw=await sign(payload());const f=fixture([{},{}],{now:()=>now,transport:async()=>{now=NOW+1000;return {configuration:raw};}});await assert.rejects(resolve(f.deps));assert.equal(f.commits,0);});

test('continuous authenticated revocation, rejection, later source-down rejection and next-key recovery',async()=>{
 const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);
 const cached=f.state.acceptedEnvelope;
 f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]}))};
 await assert.rejects(resolve(f.deps));
 assert.equal(f.state.trustVersion,1);assert.deepEqual(f.state.revokedKeyIds,[root.anchor.keyId]);
 assert.equal(f.state.highestConfigVersion,1);assert.equal(f.state.acceptedEnvelope,cached);
 f.replies.fill(new Error('down'));await assert.rejects(resolve(f.deps));assert.equal(f.commits,2);
 f.replies[0]={configuration:await sign(payload({version:2}),next)};
 const recovered=await resolve(f.deps);assert.equal(recovered.version,2);assert.equal(f.state.trustVersion,1);assert.equal(f.state.highestConfigVersion,2);
});
test('trust-only CAS false or throw rejects without claiming durable revocation or installation',async()=>{
 for(const throws of [false,true]){
  const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);
  const before=structuredClone(f.state);const commit=f.deps.store.compareAndSwap;
  f.deps.store.compareAndSwap=async()=>{if(throws)throw new Error('fixture storage failed');return false;};
  f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:2}),next)};
  await assert.rejects(resolve(f.deps));assert.deepEqual(f.state,before);assert.equal(f.commits,1);
  f.deps.store.compareAndSwap=commit;
 }
});
test('configuration CAS false after successful trust CAS retains revocation through subsequent outage',async()=>{
 const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);
 const original=f.deps.store.compareAndSwap;let calls=0;
 f.deps.store.compareAndSwap=async(expected,value)=>{calls++;return calls===1?original(expected,value):false;};
 f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:2}),next)};
 await assert.rejects(resolve(f.deps));assert.equal(calls,2);assert.equal(f.state.trustVersion,1);assert.equal(f.state.highestConfigVersion,1);
 f.replies.fill(new Error('down'));await assert.rejects(resolve(f.deps));assert.equal(f.commits,2);
});
test('intervening higher trust and configuration floor wins against stale second CAS',async()=>{
 const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);
 const original=f.deps.store.compareAndSwap;let calls=0;let winner;
 f.deps.store.compareAndSwap=async(expected,value)=>{
  calls++;
  if(calls===1)return original(expected,value);
  winner={...structuredClone(f.state),revision:f.state.revision+1,trustVersion:3,highestConfigVersion:9,acceptedEnvelope:await sign(payload({version:9}),next)};
  assert.equal(await original(f.state.revision,winner),true);
  return original(expected,value);
 };
 f.replies[0]={trustUpdate:await sign(trust({keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:2}),next)};
 await assert.rejects(resolve(f.deps));assert.deepEqual(f.state,winner);assert.equal(f.state.trustVersion,3);assert.equal(f.state.highestConfigVersion,9);
});
test('concurrent distinct trust updates cannot overwrite winning higher trust or floor',async()=>{
 const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);
 const one={...f.deps,transport:async()=>({trustUpdate:await sign(trust({trustVersion:1,keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:2}),next)})};
 const two={...f.deps,transport:async()=>({trustUpdate:await sign(trust({trustVersion:2,keys:[next.anchor],revokedKeyIds:[root.anchor.keyId]})),configuration:await sign(payload({version:3}),next)})};
 const realCommit=f.deps.store.compareAndSwap;let highCommitted;const highReady=new Promise(r=>highCommitted=r);
 one.store=two.store={...f.deps.store,compareAndSwap:async(expected,value)=>{
  if(value.trustVersion===1){await highReady;return realCommit(expected,value);}
  const result=await realCommit(expected,value);if(value.trustVersion===2)highCommitted();return result;
 }};
 const results=await Promise.allSettled([resolve(one),resolve(two)]);assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
 assert.equal(f.state.trustVersion,2);assert.equal(f.state.highestConfigVersion,3);assert.deepEqual(f.state.revokedKeyIds,[root.anchor.keyId]);
});
test('trust update expires during asynchronous transport and cannot commit security state',async()=>{
 let now=NOW;const update=await sign(trust({expiresAt:NOW+1}));
 const f=fixture([{configuration:await sign(payload())},new Error('down')]);await resolve(f.deps);const before=structuredClone(f.state);
 f.deps.now=()=>now;f.deps.transport=async()=>{now=NOW+1;return {trustUpdate:update};};
 await assert.rejects(resolve(f.deps));assert.deepEqual(f.state,before);
});
