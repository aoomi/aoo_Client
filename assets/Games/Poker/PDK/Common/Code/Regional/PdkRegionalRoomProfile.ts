export type PdkRoomRuleValue=string|number|boolean|ReadonlyArray<string|number>;
export type PdkRoomRulePayload=Readonly<Record<string,PdkRoomRuleValue>>;

/** 已发布目录身份里实际出现的省份（ISO 3166-2 省份段 → slug）。 */
export type PdkProvinceCode='anhui'|'henan'|'hubei'|'hunan'|'jiangsu'|'jiangxi'|'sichuan';
export const PDK_PROVINCE_SLUGS:Readonly<Record<string,PdkProvinceCode>>={
 'CN-51':'sichuan','CN-36':'jiangxi','CN-34':'anhui','CN-41':'henan',
 'CN-42':'hubei','CN-43':'hunan','CN-32':'jiangsu'
};
export function pdkProvinceSlugOf(regionCode:string):PdkProvinceCode{
 const isoCode=regionCode.trim().split('-').slice(0,2).join('-');
 const slug=PDK_PROVINCE_SLUGS[isoCode];
 if(!slug)throw new Error(`${regionCode} is not a published PDK province`);
 return slug;
}

export interface PdkSettlementSpecialHandsProfile{
 readonly bundleName:string;
 readonly atlasPath:string;
 readonly frameByPattern:Readonly<Record<string,string>>;
}

export interface PdkRegionalRoomProfile<Input>{
 readonly gameId:number;
 readonly gameCode:string;
 readonly displayName:string;
 readonly family:'poker:pao-de-kuai';
 readonly provinceCode:PdkProvinceCode;
 readonly cityCode?:string;
 readonly xqpArea?:number;
 readonly xqpGameType?:5;
 readonly providerKey:string;
 readonly commonRuntime:'PDK/Common';
 readonly roomRuleWorkbook:string;
 readonly variantCode?:string|null;
 readonly publishedFieldKeys?:readonly string[];
 readonly settlementSpecialHands?:PdkSettlementSpecialHandsProfile;
 toImmutableRules(input:Input):PdkRoomRulePayload;
}

export function requireChoice<T extends string|number>(value:T,choices:readonly T[],key:string):T{
 if(!choices.includes(value))throw new Error(`${key} is not a published option`);
 return value;
}

export function requireIntegerRange(value:number,min:number,max:number,key:string):number{
 if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${key} must be an integer between ${min} and ${max}`);
 return value;
}

export function uniqueChoices<T extends string>(values:readonly T[],choices:readonly T[],key:string):readonly T[]{
 const selected=[...new Set(values)];
 if(selected.some(value=>!choices.includes(value)))throw new Error(`${key} contains an unpublished option`);
 return selected;
}
