import{requireChoice,requireIntegerRange,uniqueChoices}from'../../Common/Code/Regional/PdkRegionalRoomProfile';
import type{PdkRegionalRoomProfile,PdkRoomRulePayload}from'../../Common/Code/Regional/PdkRegionalRoomProfile';
import{PDK_BUSINESS_CODES}from'../../Common/Code/Regional/PdkBusinessCodes';

export type NeijiangPlayRule='three_no_attachment'|'four_with_two'|'triple_ace_bomb'|'remove_three_four'|'require_spade_three'|'four_threes_direct_win';
export type PdkRoomRestriction='ip_limit'|'gps_limit'|'timeout_auto_play'|'distance_warning'|'interaction_forbidden'|'chat_muted';
export interface NeijiangPdkRoomInput{
 playerCount:2|3;roundCount:8|12|16;operationTime:number;
 firstPlayRule:'winner_first'|'spade_three_first';bombScore:5|10|20|30;
 playRule:readonly NeijiangPlayRule[];roomRestriction:readonly PdkRoomRestriction[];
}
const PLAY:readonly NeijiangPlayRule[]=['three_no_attachment','four_with_two','triple_ace_bomb','remove_three_four','require_spade_three','four_threes_direct_win'];
const RESTRICTIONS:readonly PdkRoomRestriction[]=['ip_limit','gps_limit','timeout_auto_play','distance_warning','interaction_forbidden','chat_muted'];

export const NEIJIANG2002_PROFILE:PdkRegionalRoomProfile<NeijiangPdkRoomInput>={
 gameId:2002,gameCode:PDK_BUSINESS_CODES.NEIJIANG,displayName:'内江跑得快',family:'poker:pao-de-kuai',
 provinceCode:'sichuan',cityCode:'neijiang',xqpArea:6,xqpGameType:5,
 providerKey:`native-pdk-${PDK_BUSINESS_CODES.NEIJIANG}`,commonRuntime:'PDK/Common',
 roomRuleWorkbook:'开房规则表/跑得快/内江跑得快.xlsx',
 toImmutableRules(input):PdkRoomRulePayload{return{
  playerCount:requireChoice(input.playerCount,[2,3],'playerCount'),
  roundCount:requireChoice(input.roundCount,[8,12,16],'roundCount'),
  operationTime:requireIntegerRange(input.operationTime,1,3600,'operationTime'),
  firstPlayRule:requireChoice(input.firstPlayRule,['winner_first','spade_three_first'],'firstPlayRule'),
  bombScore:requireChoice(input.bombScore,[5,10,20,30],'bombScore'),
  playRule:uniqueChoices(input.playRule,PLAY,'playRule'),
  roomRestriction:uniqueChoices(input.roomRestriction,RESTRICTIONS,'roomRestriction')
 };}
};
