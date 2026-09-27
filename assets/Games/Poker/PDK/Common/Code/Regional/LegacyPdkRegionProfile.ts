import{pdkProvinceSlugOf}from'./PdkRegionalRoomProfile';
import type{PdkRegionalRoomProfile,PdkRoomRulePayload,PdkRoomRuleValue}from'./PdkRegionalRoomProfile';
import{NEW_PDK_REGION_IDENTITIES}from'./LegacyPdkRegionIdentities';
import type{PdkRegionIdentity}from'./LegacyPdkRegionIdentities';

/** 房间规则草稿：键值必须落在该地区已发布的稳定协议值集合内。 */
export type PdkRegionRuleInput=Readonly<Record<string,PdkRoomRuleValue|undefined>>;

function assertPublished(identity:PdkRegionIdentity,key:string,value:PdkRoomRuleValue):void{
 const published=identity.publishedValues[key];
 if(!published)throw new Error(`${identity.code} has no published option ${key}`);
 if(!published.some(candidate=>candidate===value)){
  throw new Error(`${key} contains an unpublished option for ${identity.code}`);
 }
}

/**
 * 族 A（22 个 legacy 等价地区）与族 B/C/D（冕宁/安岳/攀枝花）共用的**唯一**地区档案实现。
 * 地区差异只来自已发布身份与值集（identity），本函数不含任何地区分支。
 */
export function createPdkRegionProfile(identity:PdkRegionIdentity):PdkRegionalRoomProfile<PdkRegionRuleInput>{
 const provinceCode=pdkProvinceSlugOf(identity.regionCode);
 const roomRuleWorkbook=identity.workbookPath.replace(/^Client\/docs\//,'');
 const publishedFieldKeys:readonly string[]=Object.freeze(Object.keys(identity.publishedValues).sort());
 return Object.freeze({
  gameId:identity.gameId,
  gameCode:identity.code,
  displayName:identity.displayName,
  family:'poker:pao-de-kuai' as const,
  provinceCode,
  providerKey:`native-pdk-${identity.code}`,
  commonRuntime:'PDK/Common' as const,
  roomRuleWorkbook,
  variantCode:identity.variantCode,
  publishedFieldKeys,
  toImmutableRules(input:PdkRegionRuleInput):PdkRoomRulePayload{
   const rules:Record<string,PdkRoomRuleValue>={};
   for(const key of Object.keys(input)){
    const value=input[key];
    if(value===undefined)continue;
    if(Array.isArray(value))value.forEach(item=>assertPublished(identity,key,item));
    else assertPublished(identity,key,value);
    rules[key]=value;
   }
   return Object.freeze(rules);
  }
 });
}

/** 25 个新地区的地区档案（族 A 与族 B/C/D 同一份实现）。 */
export const NEW_PDK_REGION_PROFILES:readonly PdkRegionalRoomProfile<PdkRegionRuleInput>[]=
 Object.freeze(NEW_PDK_REGION_IDENTITIES.map(createPdkRegionProfile));

export function resolveNewPdkRegionProfile(gameCode:string):PdkRegionalRoomProfile<PdkRegionRuleInput>|null{
 const code=gameCode.trim();
 return NEW_PDK_REGION_PROFILES.find(profile=>profile.gameCode===code)??null;
}
