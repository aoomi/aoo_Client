import { isValid, Node } from 'cc';
import { SpectatorGateway, type SpectatorAdmission } from './SpectatorGateway';

/** The only UI adapter for spectator lifecycle and delayed public increments. */
export class SpectatorController {
  private roomId=0;private cursor=0;private generation=0;private timer:ReturnType<typeof setTimeout>|null=null;private readonly listeners:Array<()=>void>=[];
  public constructor(private readonly node:Node,private readonly gateway:SpectatorGateway,private readonly error:(e:unknown)=>void){}
  public install(){this.on('legacy-spectator-request',v=>void this.request(v));this.on('legacy-spectator-authorize',v=>void this.authorize(v));this.on('legacy-spectator-join',v=>void this.join(v));this.on('legacy-spectator-leave',()=>void this.leave());this.on('legacy-spectator-pending',v=>void this.pending(v));}
  public destroy(){this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null;if(isValid(this.node,true)&&(this.node as unknown as {_eventProcessor?:unknown})._eventProcessor)for(const off of this.listeners.splice(0))off();else this.listeners.length=0;this.gateway.destroy();}
  private async request(v:unknown){try{const room=this.id(v,'roomId');const admission=await this.gateway.request(room);this.node.emit('legacy-spectator-requested',admission);}catch(e){this.error(e);}}
  private async pending(v:unknown){try{this.node.emit('legacy-spectator-pending-updated',await this.gateway.pending(this.id(v,'roomId')));}catch(e){this.error(e);}}
  private async authorize(v:unknown){try{const p=this.record(v);const admission=await this.gateway.authorize(Number(p.requestId),p.approved===true);this.node.emit('legacy-spectator-authorized',admission);}catch(e){this.error(e);}}
  private async join(v:unknown){const g=++this.generation;try{const p=this.record(v);const admission=await this.awaitAuthorization(Number(p.requestId),g);if(g!==this.generation)return;if(admission.status!=='AUTHORIZED')throw new Error('spectator request rejected');this.roomId=admission.roomId;const snapshot=await this.gateway.snapshot(this.roomId);if(g!==this.generation)return;this.cursor=snapshot.publicTimeline.nextSequence;this.node.emit('legacy-spectator-joined',snapshot);this.poll(g);}catch(e){if(g===this.generation)this.error(e);}}
  private async awaitAuthorization(requestId:number,g:number):Promise<SpectatorAdmission>{for(let i=0;i<60&&g===this.generation;i++){const a=await this.gateway.status(requestId);if(a.status!=='PENDING')return a;await new Promise(r=>setTimeout(r,1000));}throw new Error('spectator authorization timeout');}
  private poll(g:number){this.timer=setTimeout(async()=>{if(g!==this.generation||!this.roomId)return;try{const stream=await this.gateway.events(this.roomId,this.cursor);if(g!==this.generation)return;this.cursor=stream.nextSequence;for(const event of stream.events)this.node.emit('legacy-spectator-event',event);this.poll(g);}catch(e){if(g===this.generation){this.error(e);this.poll(g);}}},1000);}
  private async leave(){const room=this.roomId;this.generation++;this.roomId=0;if(this.timer)clearTimeout(this.timer);try{if(room)this.node.emit('legacy-spectator-left',await this.gateway.leave(room));}catch(e){this.error(e);}}
  private on(name:string,fn:(v:unknown)=>void){this.node.on(name,fn);this.listeners.push(()=>this.node.off(name,fn));}
  private record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object')throw new Error('spectator payload required');return v as Record<string,unknown>;}
  private id(v:unknown,key:string){const n=Number(this.record(v)[key]);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${key} invalid`);return n;}
}
