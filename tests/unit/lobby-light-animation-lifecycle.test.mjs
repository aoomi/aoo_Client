import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
const sourcePath = process.env.LIGHT_SOURCE_OVERRIDE ?? new URL('../../assets/Lobby/Code/LobbyLightAnimation.ts', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }, reportDiagnostics: true });
assert.equal(output.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
class Vec3 { constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); } set(v) { Object.assign(this,{x:v.x,y:v.y,z:v.z}); } }
class UIOpacity { constructor() { this.opacity=17; } }
class Button { interactable=true; }
class Node {
    static EventType={TOUCH_START:'touch-start'};
    destroyed=false; pendingDestroy=false; position=new Vec3(2,3,4); listeners=new Map(); components=new Map();
    getComponent(type) { return this.components.get(type) ?? null; }
    setPosition(v) { assert.equal(this.destroyed,false); this.position.set(v); }
    on(type,fn,owner) { const list=this.listeners.get(type)??[];list.push({fn,owner});this.listeners.set(type,list); }
    off(type,fn,owner) { assert.equal(this.destroyed,false);this.listeners.set(type,(this.listeners.get(type)??[]).filter(x=>x.fn!==fn||x.owner!==owner)); }
    destroy() { this.destroyed=true;this.listeners.clear(); }
}
class Animation {
    destroyed=false; pendingDestroy=false; plays=0; stops=0;
    constructor(node) { this.node=node;this._crossFade={stop:()=>{this.stops++;}}; }
    play() { assert.equal(this.destroyed,false);this.plays++; }
    stop() { this._crossFade.stop(); }
    destroy() { this.destroyed=true;this._crossFade=null;this.node=null; }
}
class Component {
    enabledInHierarchy=true; tasks=new Map();
    scheduleOnce(fn,delay) { this.tasks.set(fn,{once:true,delay}); }
    schedule(fn,interval) { this.tasks.set(fn,{once:false,interval}); }
    unschedule(fn) { this.tasks.delete(fn); }
}
const isValid=(value,strict)=>!!value&&!value.destroyed&&(!strict||!value.pendingDestroy);
const cc={Vec3,UIOpacity,Button,Node,Animation,Component,isValid,_decorator:{ccclass:()=>value=>value,property:()=>()=>{}}};
const sandbox={module:{exports:{}},require:name=>{assert.equal(name,'cc');return cc;}};
vm.runInNewContext(`(function(require,module,exports){${output.outputText}\n})(require,module,module.exports);`,sandbox);
const Light=sandbox.module.exports.LobbyLightAnimation;
function fixture() {
    const ambientNode=new Node(),pressedNode=new Node(),button=new Node();
    for(const n of [ambientNode,pressedNode])n.components.set(UIOpacity,new UIOpacity());
    button.components.set(Button,new Button());
    const ambient=new Animation(ambientNode),pressed=new Animation(pressedNode),light=new Light();
    Object.assign(light,{ambient,pressed,button,firstDelay:1.3,interval:10});light.onLoad();
    return {light,ambient,pressed,button,ambientNode,pressedNode};
}
test('disable cleans each live animation once; destroy does not repeat released cleanup',()=>{
    const f=fixture();f.light.onEnable();f.light.begin();f.light.onPress();
    f.ambientNode.position.set(new Vec3(99,88,77));f.ambientNode.getComponent(UIOpacity).opacity=99;
    f.pressedNode.getComponent(UIOpacity).opacity=99;f.light.onDisable();
    assert.deepEqual({...f.ambientNode.position},{x:2,y:3,z:4});
    assert.equal(f.ambientNode.getComponent(UIOpacity).opacity,17);assert.equal(f.pressedNode.getComponent(UIOpacity).opacity,0);
    assert.equal(f.ambient.stops,1);assert.equal(f.pressed.stops,1);assert.equal(f.light.tasks.size,0);assert.equal(f.button.listeners.get('touch-start').length,0);
    f.ambient.destroy();f.pressed.destroy();assert.doesNotThrow(()=>f.light.onDestroy());assert.equal(f.ambient.stops,1);
});
test('destroyed truthy child Animation references are never stopped or restored during parent destruction',()=>{
    const f=fixture();f.light.onEnable();f.ambient.destroy();f.pressed.destroy();
    assert.doesNotThrow(()=>{f.light.onDisable();f.light.onDestroy();});
    assert.equal(f.light.tasks.size,0);assert.equal(f.button.listeners.get('touch-start').length,0);
});
test('five enable-disable cycles do not stack timers or press listeners',()=>{
    const f=fixture();for(let i=0;i<5;i++){f.light.onEnable();assert.equal(f.button.listeners.get('touch-start').length,1);assert.equal(f.light.tasks.size,1);f.light.begin();assert.equal(f.light.tasks.size,2);f.light.onDisable();assert.equal(f.light.tasks.size,0);assert.equal(f.button.listeners.get('touch-start').length,0);}
    assert.equal(f.ambient.plays,5);assert.equal(f.ambient.stops,5);f.light.onDestroy();assert.equal(f.ambient.stops,5);
});
test('repeated enable releases previous ownership before registering one new cycle',()=>{
    const f=fixture();f.light.onEnable();f.light.onEnable();assert.equal(f.button.listeners.get('touch-start').length,1);assert.equal(f.ambient.stops,1);f.light.onDisable();assert.equal(f.ambient.stops,2);
});
test('a queued playback callback after cleanup cannot restart a disabled owner',()=>{
    const f=fixture();f.light.onEnable();f.light.onDisable();f.light.begin();f.light.playAmbient();f.light.onPress();assert.equal(f.light.tasks.size,0);assert.equal(f.ambient.plays,0);assert.equal(f.pressed.plays,0);
});
test('pending destruction and destroyed button are excluded by strict engine validity',()=>{
    const f=fixture();f.light.onEnable();f.ambient.pendingDestroy=true;f.button.destroy();assert.doesNotThrow(()=>f.light.onDisable());assert.equal(f.ambient.stops,0);assert.equal(f.pressed.stops,1);
});
test('live animation failures propagate rather than being swallowed',()=>{
    const f=fixture();f.light.onEnable();f.ambient.stop=()=>{throw new Error('LIVE_ANIMATION_FAILURE');};assert.throws(()=>f.light.onDisable(),/LIVE_ANIMATION_FAILURE/);
});
