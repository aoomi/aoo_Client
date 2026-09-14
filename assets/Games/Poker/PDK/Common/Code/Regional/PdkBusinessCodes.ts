/** Stable business identities for the single PDK family. */
export const PDK_BUSINESS_CODES={CHENGDU:'CD201',NEIJIANG:'NJ201',LIANGSHAN:'LS201'}as const;
export type PdkBusinessCode=typeof PDK_BUSINESS_CODES[keyof typeof PDK_BUSINESS_CODES];

const PDK_BUSINESS_CODE_SET:ReadonlySet<string>=new Set(Object.values(PDK_BUSINESS_CODES));
export function isPdkBusinessCode(value:string):value is PdkBusinessCode{
 return PDK_BUSINESS_CODE_SET.has(value);
}
