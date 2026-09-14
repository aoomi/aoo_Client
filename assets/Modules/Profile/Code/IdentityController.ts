import { Button, EditBox, isValid, Node } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { IdentityVerificationClient, type IdentityTransport } from '../../../Common/Code/Runtime/Identity/IdentityVerificationClient';
import { ProductionApiClient, type ProductionApiConfig } from '../../../Common/Code/Runtime/Activity/ProductionApiClient';

export class IdentityController {
    private readonly client: IdentityVerificationClient;
    private readonly api: ProductionApiClient;
    private readonly disposers: Array<() => void> = [];
    private generation = 0; private busy = false; private challengeId = '';
    public constructor(private readonly forms: LegacyFormManager, private readonly node: Node, token: string, playerId: string, private readonly fail: (e:unknown)=>void) {
        const cfg=(globalThis as typeof globalThis&{__aoo_RUNTIME_CONFIG__?:ProductionApiConfig}).__aoo_RUNTIME_CONFIG__;
        this.api=new ProductionApiClient(token,playerId,8000,cfg?.identityHttpUrl);
        const transport:IdentityTransport={request:async<T>(path:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string})=>({code:'OK',data:init.method==='GET'?await this.api.get<T>(path):await this.api.mutate<T>('POST',path,init.body?JSON.parse(init.body):{},init.headers['Idempotency-Key'])})};
        this.client=new IdentityVerificationClient(transport);
    }
    public async openRealName():Promise<void>{const g=++this.generation;const form=await this.forms.show('UILobbyRealName');if(g!==this.generation||!form)return;this.bind(form,'btn_tijiao',()=>void this.submitRealName(form));try{const status=await this.client.status();if(g!==this.generation)return;this.node.emit('aoo-identity-status',status);}catch(e){this.unavailable(g,e);}}
    public async openPhone():Promise<void>{const g=++this.generation;const form=await this.forms.show('UILobbyPhoneBind');if(g!==this.generation||!form)return;this.bind(form,'Phone/EditBox/VerificationCode/Code',()=>void this.sendPhone(form));this.bind(form,'Phone/Confirm',()=>void this.verifyPhone(form));this.bind(form,'Popup/Tag/Close',()=>this.forms.closeAfterPointer('UILobbyPhoneBind'));try{const status=await this.client.status();if(g!==this.generation)return;this.node.emit('aoo-identity-status',status);}catch(e){this.unavailable(g,e);}}
    public destroy():void{this.generation++;if(isValid(this.node,true)&&(this.node as unknown as{_eventProcessor?:unknown})._eventProcessor)for(const d of this.disposers.splice(0))d();else this.disposers.length=0;this.api.destroy();this.challengeId='';}
    private async submitRealName(f:LegacyForm):Promise<void>{if(this.busy)return;const name=this.input(f,'EditBoxName'),id=this.input(f,'EditBoxIDCard');await this.run(async()=>{const s=await this.client.submitRealName(name,id);this.clear(f,'EditBoxName','EditBoxIDCard');this.node.emit('aoo-real-name-updated',s);});}
    private async sendPhone(f:LegacyForm):Promise<void>{if(this.busy)return;const phone=this.inputAny(f,['Phone/EditBox/Phone/EditBox','EditBoxPhone','edit_phone','phone']);await this.run(async()=>{const c=await this.client.sendPhone(phone);this.challengeId=c.challengeId;this.clear(f,'Phone/EditBox/Phone/EditBox','EditBoxPhone','edit_phone','phone');this.node.emit('aoo-phone-challenge',c);});}
    private async verifyPhone(f:LegacyForm):Promise<void>{if(this.busy)return;const code=this.inputAny(f,['Phone/EditBox/VerificationCode/EditBox','EditBoxCode','edit_code','code']);await this.run(async()=>{if(!this.challengeId)throw new Error('请先获取验证码');const c=await this.client.verifyPhone(this.challengeId,code);this.challengeId='';this.clear(f,'Phone/EditBox/VerificationCode/EditBox','EditBoxCode','edit_code','code');this.node.emit('aoo-phone-verified',c);});}
    private async run(fn:()=>Promise<void>):Promise<void>{this.busy=true;try{await fn();}catch(e){this.report(e);}finally{this.busy=false;}}
    private bind(f:LegacyForm,name:string,fn:()=>void):void{const n=this.find(f.node,name);if(!n)return;n.on(Button.EventType.CLICK,fn);this.disposers.push(()=>n.isValid&&n.off(Button.EventType.CLICK,fn));}
    private input(f:LegacyForm,name:string):string{const value=this.find(f.node,name)?.getComponent(EditBox)?.string.trim()??'';if(!value)throw new Error('请完整填写身份信息');return value;}
    private inputAny(f:LegacyForm,names:string[]):string{for(const n of names){const e=this.find(f.node,n)?.getComponent(EditBox);if(e?.string.trim())return e.string.trim();}throw new Error('请完整填写手机号或验证码');}
    private clear(f:LegacyForm,...names:string[]):void{for(const n of names){const e=this.find(f.node,n)?.getComponent(EditBox);if(e)e.string='';}}
    private find(root:Node,name:string):Node|null{if(name.includes('/'))return root.getChildByPath(name);if(root.name===name)return root;for(const c of root.children){const v=this.find(c,name);if(v)return v;}return null;}
    private unavailable(generation:number,error:unknown):void{if(generation===this.generation)this.node.emit('aoo-identity-status-unavailable',error);}
    private report(e:unknown):void{this.node.emit('aoo-identity-error',e);this.fail(e);}
}
