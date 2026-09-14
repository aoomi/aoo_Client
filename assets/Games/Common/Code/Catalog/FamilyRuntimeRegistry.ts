export type GameplayFamilyId='long-card:regional'|'mahjong:lai-zi'|'mahjong:standard'|'mahjong:tui-dao-hu'|'mahjong:xue-liu'|'mahjong:xue-zhan'|'poker:510k'|'poker:betting'|'poker:climbing'|'poker:compare-hand'|'poker:generic-card-round'|'poker:landlord'|'poker:pao-de-kuai'|'poker:trick-taking'|'word-card:pao-hu-zi';
export interface FamilyTransport{request<T>(message:string,payload:unknown):Promise<T>;}
export interface FamilySnapshot{gameCode:string;stateVersion:number;phase?:string;[key:string]:unknown;}
export interface FamilySchema{readonly family:GameplayFamilyId;readonly routePrefix:'longcard'|'mahjong'|'poker'|'wordcard';readonly phases:readonly string[];readonly actions:readonly string[];}
export interface GameCapabilities{readonly supportsSettings:boolean;readonly supportsChat:boolean;readonly supportsVoice:boolean;readonly supportsDissolve:boolean;}
export interface RegionRuntimeBinding{readonly code:string;readonly family:GameplayFamilyId|'UNCLASSIFIED_MISSING_SOURCE';readonly regionConfig:string;readonly gameId?:number;readonly displayName?:string;readonly category?:'MAHJONG'|'POKER'|'LONG_CARD'|'WORD_CARD';readonly enabled?:boolean;}

/** Intent transport only. Legality, win detection and scoring remain server authoritative. */
export abstract class FamilyGameplayAdapter<S extends FamilySnapshot=FamilySnapshot>{private sequence=0;private current?:S;constructor(private readonly wire:FamilyTransport,private readonly roomId:number,readonly binding:RegionRuntimeBinding,readonly schema:FamilySchema){if(!Number.isInteger(roomId)||roomId<=0)throw Error('invalid room');if(binding.family!==schema.family)throw Error('family binding mismatch');}snapshot(){return this.current;}state(seatId=0){return this.intent(seatId,'state',{});}reconnect(seatId=0){return this.intent(seatId,'reconnect',{});}join(seatId:number){return this.intent(seatId,'join',{});}ready(seatId:number){return this.intent(seatId,'ready',{});}start(){return this.intent(0,'start',{});}act(seatId:number,action:string,payload:Readonly<Record<string,unknown>>={}){if(!this.schema.actions.includes(action))throw Error(`unsupported ${this.schema.family} action`);return this.intent(seatId,action,payload);}protected async intent(seatId:number,action:string,payload:Readonly<Record<string,unknown>>){const value=await this.wire.request<unknown>(`${this.schema.routePrefix}.${this.binding.code}.dispatch`,{roomId:this.roomId,sequence:++this.sequence,seatId,action,payload});if(!value||typeof value!=='object')throw Error('invalid family response');const snapshot=value as S;if(snapshot.gameCode!==this.binding.code||!Number.isInteger(snapshot.stateVersion)||(snapshot.phase!==undefined&&!this.schema.phases.includes(snapshot.phase)))throw Error('mismatched family response');if(this.current&&snapshot.stateVersion<this.current.stateVersion)return this.current;return this.current=snapshot;}}

