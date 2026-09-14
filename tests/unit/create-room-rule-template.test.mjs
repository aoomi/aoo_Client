import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const prefab=JSON.parse(read('assets/Modules/CreateRoom/Prefab/CreateRoom.prefab'));
const nodes=prefab.map((item,index)=>({item,index})).filter(({item})=>item?.__type__==='cc.Node');
const named=name=>nodes.find(({item})=>item._name===name);
const child=(parent,name)=>parent.item._children.map(ref=>({item:prefab[ref.__id__],index:ref.__id__})).find(({item})=>item?._name===name);
const component=(entry,type)=>entry.item._components.map(ref=>prefab[ref.__id__]).find(item=>item?.__type__===type);

test('user maintained TemplateRoot exposes the single runtime rule contract',()=>{
 const rules=named('Rules'); const template=child(rules,'TemplateRoot'); assert.ok(template);
 for(const name of ['Label','RadioOption','CheckboxOption','Divider']) assert.ok(child(template,name),name);
 assert.equal(component(child(template,'RadioOption'),'cc.UITransform')._contentSize.width,180);
 assert.equal(component(child(template,'CheckboxOption'),'cc.UITransform')._contentSize.width,180);
 assert.ok(component(template,'cc.UITransform')._contentSize.height>0);
});

test('presenter clones only TemplateRoot and inherits template geometry',()=>{
 const source=read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
 for(const token of ["getChildByName('TemplateRoot')","instantiate(this.templateRoot)","getChildByName('Label')","getChildByName('RadioOption')","getChildByName('CheckboxOption')",'prototype.getComponent(UITransform)?.width','this.templateRoot.active = false','this.content.active = true']) assert.ok(source.includes(token),token);
 assert.doesNotMatch(source,/assetManager|loadBundle|Create_Room_Radio_Option|Create_Room_Checkbox_Option/);
 assert.match(source,/category\.position\.y/);
});

test('presenter wraps every fifth option and expands each rule from template geometry',()=>{
 const source=read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
 assert.match(source,/MAX_OPTIONS_PER_VISUAL_ROW = 4/);
 assert.match(source,/index % MAX_OPTIONS_PER_VISUAL_ROW/);
 assert.match(source,/Math\.floor\(index \/ MAX_OPTIONS_PER_VISUAL_ROW\)/);
 assert.match(source,/Math\.ceil\(optionCount \/ MAX_OPTIONS_PER_VISUAL_ROW\)/);
 assert.match(source,/templateTransform\.height \* visualRows/);
 assert.match(source,/addedHeight \* \(1 - rowTransform\.anchorY\)/);
 assert.match(source,/category\.position\.y \+ firstLineOffset/);
 assert.match(source,/divider\.position\.y \+ firstLineOffset - addedHeight/);
 assert.doesNotMatch(source,/170|55/);
});

test('create-room rules use the single native unified scroll policy',()=>{
 const presenter=read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
 const scroll=read('assets/Common/Code/UI/UnifiedScroll.ts');
 assert.match(presenter,/UnifiedScroll\.ensure\(scrollNode\)/);
 assert.match(scroll,/view\.inertia = DEFAULT_SCROLL_POLICY\.inertia/);
 assert.match(scroll,/view\.elastic = this\.elastic/);
 assert.match(scroll,/view\.bounceDuration = this\.bounceDuration/);
 assert.match(scroll,/contentTransform\.height <= viewport\.height/);
 assert.match(scroll,/UNDERFILLED_DRAG_LIMIT_RATIO/);
 assert.match(scroll,/tween\(content\)\.to\(this\.bounceDuration/);
 assert.doesNotMatch(presenter,/bounceDuration|\.brake\s*=|EDGE_DAMPING/);
});

test('global wheel routing and nested touch controls use the unified ScrollView',()=>{
 const scroll=read('assets/Common/Code/UI/UnifiedScroll.ts');
 assert.match(scroll,/isNestedControlTarget\(event\.target\)/);
 assert.match(scroll,/input\.on\(Input\.EventType\.MOUSE_WHEEL, UnifiedScroll\.onGlobalMouseWheel/);
 assert.match(scroll,/input\.off\(Input\.EventType\.MOUSE_WHEEL, UnifiedScroll\.onGlobalMouseWheel/);
 assert.doesNotMatch(scroll,/_registerEventDispatcher|priorityWheelDispatcher/);
 assert.match(scroll,/private static readonly instances = new Set<UnifiedScroll>\(\)/);
 assert.doesNotMatch(scroll,/\[\.\.\.UnifiedScroll\.instances\]|\.sort\(UnifiedScroll\.compareFrontmost\)/);
 assert.match(scroll,/view\.scrollToOffset\(this\.scrollOffset/);
 for(const handler of ['_onTouchBegan','_onTouchMoved','_onTouchEnded','_onTouchCancelled']) assert.match(scroll,new RegExp(`\\.${handler}\\(event\\)`),handler);
 assert.match(scroll,/while \(node && node !== this\.node\)/);
 assert.match(scroll,/node\.getComponent\(ViewGroup\)/);
 assert.match(scroll,/viewportTransform\?\.hitTest\(event\.getLocation\(\)\)/);
 assert.match(scroll,/this\.nestedTouchActive/);
 assert.match(scroll,/contentTransform\.height > viewport\.height/);
 assert.match(scroll,/bounceUnderfilledWheel\(event\)/);
 assert.match(scroll,/this\.scheduleOnce\(this\.finishWheelBounce/);
 assert.match(scroll,/Tween\.stopAllByTarget\(content\)/);
});

test('controller uses current prefab paths and one authoritative Hall create chain',()=>{
 const source=read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
 assert.match(source,/RULES_PATH = 'Rules'/); assert.match(source,/Top\/Btn_Close/); assert.match(source,/Bottom\/Btn_Create/);
 assert.match(source,/Left\/FavoriteList\/ScrollView\/Viewport\/Content/);
 assert.doesNotMatch(source,/MainPanel\/Actions|MainPanel\/RulesPanel|MainPanel\/FavoriteList/);
 assert.match(source,/this\.gateway\.configuration\(game\)/);
 assert.match(source,/this\.gateway\.create\(selectedGame\.gameCode, submittedRules/);
 assert.match(source,/this\.renderGames\(orderedGames, selected\)/);
 assert.match(source,/return game\.displayName\.trim\(\)/);
 assert.doesNotMatch(source,/\? '跑得快'/);
 assert.match(source,/baseScore: this\.baseScore/);
 assert.match(source,/Node\.EventType\.TOUCH_END/); assert.match(source,/Node\.EventType\.MOUSE_UP/);
 assert.match(source,/now - lastPointerAt < 250/);
 assert.doesNotMatch(source,/popup\/btn_(?:close|create_room)|MainPanel\/Header|selectCity|selectRegion|legacy-data|CBaseCreateRoom/);
});
