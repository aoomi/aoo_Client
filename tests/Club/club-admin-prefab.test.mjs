import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
class Button { static EventType = { CLICK: 'click' }; }
class Component {} class EditBox { string = ''; } class ScrollView {} class Label {} class Layout { updateLayout() {} }
class Node {
 constructor(name) { this.name=name; this.children=[]; this.components=new Map(); this.events=new Map(); this.active=true; }
 addChild(n) { if(n.parent) n.parent.children.splice(n.parent.children.indexOf(n),1); this.children.push(n); n.parent=this; }
 getComponent(t) { return this.components.get(t) ?? null; }
 getPathInHierarchy() { return `${this.parent ? this.parent.getPathInHierarchy()+'/' : ''}${this.name}`; }
 on(e,f) { const a=this.events.get(e)??[]; a.push(f); this.events.set(e,a); }
 off(e,f) { this.events.set(e,(this.events.get(e)??[]).filter(x=>x!==f)); }
 destroy() { this.destroyed=true; if(this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); }
}
const cc={Node,Button,Component,EditBox,ScrollView,Label,Layout,isValid:n=>!n.destroyed};
function load(path) {
 const r=ts.transpileModule(read(path),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 assert.equal(r.diagnostics.length,0); const module={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${r.outputText}\n})(require,module,module.exports)`,{module,require:n=>n==='cc'?cc:{setClubDynamicLabel:(label,name,text)=>{if(label)label.string=text;}},console}); return module.exports;
}
function fixture(path) {
 const data=JSON.parse(read(path)), nodes=new Map();
 data.forEach((r,i)=>{if(r.__type__==='cc.Node')nodes.set(i,new Node(r._name));});
 const types={'cc.Button':Button,'cc.EditBox':EditBox,'cc.ScrollView':ScrollView,'cc.Label':Label,'cc.Layout':Layout};
 for(const [i,n] of nodes) {
  for(const c of data[i]._children??[])n.addChild(nodes.get(c.__id__));
  for(const ref of data[i]._components??[]) {const r=data[ref.__id__], T=types[r.__type__]; if(T){const c=new T(); if(T===ScrollView)c.content=nodes.get(r._content?.__id__);n.components.set(T,c);}}
 }
 return {node:[...nodes.values()].find(n=>!n.parent)};
}
const Admin=load('assets/Club/Code/Runtime/LegacyClubManagementController.ts').LegacyClubManagementController;
test('ClubAdmin saved controls, route and repeated lifecycle preserve single binding',()=>{
 const registrations=new Map(),closed=[];
 const forms={register:(p,v)=>registrations.set(p,v),close:p=>closed.push(p)};
 const c=new Admin(forms,{},1);c.install();const life=registrations.get('ui/club/ClubAdmin').lifecycle;
 const f=fixture('assets/Club/Prefab/ClubAdmin.prefab');
 const close=c.requiredButton(f.node,'btn_close');const nested=new Node('nested');f.node.addChild(nested);nested.addChild(close);
 for(let i=0;i<3;i++) {life.onShow(f,{id:7,minister:2});assert.equal(close.events.get('click').length,1);assert.equal(c.requiredButton(f.node,'btn_outclub').active,false);assert.equal(c.requiredButton(f.node,'btn_dissolveclub').active,true);close.events.get('click')[0]();assert.equal(closed.at(-1),'ui/club/ClubAdmin');life.onClose(f);assert.equal(close.events.get('click').length,0);}
 const dup=new Node('btn_close');dup.components.set(Button,new Button());f.node.addChild(dup);
 assert.throws(()=>life.onShow(f,{}),e=>e.message.includes('nested/btn_close')&&e.message.includes('ClubAdmin/btn_close'));
 assert.equal(close.events.get('click').length,0);
});
test('ClubAdmin mapping and source retire old interface path only',()=>{
 const registry=load('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');assert.equal(registry.resolveModulePrefabAsset('ui/club/ClubAdmin').asset,'Prefab/ClubAdmin');
 for(const path of ['assets/Club/Code/Runtime/LegacyClubManagementController.ts','assets/Club/Code/Runtime/LegacyClubMainController.ts'])assert.doesNotMatch(read(path),/ui\/club\/ClubManage['"]/);
 assert.doesNotMatch(read('assets/Club/Code/Runtime/LegacyClubManagementController.ts'),/btn_diamond/);
});
