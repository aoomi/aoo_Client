/** Current production identities for the single PDK family. */
export const PDK_BUSINESS_CODES = {
 CHENGDU:'chengdu2001', NEIJIANG:'neijiang2002', LIANGSHAN:'liangshan2003',
 MIANNING:'mianning2004', ANYUE:'anyue2005', PANZHIHUA:'panzhihua2006',
 WANNIAN:'wannian2007', LEPING:'leping2008', BOZHOU:'bozhou2009', YUGAN:'yugan2010',
 JIAN:'jian2011', GUSHI:'gushi2012', XIAOGAN:'xiaogan2013', NINGDU:'ningdu2014',
 HUAIHUA:'huaihua2015', XINXIAN:'xinxian2016', JINGDEZHEN:'jingdezhen2017',
 JIANGSU:'jiangsu2018', HENAN:'henan2019', TAIZHOU:'taizhou2020', HUAIBIN:'huaibin2021',
 HUANGCHUAN:'huangchuan2022', POYANG:'poyang2023', JINTAN:'jintan2024', GAOAN:'gaoan2025',
 YIXING:'yixing2026', XUANCHENG:'xuancheng2027', FUZHOU:'fuzhou2028',
} as const;
export type PdkBusinessCode=typeof PDK_BUSINESS_CODES[keyof typeof PDK_BUSINESS_CODES];

/** 全部规范地区业务编码（既有三地 + 本阶段 25 地，插入顺序固定）。 */
export const PDK_BUSINESS_CODE_LIST:readonly string[]=Object.freeze(Object.values(PDK_BUSINESS_CODES));

/**
 * 当前 PDK 运行入口的 canonical play-version registry。
 *
 * `PdkLegacyRegionIdentities` 是规则档案集合，历史上只覆盖 25 个地区；它
 * 不能承担 28 个生产入口的生命周期能力握手。当前身份的版本合同由同一份
 * canonical business-code list 生成，禁止从 handoff 自报或旧别名推导。
 */
export const PDK_CANONICAL_PLAY_VERSIONS: Readonly<Record<string, string>> = Object.freeze(
 Object.fromEntries(PDK_BUSINESS_CODE_LIST.map(code => [code, `${code}-v1.0.0`])),
);

export function supportsPdkPlayVersion(gameCode:string, playVersion:string):boolean{
 const code=String(gameCode??'').trim().toLowerCase();
 const version=String(playVersion??'').trim();
 return Boolean(code && version && PDK_CANONICAL_PLAY_VERSIONS[code] === version);
}

const PDK_BUSINESS_CODE_SET:ReadonlySet<string>=new Set(Object.values(PDK_BUSINESS_CODES));
export function isPdkBusinessCode(value:string):value is PdkBusinessCode{
 return PDK_BUSINESS_CODE_SET.has(value);
}
