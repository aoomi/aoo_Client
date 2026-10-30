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
const cc={Node,Button,Component,EditBox,ScrollView,Label,Layout,instantiate:clone,isValid:n=>!n.destroyed};
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
const Forbid=load('assets/Club/Code/Runtime/LegacyClubForbidController.ts').LegacyClubForbidController;
test('current prefab validates after nesting and reports all duplicate control paths',()=>{
 const c=new Forbid({},{}), f=fixture('assets/Club/Prefab/ClubBanDeskMate.prefab');
 const controls=c.mainControls(f), button=c.unique(controls.popup,'Btn_Search',Button), nested=new Node('nested'); controls.popup.addChild(nested); nested.addChild(button);
 assert.equal(c.mainControls(f).content,controls.content);
 const duplicate=new Node('Btn_Search');duplicate.components.set(Button,new Button());controls.popup.addChild(duplicate);
 assert.throws(()=>c.mainControls(f),e=>e.message.includes(button.getPathInHierarchy())&&e.message.includes(duplicate.getPathInHierarchy()));
});
test('reopening binds once, closing clears listeners and late requests cannot render',async()=>{
 const pending=[], requests=[], forms={close:()=>{},register:()=>{}}, client={request:(p,v)=>{requests.push([p,v]);return new Promise(r=>pending.push(r));}};
 const c=new Forbid(forms,client), f=fixture('assets/Club/Prefab/ClubBanDeskMate.prefab');let renders=0;c.renderGroups=()=>renders++;
 c.showMain(f,{id:7,minister:2}); const {popup}=c.mainControls(f), search=c.unique(popup,'Btn_Search',Button);
 assert.equal(search.events.get('click').length,1);c.clearMain();assert.equal(search.events.get('click').length,0);
 c.showMain(f,{id:7,minister:2});assert.equal(search.events.get('click').length,1);
 pending[0]([]);await Promise.resolve();assert.equal(renders,0);
 c.unique(popup,'EditBox_1',EditBox).getComponent(EditBox).string='123';c.unique(popup,'EditBox_0',EditBox).getComponent(EditBox).string='456';
 const loading=c.loadGroups();assert.equal(requests.at(-1)[0],'club.CClubGroupingList');assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1)[1])),{clubId:7,pidOne:123,pidTwo:456});pending.at(-1)([]);await loading;assert.equal(renders,1);
 c.dispose();assert.equal(search.events.get('click').length,0);
});
test('FindRoom saved controls and both new routes resolve; old active routes removed',()=>{
 const registry=load('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
 for(const name of ['ClubFindRoom','ClubBanDeskMate'])assert.equal(registry.resolveModulePrefabAsset(`ui/club/${name}`).asset,`Prefab/${name}`);
 const c=new Forbid({},{}),f=fixture('assets/Club/Prefab/ClubFindRoom.prefab');
 for(const [name,T]of [['btn_close',Button],['btn_search',Button],['EditBox',EditBox]])assert.ok(c.unique(f.node,name,T));
 const main=read('assets/Club/Code/Runtime/LegacyClubMainController.ts');assert.ok(main.includes("show('Btn_FindRoom', 'ui/club/ClubFindRoom')"));
 for(const p of ['assets/Club/Code/Runtime/LegacyClubMainController.ts','assets/Club/Code/Runtime/LegacyClubForbidController.ts'])assert.doesNotMatch(read(p),/['"]ui\/club\/(ClubBan|ClubFind)['"]/);
});

function clone(node) {
 const copy=new Node(node.name);copy.active=node.active;
 for(const [T,c] of node.components) copy.components.set(T,Object.assign(new T(),c));
 for(const child of node.children)copy.addChild(clone(child));
 return copy;
}
test('saved group row buttons survive member cleanup and reentry without duplicate callbacks',async()=>{
 const shown=[],requests=[],registrations=new Map();
 const forms={register:(p,v)=>registrations.set(p,v),show:(...args)=>{shown.push(args);return Promise.resolve();}};
 const client={request:async(p,v)=>{requests.push([p,v]);return p==='club.CClubGroupingList'?[{groupingId:42,playerList:[]}]:[];}};
 const c=new Forbid(forms,client);c.install();
 const f=fixture('assets/Club/Prefab/ClubBanDeskMate.prefab');
 const tick=async()=>{await Promise.resolve();await Promise.resolve();};
 const click=(root,name)=>{const n=c.unique(root,name,Button);assert.equal(n.events.get('click')?.length,1);for(const fn of [...n.events.get('click')])fn();};
 c.showMain(f,{id:7,minister:2});await tick();
 let row=c.mainControls(f).content.children[0];assert.ok(row);
 const panel=c.unique(f.node,'AddPlay');assert.equal(panel.active,false);
 click(row,'Btn_Add');assert.equal(panel.active,true);assert.equal(c.groupingId,42);assert.equal(shown.length,0);
 click(panel,'Btn_Close');assert.equal(panel.active,false);
 click(row,'Btn_Add');assert.equal(panel.active,true);
 assert.equal(c.unique(panel,'Btn_Close',Button).events.get('click').length,1);
 c.clearRows();registrations.get('ui/club/UIForbidUserList').lifecycle.onClose();
 click(row,'Btn_SetGroup');assert.equal(shown.length,1);assert.equal(shown[0][0],'ui/club/UIForbidUserList');
 registrations.get('ui/club/UIForbidRoomCfg').lifecycle.onClose();
 click(row,'Btn_DelGroup');await tick();assert.equal(requests.at(-1)[0],'club.CClubGroupingRemove');assert.equal(requests.at(-1)[1].groupingId,42);
 c.clearMain();c.showMain(f,{id:7,minister:2});await tick();row=c.mainControls(f).content.children[0];
 assert.equal(panel.active,false);click(row,'Btn_Add');assert.equal(panel.active,true);assert.equal(shown.length,1);
 c.clearMain();for(const name of ['Btn_Add','Btn_SetGroup','Btn_DelGroup'])assert.equal(c.unique(row,name,Button).events.get('click').length,0);
 c.dispose();
});

test('add group retains server action and ManageMember add releases listeners on reentry',async()=>{
 const requests=[], c=new Forbid({},{request:async(p)=>{requests.push(p);return [];}});
 const f=fixture('assets/Club/Prefab/ClubBanDeskMate.prefab');
 const manage=c.unique(f.node,'ManageMember'), panel=c.unique(f.node,'AddPlay');
 const list=c.unique(manage,'PlayerInfo',ScrollView), add=c.unique(manage,'Btn_Add',Button,list);
 const wrapper=new Node('moved-button');manage.addChild(wrapper);wrapper.addChild(add);
 const click=n=>{assert.equal(n.events.get('click')?.length,1);for(const fn of [...n.events.get('click')])fn();};
 for(let i=0;i<3;i++) {
  c.showMain(f,{id:7,minister:2});await Promise.resolve();
  assert.equal(manage.active,false);assert.equal(panel.active,false);
  assert.equal(c.unique(list,'Demo').active,false);
  click(c.unique(c.mainControls(f).popup,'Btn_AddForbid',Button));await Promise.resolve();await Promise.resolve();
  assert.equal(manage.active,false);
  assert.equal(requests.filter(p=>p==='club.CClubGroupingAdd').length,i+1);
  // Exercise the retained embedded-panel binding independently of adding a group.
  manage.active=true;
  click(add);assert.equal(panel.active,true);assert.equal(c.groupingId,0);
  const templateAdd=c.unique(list,'Btn_Add',Button);assert.equal(templateAdd.events.get('click')?.length??0,0);
  click(c.unique(panel,'Btn_Close',Button));assert.equal(panel.active,false);assert.equal(manage.active,true);
  click(add);assert.equal(panel.active,true);
  click(c.unique(manage,'Btn_Close',Button));assert.equal(manage.active,false);assert.equal(panel.active,false);
  c.clearMain();assert.equal(add.events.get('click').length,0);
 }
 c.dispose();
});
