import{FamilyGameplayAdapter,FAMILY_RUNTIME_SCHEMAS,type FamilySnapshot,type FamilyTransport,type GameplayFamilyId,type RegionRuntimeBinding}from'../../../Common/Code/Catalog/FamilyRuntimeRegistry';

export type MahjongLifecycle='standard-direct'|'waiting-ex-sequential'|'discard-response-multiwinner';
export interface MahjongRegionStrategy{readonly family:Extract<GameplayFamilyId,`mahjong:${string}`>;readonly lifecycle:MahjongLifecycle;readonly extraActions:readonly string[];}
export const MAHJONG_GAMEPLAY_FAMILY_STRATEGIES={
 'mahjong:lai-zi':{family:'mahjong:lai-zi',lifecycle:'standard-direct',extraActions:[]},
 'mahjong:standard':{family:'mahjong:standard',lifecycle:'standard-direct',extraActions:[]},
 'mahjong:tui-dao-hu':{family:'mahjong:tui-dao-hu',lifecycle:'waiting-ex-sequential',extraActions:['choice','timeout']},
 'mahjong:xue-liu':{family:'mahjong:xue-liu',lifecycle:'discard-response-multiwinner',extraActions:['hu','pass','timeout']},
 'mahjong:xue-zhan':{family:'mahjong:xue-zhan',lifecycle:'discard-response-multiwinner',extraActions:['hu','pass','timeout']}
}as const satisfies Record<Extract<GameplayFamilyId,`mahjong:${string}`>,MahjongRegionStrategy>;

abstract class MahjongLifecycleAdapter<S extends FamilySnapshot=FamilySnapshot> extends FamilyGameplayAdapter<S>{constructor(wire:FamilyTransport,roomId:number,binding:RegionRuntimeBinding){super(wire,roomId,binding,FAMILY_RUNTIME_SCHEMAS[binding.family as keyof typeof FAMILY_RUNTIME_SCHEMAS]);}draw(seat:number){return this.act(seat,'draw');}discard(seat:number,tile:number){return this.act(seat,'discard',{tile});}chi(seat:number,consumedTiles:readonly number[]){return this.act(seat,'chi',{consumedTiles:[...consumedTiles]});}peng(seat:number,consumedTiles:readonly number[]){return this.act(seat,'peng',{consumedTiles:[...consumedTiles]});}gang(seat:number,consumedTiles:readonly number[],concealed=false){return this.act(seat,'gang',{consumedTiles:[...consumedTiles],concealed});}hu(seat:number,tile=0){return this.act(seat,'hu',{tile});}pass(seat:number){return this.act(seat,'pass');}}
export class MahjongStandardDirectAdapter<S extends FamilySnapshot=FamilySnapshot> extends MahjongLifecycleAdapter<S>{}
export class MahjongWaitingExSequentialAdapter<S extends FamilySnapshot=FamilySnapshot> extends MahjongLifecycleAdapter<S>{choice(seat:number,value:unknown){return this.act(seat,'choice',{value});}timeout(seat=0){return this.act(seat,'timeout');}}
export class MahjongDiscardResponseAdapter<S extends FamilySnapshot=FamilySnapshot> extends MahjongLifecycleAdapter<S>{timeout(){return this.act(0,'timeout');}}
