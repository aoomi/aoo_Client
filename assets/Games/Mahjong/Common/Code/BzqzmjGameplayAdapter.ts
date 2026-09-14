import{BozhouMahjongFamilyAdapter,type BozhouTransport}from'./BozhouMahjongFamilyAdapter';

export interface BzqzmjTransport extends BozhouTransport{}
export type BzqzmjOption=0|1|2|3|4;
export interface BzqzmjRuleSelections{playerMinNum:2|3|4;playerNum:2|3|4;setCount:number;paymentRoomCardType:0|1|2;zhangzhuang:-1|0|1|2;kexuanwanfa:readonly BzqzmjOption[];fangjian:readonly number[];xianShi:0|1|2|3|4;jiesan:0|1|2|3|4;gaoji:readonly number[];shuffleSeed?:number;}
export type BzqzmjPhase='LOBBY'|'WAITING_EX'|'PLAYING'|'SETTLED';
export interface BzqzmjSnapshot{readonly roomId:number;readonly gameCode:'bzqzmj';readonly stateVersion:number;readonly phase:BzqzmjPhase;readonly choiceSeat:number;readonly zhangZhuang:readonly number[];readonly baoTing:readonly boolean[];readonly wildcard:47;readonly wallReserve:14;readonly createRules:Readonly<BzqzmjRuleSelections>;readonly[field:string]:unknown;}

function validatedRules(rules:BzqzmjRuleSelections){const rise=rules.kexuanwanfa.includes(0);if(rise&&rules.zhangzhuang<0||!rise&&rules.zhangzhuang!==-1)throw Error('zhangzhuang must match ZhangZhuang option');return rules;}

/** Thin binding: 'mahjong.bzqzmj.dispatch' / 'mahjong.bzqzmj.response'; v.stateVersion<this.current.stateVersion is owned by the family adapter. */
export class BzqzmjGameplayAdapter extends BozhouMahjongFamilyAdapter<BzqzmjSnapshot,BzqzmjRuleSelections>{constructor(wire:BzqzmjTransport,roomId:number,rules:BzqzmjRuleSelections){super(wire,roomId,validatedRules(rules),{code:'bzqzmj',version:'bzqzmj-native-1',phases:['LOBBY','WAITING_EX','PLAYING','SETTLED'],freezeRules:r=>Object.freeze({...r,kexuanwanfa:Object.freeze([...r.kexuanwanfa]),fangjian:Object.freeze([...r.fangjian]),gaoji:Object.freeze([...r.gaoji])}),validate:v=>v.wildcard===47&&v.wallReserve===14&&Array.isArray(v.baoTing)});}zhangZhuang(value:-1|0|1|2){return this.send(0,'zhangZhuang',{value});}baoTing(seatId:number){return this.send(seatId,'baoTing',{});}}
