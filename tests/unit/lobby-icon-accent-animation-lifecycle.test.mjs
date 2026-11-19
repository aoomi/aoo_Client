import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(process.env.ACCENT_SOURCE_OVERRIDE??new URL('../../assets/Lobby/Code/LobbyIconAccentAnimation.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true},reportDiagnostics:true});
assert.equal(output.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
class Vec3 { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}set(v){Object.assign(this,{x:v.x,y:v.y,z:v.z});} }
class Animation {destroyed=false;pendingDestroy=false;plays=0;stops=0;constructor(){this._crossFade={stop:()=>this.stops++};}play(){assert.equal(this.destroyed,false);this.plays++;}stop(){this._crossFade.stop();}destroy(){this.destroyed=true;this._crossFade=null;} }
class Node {destroyed=false;pendingDestroy=false;position=new Vec3(2,3,4);scale=new Vec3(1,2,3);eulerAngles=new Vec3(4,5,6);animation=new Animation();getComponent(type){assert.equal(type,Animation);return this.animation;}setPosition(v){assert.ok(!this.destroyed&&!this.pendingDestroy);this.position.set(v);}setScale(v){assert.ok(!this.destroyed&&!this.pendingDestroy);this.scale.set(v);}setRotationFromEuler(v){assert.ok(!this.destroyed&&!this.pendingDestroy);this.eulerAngles.set(v);} }
class Component {node=new Node();enabledInHierarchy=true;tasks=new Map();scheduleOnce(fn,delay){this.tasks.set(fn,delay);}unschedule(fn){this.tasks.delete(fn);}getComponent(t){return this.node.getComponent(t);} }
const cc={Animation,Component,Vec3,isValid:(v,strict)=>!!v&&!v.destroyed&&(!strict||!v.pendingDestroy),_decorator:{ccclass:()=>v=>v,requireComponent:()=>v=>v,property:()=>()=>{}}};
const sandbox={module:{exports:{}},require:n=>{assert.equal(n,'cc');return cc;}};
vm.runInNewContext(`(function(require,module,exports){${output.outputText}\n})(require,module,module.exports);`,sandbox);
const Icon=sandbox.module.exports.LobbyIconAccentAnimation;
function fixture(delay=1.3){const icon=new Icon();icon.firstDelay=delay;icon.onLoad();return {icon,node:icon.node,animation:icon.node.animation};}
test('disable restores once; destroy does not stop released animation again',()=>{const f=fixture();f.icon.onEnable();f.node.position.set(new Vec3(9,8,7));f.node.scale.set(new Vec3(5,6,7));f.node.eulerAngles.set(new Vec3(9,10,11));f.icon.onDisable();assert.deepEqual({...f.node.position},{x:2,y:3,z:4});assert.deepEqual({...f.node.scale},{x:1,y:2,z:3});assert.deepEqual({...f.node.eulerAngles},{x:4,y:5,z:6});assert.equal(f.animation.stops,1);f.animation.destroy();assert.doesNotThrow(()=>f.icon.onDestroy());assert.equal(f.animation.stops,1);assert.equal(f.icon.tasks.size,0);});
test('destroyed truthy co-located Animation is never stopped',()=>{const f=fixture();f.icon.onEnable();f.animation.destroy();assert.doesNotThrow(()=>f.icon.onDestroy());assert.equal(f.animation.stops,0);assert.equal(f.icon.tasks.size,0);});
test('pending animation and destroying node are excluded by strict validity',()=>{for(const target of ['animation','node']){const f=fixture();f.icon.onEnable();f[target].pendingDestroy=true;assert.doesNotThrow(()=>{f.icon.onDisable();f.icon.onDestroy();});assert.equal(f.animation.stops,0);assert.equal(f.icon.tasks.size,0);}});
test('five enable-disable cycles retain initial stagger and do not stack callbacks',()=>{const f=fixture();for(let i=0;i<5;i++){f.icon.onEnable();assert.equal(f.icon.tasks.size,1);assert.equal([...f.icon.tasks.values()][0],1.3);f.icon.begin();f.icon.onDisable();assert.equal(f.icon.tasks.size,0);}assert.equal(f.animation.plays,5);assert.equal(f.animation.stops,5);});
test('duplicate enable releases old playback exactly once',()=>{const f=fixture();f.icon.onEnable();f.icon.onEnable();assert.equal(f.animation.stops,1);assert.equal(f.icon.tasks.size,1);f.icon.onDisable();assert.equal(f.animation.stops,2);});
test('queued callback after cleanup cannot restart animation',()=>{const f=fixture();f.icon.onEnable();f.icon.onDisable();f.icon.begin();f.icon.playClip();assert.equal(f.animation.plays,0);assert.equal(f.icon.tasks.size,0);});
test('zero delay still starts immediately',()=>{const f=fixture(0);f.icon.onEnable();assert.equal(f.animation.plays,1);assert.equal(f.icon.tasks.size,0);f.icon.onDisable();assert.equal(f.animation.stops,1);});
test('live stop failure propagates without being swallowed',()=>{const f=fixture();f.icon.onEnable();f.animation.stop=()=>{throw new Error('LIVE_ANIMATION_FAILURE');};assert.throws(()=>f.icon.onDisable(),/LIVE_ANIMATION_FAILURE/);});