const lobby=['LOBBY','WAITING_EX','PLAYING','SETTLED']as const;
const cardRound=['LOBBY','DEALING','PLAYING','SETTLED']as const;
const mahjongActions=['draw','discard','chi','peng','gang','hu','pass','choice','timeout']as const;
const pokerActions=['deal','play','pass','bet','raise','compare','trustee','timeout']as const;
const longCardActions=['draw','play','chi','peng','wei','pao','hu','pass','timeout']as const;
export const FAMILY_RUNTIME_SCHEMAS={
 'long-card:regional':{family:'long-card:regional',routePrefix:'longcard',phases:lobby,actions:longCardActions},
 'mahjong:lai-zi':{family:'mahjong:lai-zi',routePrefix:'mahjong',phases:lobby,actions:mahjongActions},
 'mahjong:standard':{family:'mahjong:standard',routePrefix:'mahjong',phases:lobby,actions:mahjongActions},
 'mahjong:tui-dao-hu':{family:'mahjong:tui-dao-hu',routePrefix:'mahjong',phases:lobby,actions:mahjongActions},
 'mahjong:xue-liu':{family:'mahjong:xue-liu',routePrefix:'mahjong',phases:lobby,actions:mahjongActions},
 'mahjong:xue-zhan':{family:'mahjong:xue-zhan',routePrefix:'mahjong',phases:lobby,actions:mahjongActions},
 'poker:510k':{family:'poker:510k',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:betting':{family:'poker:betting',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:climbing':{family:'poker:climbing',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:compare-hand':{family:'poker:compare-hand',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:generic-card-round':{family:'poker:generic-card-round',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:landlord':{family:'poker:landlord',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:pao-de-kuai':{family:'poker:pao-de-kuai',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'poker:trick-taking':{family:'poker:trick-taking',routePrefix:'poker',phases:cardRound,actions:pokerActions},
 'word-card:pao-hu-zi':{family:'word-card:pao-hu-zi',routePrefix:'wordcard',phases:lobby,actions:longCardActions}
}as const satisfies Record<GameplayFamilyId,FamilySchema>;

export class LongCardRegionalFamilyAdapter extends FamilyGameplayAdapter{}
export class MahjongLaiZiFamilyAdapter extends FamilyGameplayAdapter{}
export class MahjongStandardFamilyAdapter extends FamilyGameplayAdapter{}
export class MahjongTuiDaoHuFamilyAdapter extends FamilyGameplayAdapter{}
export class MahjongXueLiuFamilyAdapter extends FamilyGameplayAdapter{}
export class MahjongXueZhanFamilyAdapter extends FamilyGameplayAdapter{}
export class Poker510KFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerBettingFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerClimbingFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerCompareHandFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerGenericCardRoundFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerLandlordFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerPaoDeKuaiFamilyAdapter extends FamilyGameplayAdapter{}
export class PokerTrickTakingFamilyAdapter extends FamilyGameplayAdapter{}
export class WordCardPaoHuZiFamilyAdapter extends FamilyGameplayAdapter{}

export const FAMILY_ADAPTERS={
 'long-card:regional':LongCardRegionalFamilyAdapter,'mahjong:lai-zi':MahjongLaiZiFamilyAdapter,'mahjong:standard':MahjongStandardFamilyAdapter,'mahjong:tui-dao-hu':MahjongTuiDaoHuFamilyAdapter,'mahjong:xue-liu':MahjongXueLiuFamilyAdapter,'mahjong:xue-zhan':MahjongXueZhanFamilyAdapter,'poker:510k':Poker510KFamilyAdapter,'poker:betting':PokerBettingFamilyAdapter,'poker:climbing':PokerClimbingFamilyAdapter,'poker:compare-hand':PokerCompareHandFamilyAdapter,'poker:generic-card-round':PokerGenericCardRoundFamilyAdapter,'poker:landlord':PokerLandlordFamilyAdapter,'poker:pao-de-kuai':PokerPaoDeKuaiFamilyAdapter,'poker:trick-taking':PokerTrickTakingFamilyAdapter,'word-card:pao-hu-zi':WordCardPaoHuZiFamilyAdapter
}as const;

export class FamilyRuntimeRegistry{private readonly byCode=new Map<string,RegionRuntimeBinding>();register(binding:RegionRuntimeBinding){if(this.byCode.has(binding.code))throw Error(`duplicate family runtime ${binding.code}`);if(binding.family==='UNCLASSIFIED_MISSING_SOURCE')throw Error(`blocked missing-source runtime ${binding.code}`);this.byCode.set(binding.code,Object.freeze({...binding}));return this;}resolve(code:string){return this.byCode.get(code);}all(){return Object.freeze([...this.byCode.values()]);}}
