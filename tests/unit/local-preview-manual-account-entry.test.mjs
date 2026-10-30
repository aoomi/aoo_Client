import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(path.resolve('Client/assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true},reportDiagnostics:true});
assert.equal((compiled.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
function fixture(options={}){
 const scheduled=[];let guestCalls=0;
 class N{static EventType={TOUCH_END:'touch',MOUSE_UP:'mouse'};constructor(name){this.name=name;this.uuid=name;this.isValid=true;this.active=true;this.children=[];this.handlers=new Map();this.components=new Map();this._components=[];}child(name){const n=new N(name);this.children.push(n);return n;}getChildByName(name){return this.children.find(n=>n.name===name)??null;}getComponent(type){return this.components.get(type)??null;}addComponent(type){const c=new type();c.node=this;this.components.set(type,c);this._components.push(c);return c;}getComponents(type){return this._components.filter(c=>c instanceof type);}targetOff(){}on(event,callback){this.handlers.set(event,callback);}emit(event){this.handlers.get(event)?.();}}
 class Component{constructor(){this.isValid=true;}}
 class Button{constructor(){this.interactable=true;this.clickEvents=[];}}
 class EditBox{constructor(){this.isValid=true;this.enabled=true;}}
 class LoginView{configure(auth){this.auth=auth;}activateBindings(){}scheduleOnce(callback,seconds){scheduled.push({callback,seconds});}onGuestLoginClicked(){guestCalls++;}onLoginClicked(){}openAccountDialog(){}closeAccountDialog(){}openSignUp(){}closeSignUp(){}sendRegistrationCode(){}confirmSignUp(){}}
 const root=new N('Canvas'),login=root.child('Login'),account=login.child('AccountLoginPanel');
 for(const name of ['AccountInput','PasswordInput'])account.child(name).addComponent(EditBox);
 for(const [parent,name] of [[account,'Btn_Login'],[login,'Btn_GuestLogin'],[login,'Btn_AccountLogin'],[account,'Btn_Back'],[account,'Btn_SignUp']])parent.child(name).addComponent(Button);
 const decorator=()=>()=>{};const cc={_decorator:{ccclass:decorator,property:decorator},Component,Node:N,Button,EditBox,director:{getScene:()=>root}};
 for(const name of ['Label','LabelOutline','RichText','Toggle','UITransform','Color','CCString','BlockInputEvents','ProgressBar','ResolutionPolicy','view','sys','assetManager'])cc[name]=class{};
 const imports={'cc':cc,'../Auth/LoginView':{LoginView},'./ClientBootstrap':{},'../../../Common/Code/Runtime/ui/LegacyFormManager':{},'../../../Common/Code/Runtime/ui/MsgDriftLifecycle':{},'../Auth/AooWeChatLoginController':{},'../../../Common/Code/Runtime/bootstrap/BootstrapRuntime':{},'../../../Common/Code/Runtime/platform/LegacyPlatformRuntime':{},'./LoadingEnvironmentPolicy':{},'../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator':{},'../../../Startup/Code/StartupPresentationView':{},'../../../Common/Code/Runtime/config/TrustedConfigurationDiscovery':{},'../../../Common/Code/Runtime/config/IndexedDbDiscoveryStateStore':{}};
 const sandbox={module:{exports:{}},URLSearchParams,Date,console:{info(){},warn(){},error(){}},location:{protocol:'http:',hostname:'localhost',port:'7456',search:'?aooPreviewBootstrap=1',...options.location},__aoo_RUNTIME_CONFIG__:{environment:options.environment??'test'},__aoo_LOCAL_PREVIEW_BOOTSTRAP_READY__:options.ready===undefined?true:options.ready};if(options.absentReady)delete sandbox.__aoo_LOCAL_PREVIEW_BOOTSTRAP_READY__;sandbox.require=name=>{assert.ok(name in imports,`unexpected import ${name}`);return imports[name];};vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})(require,module,module.exports);`,sandbox);
 const component=new sandbox.module.exports.LoginScreenBootstrap();component.node=root;component.services={auth:{}};
 return {component,scheduled,guestButton:login.getChildByName('Btn_GuestLogin'),guestCalls:()=>guestCalls};
}
test('actual mountLoginView successful exact daily preview schedules zero guest attempts',async()=>{const f=fixture();await f.component.mountLoginView();assert.equal(f.scheduled.length,0);assert.equal(f.guestCalls(),0);});
test('missing READY and false READY retain original other-test scheduling',async()=>{for(const options of [{ready:false},{absentReady:true}]){const f=fixture(options);await f.component.mountLoginView();assert.equal(f.scheduled.length,1);assert.equal(f.scheduled[0].seconds,2);}});
test('wrongcase flag, host, port or scheme do not broaden daily exclusion',async()=>{for(const location of [{search:'?aoopreviewbootstrap=1'},{search:'?aooPreviewBootstrap=0'},{search:''},{hostname:'127.0.0.1'},{port:'7460'},{protocol:'https:'}]){const f=fixture({location});await f.component.mountLoginView();assert.equal(f.scheduled.length,1);}});
test('original quad preview retains schedule even outside test environment',async()=>{for(const port of ['7458','7459','5188','7461']){const f=fixture({environment:'production',location:{port,search:''},ready:false});await f.component.mountLoginView();assert.equal(f.scheduled.length,1);}});
test('other test preview still executes original maximum8 interval loop',async()=>{const f=fixture({location:{port:'7462'}});await f.component.mountLoginView();for(let i=0;i<8;i++){const task=f.scheduled.shift();assert.ok(task);assert.equal(task.seconds,2);task.callback();}assert.equal(f.guestCalls(),8);assert.equal(f.scheduled.length,0);});
test('manual guest button remains bound on daily entry',async()=>{const f=fixture();await f.component.mountLoginView();assert.equal(f.scheduled.length,0);f.guestButton.emit('touch');assert.equal(f.guestCalls(),1);});
test('ordinary production outside quad has no automatic guests as before',async()=>{const f=fixture({environment:'production',location:{port:'7456',search:''},ready:false});await f.component.mountLoginView();assert.equal(f.scheduled.length,0);});
