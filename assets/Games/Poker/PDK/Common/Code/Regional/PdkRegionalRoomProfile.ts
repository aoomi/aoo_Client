export type PdkRoomRuleValue=string|number|boolean|ReadonlyArray<string|number>;
export type PdkRoomRulePayload=Readonly<Record<string,PdkRoomRuleValue>>;

export interface PdkRegionalRoomProfile<Input>{
 readonly gameId:number;
 readonly gameCode:string;
 readonly displayName:string;
 readonly family:'poker:pao-de-kuai';
 readonly provinceCode:'sichuan';
 readonly cityCode:string;
 readonly xqpArea:number;
 readonly xqpGameType:5;
 readonly providerKey:string;
 readonly commonRuntime:'PDK/Common';
 readonly roomRuleWorkbook:string;
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
