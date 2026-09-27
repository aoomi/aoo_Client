import{EXISTING_PDK_BUSINESS_CODES}from'./PdkBusinessCodes';
import{NEW_PDK_REGION_PROFILES,resolveNewPdkRegionProfile}from'./LegacyPdkRegionProfile';
import type{PdkProvinceCode,PdkRegionalRoomProfile}from'./PdkRegionalRoomProfile';
import type{PdkRegionRuleInput}from'./LegacyPdkRegionProfile';

/** 与 FamilyRuntimeRegistry.RegionRuntimeBinding 对齐的跑得快地区运行期绑定。 */
export interface PdkRegionalRuntimeBinding{
 readonly code:string;
 readonly family:'poker:pao-de-kuai';
 readonly regionConfig:string;
 readonly gameId:number;
 readonly displayName:string;
 readonly provinceCode:PdkProvinceCode;
 readonly variantCode:string|null;
 readonly publishedFieldKeys:readonly string[];
}

export const PDK_REGION_CONFIG_PREFIX='CONFIG:';

export function pdkRegionConfigKeyOf(profile:PdkRegionalRoomProfile<PdkRegionRuleInput>):string{
 return `${PDK_REGION_CONFIG_PREFIX}${profile.gameCode}@${profile.provinceCode}`;
}

export function toPdkRegionalRuntimeBinding(
 profile:PdkRegionalRoomProfile<PdkRegionRuleInput>
):PdkRegionalRuntimeBinding{
 if(!profile.provinceCode)throw new Error(`${profile.gameCode} has no published province identity`);
 return Object.freeze({
  code:profile.gameCode,
  family:profile.family,
  regionConfig:pdkRegionConfigKeyOf(profile),
  gameId:profile.gameId,
  displayName:profile.displayName,
  provinceCode:profile.provinceCode,
  variantCode:profile.variantCode??null,
  publishedFieldKeys:profile.publishedFieldKeys??Object.freeze([])
 });
}

/** 25 个新地区的运行期绑定（地区档案的唯一装配点）。 */
export const NEW_PDK_REGIONAL_RUNTIME_BINDINGS:readonly PdkRegionalRuntimeBinding[]=Object.freeze(
 NEW_PDK_REGION_PROFILES.map(toPdkRegionalRuntimeBinding)
);

export function resolvePdkRegionalRuntimeBinding(gameCode:string):PdkRegionalRuntimeBinding|null{
 const code=gameCode.trim();
 if(EXISTING_PDK_BUSINESS_CODES.includes(code))return null;
 return NEW_PDK_REGIONAL_RUNTIME_BINDINGS.find(binding=>binding.code===code)??null;
}

export function resolvePdkRegionProfile(gameCode:string):PdkRegionalRoomProfile<PdkRegionRuleInput>|null{
 return resolveNewPdkRegionProfile(gameCode);
}

/** 族 A 的 6 个变体分组（同一份实现，仅已发布值集不同）。 */
export function legacyPdkVariantGroups():Readonly<Record<string,readonly string[]>>{
 const groups:Record<string,string[]>={};
 for(const profile of NEW_PDK_REGION_PROFILES){
  const variant=profile.variantCode;
  if(!variant)continue;
  (groups[variant]??=[]).push(profile.gameCode);
 }
 return Object.freeze(groups);
}
