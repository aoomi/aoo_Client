import{requireChoice,requireIntegerRange,uniqueChoices}from'../../Common/Code/Regional/PdkRegionalRoomProfile';
import type{PdkRegionalRoomProfile,PdkRoomRulePayload}from'../../Common/Code/Regional/PdkRegionalRoomProfile';
import{PDK_BUSINESS_CODES}from'../../Common/Code/Regional/PdkBusinessCodes';

export type LiangshanPlayRule='compare_attachments'|'triple_with_one'|'four_with_two'|'four_ace_rank'|'all_special_patterns'|'four_aces'|'four_configured_rank'|'all_single'|'full_consecutive_pairs'|'all_big'|'all_small'|'all_red'|'all_black'|'full_straight'|'all_pair';
export type LiangshanRoomRestriction='ip_limit'|'gps_limit'|'timeout_auto_play'|'distance_warning'|'interaction_forbidden'|'chat_muted';
export interface LiangshanPdkRoomInput{
 playerCount:2|3|4;roundCount:8|12|16;operationTime:number;dealCardCount:8|10;
 jinHuaScore:1|2|3|4|5|'no_compare';
 robDealerRule:'dealer_first'|'dealer_last'|'first_round_no_compete'|'no_compete';
 playRule:readonly LiangshanPlayRule[];roomRestriction:readonly LiangshanRoomRestriction[];
}
const PLAY:readonly LiangshanPlayRule[]=['compare_attachments','triple_with_one','four_with_two','four_ace_rank','all_special_patterns','four_aces','four_configured_rank','all_single','full_consecutive_pairs','all_big','all_small','all_red','all_black','full_straight','all_pair'];
const RESTRICTIONS:readonly LiangshanRoomRestriction[]=['ip_limit','gps_limit','timeout_auto_play','distance_warning','interaction_forbidden','chat_muted'];

export const LS201_PROFILE:PdkRegionalRoomProfile<LiangshanPdkRoomInput>={
 gameId:90005,gameCode:PDK_BUSINESS_CODES.LIANGSHAN,displayName:'凉山跑得快',family:'poker:pao-de-kuai',
 provinceCode:'sichuan',cityCode:'liangshan',xqpArea:9,xqpGameType:5,
 providerKey:'native-pdk-LS201',commonRuntime:'PDK/Common',
 roomRuleWorkbook:'开房规则表/跑得快/凉山跑得快.xlsx',
 settlementSpecialHands:{
  bundleName:'paodekuai-liangshan',atlasPath:'Atlas/PdkSmallTrends',
  frameByPattern:{FOUR_ACES:'img_sza',FOUR_CONFIGURED_RANK_5:'img_sz5',FOUR_CONFIGURED_RANK_7:'img_sz7',ALL_SINGLES:'img_qdan',
   FULL_STRAIGHT:'img_qlian',FULL_CONSECUTIVE_PAIRS:'img_qld',ALL_PAIRS:'img_qdui',
   ALL_BLACK:'img_qhei',ALL_RED:'img_qhong',ALL_BIG:'img_qda',ALL_SMALL:'img_qxiao'}
 },
 toImmutableRules(input):PdkRoomRulePayload{return{
  playerCount:requireChoice(input.playerCount,[2,3,4],'playerCount'),
  roundCount:requireChoice(input.roundCount,[8,12,16],'roundCount'),
  operationTime:requireIntegerRange(input.operationTime,1,3600,'operationTime'),
  dealCardCount:requireChoice(input.dealCardCount,[8,10],'dealCardCount'),
  jinHuaScore:requireChoice(input.jinHuaScore,[1,2,3,4,5,'no_compare'],'jinHuaScore'),
  robDealerRule:requireChoice(input.robDealerRule,['dealer_first','dealer_last','first_round_no_compete','no_compete'],'robDealerRule'),
  playRule:uniqueChoices(input.playRule,PLAY,'playRule'),
  roomRestriction:uniqueChoices(input.roomRestriction,RESTRICTIONS,'roomRestriction')
 };}
};

export const DEFAULT_LS201_RULES:LiangshanPdkRoomInput={playerCount:2,roundCount:8,
 operationTime:15,dealCardCount:8,jinHuaScore:1,robDealerRule:'no_compete',
 playRule:[],roomRestriction:[]};
