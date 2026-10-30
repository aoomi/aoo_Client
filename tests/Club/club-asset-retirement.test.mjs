import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
class Node {
 constructor(name,children=[]){this.name=name;this.children=children;this.active=true;this.listeners=new Map();this.isValid=true;for(const c of children)c.parent=this;}
 getChildByName(name){return this.children.find(c=>c.name===name)??null;}
 getChildByPath(path){let n=this;for(const key of path.split('/'))n=n?.getChildByName(key);return n??null;}
 getComponent(){return {updateLayout(){}};}
 on(event,fn){this.listeners.set(event,fn);}
 off(event){this.listeners.delete(event);}
 addChild(node){this.children.push(node);node.parent=this;}
 destroy(){this.isValid=false;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
}
const cc={Node,Button:{EventType:{CLICK:'click'}},Layout:class{},instantiate:node=>new Node(node.name)};
function load(file,name){const source=fs.readFileSync(new URL(`../../assets/Club/Code/Runtime/${file}.ts`,import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal(compiled.diagnostics?.length??0,0);const module={exports:{}};const require=path=>path==='cc'?cc:{};vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})(require,module,module.exports);`,{module,require,console});return module.exports[name];}
const Management=load('LegacyClubManagementController','LegacyClubManagementController');
test('ordinary management remains while retired asset form has no registration or action',()=>{
 const registrations=new Map(),requests=[];const forms={register:(path,config)=>registrations.set(path,config)};
 const controller=new Management(forms,{request:(...args)=>requests.push(args)},1);controller.install();
 assert.equal(registrations.has('ui/club/UIClubDiamond'),false);assert.equal(registrations.has('ui/club/ClubAdmin'),true);
 const close=new Node('btn_close'),exit=new Node('btn_outclub'),dissolve=new Node('btn_dissolveclub');const form={node:new Node('root',[close,exit,dissolve])};
 const life=registrations.get('ui/club/ClubAdmin').lifecycle;life.onShow(form,{id:1,minister:2});
 assert.equal(close.listeners.has('click'),true);assert.equal(dissolve.listeners.has('click'),true);assert.equal(exit.active,false);assert.equal(requests.length,0);
});
const Union=load('LegacyUnionManagerController','LegacyUnionManagerController');
test('union management does not bind retired asset configuration',async()=>{
 const controller=Object.create(Union.prototype),diamond=new Node('btn_diamond'),setting=new Node('btn_SettingNode',[diamond]);
 const form={node:new Node('root',[setting])};Object.assign(controller,{roomCardFields:new WeakMap(),settingSession:0,settingLoad:0,settingSaving:false,pages:[],disposers:[],context:{unionPostType:3,minister:3},form,client:{request:async()=>({})}});
 controller.edit=()=>{};controller.check=()=>{};controller.bind(form,'ui/club/UIUnionManager');await controller.loadSetting();
 assert.equal(diamond.active,false);assert.equal(diamond.listeners.size,0);
 const labels={};controller.label=(_root,key,value)=>labels[key]=value;controller.path='ui/club/UIUnionManager';controller.client.request=async()=>({consumeValue:17,setCount:8,roomSize:2,clubCentIncome:11});
 await controller.loadManagementCount(setting,'');assert.equal(labels.lb_xiaohao,'总消耗:17');assert.equal(labels.lb_jushu,'总局数:8');
});
const Report=load('LegacyClubReportController','LegacyClubReportController');
test('report renders real room cards and ordinary scores while hiding retired circle cards',()=>{
 const controller=Object.create(Report.prototype),demo=new Node('demo'),content=new Node('layout',[demo]),labels={},active={};
 Object.assign(controller,{form:{node:new Node('root',[content])},rowDisposers:[],label:(_n,k,v)=>labels[k]=v,active:(_n,k,v)=>active[k]=v,rowClick:()=>{}});
 controller.render([{player:{pid:1,name:'fixture'},roomCard:0,roomCardSize:8,clubCard:99,clubCardSize:12,size:8,winner:2,point:-7,clubCent:11}],true);
 assert.equal(labels.lb_fangka,'房卡：0张/8局');assert.equal(Object.hasOwn(labels,'lb_quanka'),false);assert.equal(active.lb_quanka,false);assert.equal(active.icon_qk,false);
 assert.equal(labels.lb_point,'-7');assert.equal(labels.lb_ClubCent,'俱乐部积分：+11');assert.equal(labels.lb_canyu,'参    与：8局');assert.equal(labels.lb_yingjia,'大赢家：2场');
});
const Promotion=load('LegacyClubPromotionController','LegacyClubPromotionController');
test('promotion record zero room cards never falls back to retired balances or sports fees',()=>{
 const controller=Object.create(Promotion.prototype),demo=new Node('demo'),content=new Node('layout',[demo]),labels={},active={};let players;
 Object.assign(controller,{recordForm:{node:new Node('root',[content])},clearRows:()=>{},label:(_n,k,v)=>labels[k]=v,active:(_n,k,v)=>active[k]=v,rowClick:()=>{},renderRecordPlayers:(_n,value)=>players=value});
 controller.renderRecords([{roomCard:0,clubCard:99,unionId:1,roomSportsConsume:88,playerList:[{pid:1,point:-7,clubCent:11}]}]);
 assert.equal(labels.lb_card,'X0');assert.equal(active.icon_fk,true);assert.equal(active.icon_qk,false);assert.equal(active.icon_ClubCent,false);assert.equal(active.lb_ClubCent,false);assert.equal(Object.hasOwn(labels,'lb_ClubCent'),false);
 assert.equal(players[0].point,-7);assert.equal(players[0].clubCent,11);
});
