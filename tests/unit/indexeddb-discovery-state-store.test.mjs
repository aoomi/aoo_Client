/** Native IndexedDB tests. An explicit frozen resource packet is mandatory; never silently skip. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';
const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
const storePath=path.join(projectRoot,'Client/assets/Common/Code/Runtime/config/IndexedDbDiscoveryStateStore.ts');
const policyPath=path.join(projectRoot,'Client/assets/Login/Code/Bootstrap/LoadingEnvironmentPolicy.ts');
const gatewayPath=path.join(projectRoot,'Client/assets/Common/Code/Runtime/network/GatewayEntryPolicy.ts');
const stateDatabase='aoo-trust-discovery-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const packetPath=process.env.D10_RESOURCE_PACKET;
assert.ok(packetPath,'D10_RESOURCE_PACKET is required; native resources may not run without a gate');
const packet=JSON.parse(await readFile(packetPath,'utf8'));
assert.equal(packet.executeReady,true);assert.equal(packet.owner,process.env.D10_RESOURCE_OWNER);
assert.ok(path.isAbsolute(packet.scratch));assert.match(packet.scratch,/^\/tmp\/aoo-d10-native-idb-[a-zA-Z0-9-]+$/);
assert.ok(Number.isInteger(packet.port)&&packet.port>=1024&&packet.port<=65535);
assert.ok(path.isAbsolute(packet.chromeExecutable));assert.ok(path.isAbsolute(packet.playwrightEntry));
for(const [name,expected] of Object.entries(packet.approvedInputHashes))assert.equal(hash(await readFile(name)),expected,`input drift: ${name}`);
for(const name of [storePath,policyPath,gatewayPath,fileURLToPath(import.meta.url),process.execPath,packet.chromeExecutable,packet.playwrightEntry])assert.ok(packet.approvedInputHashes[name],`unbound required input: ${name}`);
const originalHashes=new Map(Object.entries(packet.approvedInputHashes));
const modulePaths={
 '/Client/assets/Common/Code/Runtime/config/IndexedDbDiscoveryStateStore.js':storePath,
 '/Client/assets/Login/Code/Bootstrap/LoadingEnvironmentPolicy.js':policyPath,
 '/Client/assets/Common/Code/Runtime/network/GatewayEntryPolicy':gatewayPath,
};
const modules=new Map();
for(const [route,input] of Object.entries(modulePaths)){
 const output=ts.transpileModule(await readFile(input,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal((output.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 modules.set(route,output.outputText);
}
let context,server,chromium,page;let origin;let externalRequests=0;let abortedExternal=0;
async function launch(){
 context=await chromium.launchPersistentContext(path.join(packet.scratch,'profile'),{executablePath:packet.chromeExecutable,headless:true,serviceWorkers:'block',args:['--disable-background-networking','--no-first-run','--no-default-browser-check','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 await context.route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(target.origin!==origin){externalRequests++;await route.abort();abortedExternal++;}else await route.continue();
 });
 page=await context.newPage();await page.goto(origin,{waitUntil:'load',timeout:10000});
 return page;
}
const validKey={keyId:'fixture-next',issuer:'fixture-issuer',purposes:['aoo-runtime-discovery','aoo-discovery-trust'],notBefore:0,expiresAt:9000000000000,publicKey:{kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)}};
function state(revision=1,version=1,trustVersion=1){return {revision,highestConfigVersion:version,trustVersion,keys:[validKey],revokedKeyIds:['fixture-old'],acceptedEnvelope:JSON.stringify({schemaVersion:1,keyId:'fixture-next',signature:'synthetic-public-signature',payload:{version,expiresAt:1}})};}
async function native(operation,args){return page.evaluate(async({operation,args})=>{
 const {IndexedDbDiscoveryStateStore:Store}=await import('/Client/assets/Common/Code/Runtime/config/IndexedDbDiscoveryStateStore.js');
 return await new Function('Store','args',`return (async()=>{${operation}})();`)(Store,args);
},{operation,args});}
const observations=[];
test.before(async()=>{
 await assert.rejects(access(packet.scratch));await mkdir(packet.scratch,{recursive:false});
 const entry=await import(pathToFileURL(packet.playwrightEntry).href);chromium=entry.chromium;
 server=createServer((req,res)=>{
  const target=new URL(req.url,origin??'http://127.0.0.1');
  if(target.pathname==='/'&&!target.search){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>D10 isolated native IDB</title>');return;}
  const body=modules.get(target.pathname);
  if(body&&!target.search){res.setHeader('Content-Type','text/javascript');res.end(body);}else{res.statusCode=404;res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(packet.port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${packet.port}`;
 await launch();
 assert.equal(await page.evaluate(()=>Object.prototype.toString.call(indexedDB)),'[object IDBFactory]');
 observations.push({stage:'setup',origin,profile:path.join(packet.scratch,'profile'),headlessRequested:true,browserVersion:context.browser().version(),nativeFactory:true});
});
test.after(async()=>{
 try{await context?.close();}finally{
  if(server?.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  for(const [name,expected] of originalHashes)assert.equal(hash(await readFile(name)),expected,`after-input drift: ${name}`);
  observations.push({stage:'cleanup',contextClosed:true,serverListening:server?.listening??false,externalRequests,abortedExternal,productionSecrets:false});
  console.log('D10_NATIVE_OBSERVATIONS '+JSON.stringify(observations));
  // Retain only this task-owned profile/evidence for independent review. Resource owner disposes later.
 }
});
test('native state persists across closed adapter and browser context reopen on same origin',async()=>{
 const expected=state();const saved=await native(`const s=new Store(indexedDB,'reopen');const before=await s.read();const committed=await s.compareAndSwap(undefined,args);const after=await s.read();s.close();return {before:before??null,committed,after};`,expected);
 assert.equal(saved.before,null);assert.equal(saved.committed,true);assert.deepEqual(saved.after,expected);
 await context.close();await launch();
 const reopened=await native(`const s=new Store(indexedDB,'reopen');const v=await s.read();s.close();return v;`);assert.deepEqual(reopened,expected);
 observations.push({stage:'same-profile-context-reopen',persistent:true,revision:reopened.revision,floor:reopened.highestConfigVersion});
});
test('two actual pages CAS same record and revision have exactly one winner',async()=>{
 await native(`const s=new Store(indexedDB,'two-page');await s.compareAndSwap(undefined,args);s.close();`,state());
 const other=await context.newPage();await other.goto(origin);
 const attempt=async(p,candidate)=>p.evaluate(async(candidate)=>{const {IndexedDbDiscoveryStateStore:Store}=await import('/Client/assets/Common/Code/Runtime/config/IndexedDbDiscoveryStateStore.js');const s=new Store(indexedDB,'two-page');try{return await s.compareAndSwap(1,candidate);}finally{s.close();}},candidate);
 const a=state(2,2,1),b=state(2,3,2);const results=await Promise.all([attempt(page,a),attempt(other,b)]);assert.equal(results.filter(Boolean).length,1);
 const persisted=await native(`const s=new Store(indexedDB,'two-page');const v=await s.read();s.close();return v;`);assert.deepEqual(persisted,results[0]?a:b);await other.close();observations.push({stage:'two-native-pages-CAS',winners:1,persistedFloor:persisted.highestConfigVersion});
});
test('actual put success followed by transaction abort cannot return committed true',async()=>{
 await native(`const s=new Store(indexedDB,'native-abort');await s.compareAndSwap(undefined,args);s.close();`,state());
 const result=await native(`const initial=IDBObjectStore.prototype.put;let putSucceeded=false;IDBObjectStore.prototype.put=function(...a){const r=initial.apply(this,a);if(this.transaction.db.name===Store.databaseName)r.addEventListener('success',()=>{putSucceeded=true;this.transaction.abort();},{once:true});return r;};const s=new Store(indexedDB,'native-abort');let rejected=false;try{await s.compareAndSwap(1,args);}catch{rejected=true;}finally{IDBObjectStore.prototype.put=initial;s.close();}const read=new Store(indexedDB,'native-abort');const after=await read.read();read.close();return {rejected,putSucceeded,after};`,state(2,2,1));assert.equal(result.rejected,true);assert.equal(result.putSucceeded,true);assert.deepEqual(result.after,state());observations.push({stage:'native-abort-after-put',putSuccess:true,transactionRejected:true,unchanged:true});
});
test('stale revisions and invalid security tuple changes reject without resetting state',async()=>{
 await native(`const s=new Store(indexedDB,'guards');await s.compareAndSwap(undefined,args);s.close();`,state(1,3,2));
 const variants=[state(3,4,2),state(2,2,2),state(2,4,1),{...state(2,4,3),revokedKeyIds:[]},{...state(2,4,2),keys:[{...validKey,keyId:'different'}]},{...state(2,4,3),keys:[{...validKey,publicKey:{...validKey.publicKey,d:'private'}}]}];
 const result=await native(`const s=new Store(indexedDB,'guards');const stale=await s.compareAndSwap(7,args.variants[0]);let rejected=0;for(const v of args.variants){try{await s.compareAndSwap(1,v);}catch{rejected++;}}const after=await s.read();s.close();return {stale,rejected,after};`,{variants});assert.equal(result.stale,false);assert.equal(result.rejected,variants.length);assert.deepEqual(result.after,state(1,3,2));observations.push({stage:'native-security-monotonicity',rejected:variants.length,staleFalse:true});
});
test('expired configuration cache does not expire floor or trust; caller mutation cannot alter pending CAS',async()=>{
 const result=await native(`const s=new Store(indexedDB,'expiry-mutation');const pending=s.compareAndSwap(undefined,args);args.highestConfigVersion=999;const committed=await pending;const after=await s.read();s.close();return {committed,after};`,state());assert.equal(result.committed,true);assert.deepEqual(result.after,state());observations.push({stage:'expired-envelope-floor-retained',floor:1,revoked:['fixture-old'],snapshotProtected:true});
});
test('actual existing business cleanup removes own mutable DB and preserves native trust floor',async()=>{
 await native(`const s=new Store(indexedDB,'cleanup');await s.compareAndSwap(undefined,args);s.close();`,state());
 const result=await page.evaluate(async()=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.open('aoo-client-data',1);r.onupgradeneeded=()=>r.result.createObjectStore('fixture');r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
  const {clearAooLocalData}=await import('/Client/assets/Login/Code/Bootstrap/LoadingEnvironmentPolicy.js');
  const cleanup=await clearAooLocalData({indexedDB,cleanupTimeoutMs:4000});
  const names=(await indexedDB.databases()).map(d=>d.name);
  const {IndexedDbDiscoveryStateStore:Store}=await import('/Client/assets/Common/Code/Runtime/config/IndexedDbDiscoveryStateStore.js');
  const s=new Store(indexedDB,'cleanup');const after=await s.read();s.close();return {cleanup,names,after};
 });assert.deepEqual(result.cleanup.failures,[]);assert.equal(result.names.includes('aoo-client-data'),false);assert.equal(result.names.includes(stateDatabase),true);assert.deepEqual(result.after,state());observations.push({stage:'existing-policy-native-cleanup',mutableDatabaseRemoved:true,trustDatabasePreserved:true,floor:result.after.highestConfigVersion});
});
test('native read corrupt record rejects and unavailable factory cannot silently succeed',async()=>{
 const result=await native(`let unavailable=false;try{new Store(undefined,'unavailable');}catch{unavailable=true;}await new Promise((resolve,reject)=>{const r=indexedDB.open(Store.databaseName,1);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('states','readwrite');tx.objectStore('states').put({revision:1},'corrupt');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});const s=new Store(indexedDB,'corrupt');let corruptRejected=false;try{await s.read();}catch{corruptRejected=true;}finally{s.close();}return {unavailable,corruptRejected};`);assert.deepEqual(result,{unavailable:true,corruptRejected:true});observations.push({stage:'native-corruption-failclosed',unavailable:true,corruptRejected:true});
});
test('actual blocked upgrade and late request completion do not produce a successful adapter open',async()=>{
 const result=await native(`const fixture=await new Promise((resolve,reject)=>{const r=indexedDB.open(Store.databaseName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});fixture.onversionchange=()=>{};let request;const wrapped={open:()=>{request=indexedDB.open(Store.databaseName,2);return request;}};const s=new Store(wrapped,'blocked',1000);let rejected=false;try{await s.read();}catch{rejected=true;}fixture.close();await new Promise(resolve=>setTimeout(resolve,50));s.close();return {rejected};`);assert.equal(result.rejected,true);observations.push({stage:'native-blocked-open',rejected:true});
});
test('native versionchange closes owned connection and subsequent access rejects',async()=>{
 const result=await native(`const s=new Store(indexedDB,'versionchange');await s.read();await new Promise((resolve,reject)=>{const r=indexedDB.open(Store.databaseName,2);r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('unexpected blocked'));});let rejected=false;try{await s.read();}catch{rejected=true;}return {rejected};`);assert.equal(result.rejected,true);observations.push({stage:'native-versionchange',closed:true});
});
