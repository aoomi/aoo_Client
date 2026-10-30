/* GENERATED FILE. Source: explicit signed canonical identity registry. Do not hand edit. */
export type CanonicalIdentityRuntimeStatus = 'CONSUMABLE' | 'FAIL_CLOSED';

export interface CanonicalRuntimeMetadataBinding {
    readonly gameId: number;
    readonly gameCode: string;
    readonly family: string;
    readonly playVersion: string;
    readonly regionCode: string;
    readonly providerKey: string | null;
    readonly clientRuntimeEntry: string;
    readonly contractVersion: string | null;
    readonly status: CanonicalIdentityRuntimeStatus;
    readonly failureCodes: readonly string[];
}

export const CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256 = "a453cb986a674f0f6044a581f8e69927a4cfbf94f531567ef021dfaee07a8282" as const;
export const CANONICAL_RUNTIME_METADATA_RELEASE_EDITION = "r15-cd2999-20261012" as const;
export const CANONICAL_RUNTIME_METADATA_BINDINGS: readonly CanonicalRuntimeMetadataBinding[] = Object.freeze([
  Object.freeze({gameId:5,gameCode:"quanguo2998",family:"poker:betting",playVersion:"cn298-v1.0.0",regionCode:"GLOBAL",providerKey:"cn298-niuniu",clientRuntimeEntry:"cn298",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:9,gameCode:"quanguo2997",family:"poker:compare-hand",playVersion:"cn297-v1.0.0",regionCode:"GLOBAL",providerKey:"cn297-zjh",clientRuntimeEntry:"cn297-zjh",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:1001,gameCode:"chengdu1001",family:"mahjong:xue-zhan",playVersion:"chengdu1001-v1.0.0",regionCode:"CN-51-01",providerKey:"native-mahjong-family",clientRuntimeEntry:"chengdu1001",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2001,gameCode:"chengdu2001",family:"poker:pao-de-kuai",playVersion:"chengdu2001-v1.0.0",regionCode:"CN-51-01",providerKey:"native-pdk",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2002,gameCode:"neijiang2002",family:"poker:pao-de-kuai",playVersion:"neijiang2002-v1.0.0",regionCode:"CN-51-10",providerKey:"native-pdk-neijiang2002",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2003,gameCode:"liangshan2003",family:"poker:pao-de-kuai",playVersion:"liangshan2003-v1.0.0",regionCode:"CN-51-34",providerKey:"native-pdk-liangshan2003",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2004,gameCode:"mianning2004",family:"poker:pao-de-kuai",playVersion:"mianning2004-v1.0.0",regionCode:"CN-51-34-33",providerKey:"native-pdk-mianning2004",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2005,gameCode:"anyue2005",family:"poker:pao-de-kuai",playVersion:"anyue2005-v1.0.0",regionCode:"CN-51-20-21",providerKey:"native-pdk-anyue2005",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2006,gameCode:"panzhihua2006",family:"poker:pao-de-kuai",playVersion:"panzhihua2006-v1.0.0",regionCode:"CN-51-04",providerKey:"native-pdk-panzhihua2006",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2007,gameCode:"wannian2007",family:"poker:pao-de-kuai",playVersion:"wannian2007-v1.0.0",regionCode:"CN-36-11-29",providerKey:"native-pdk-wannian2007",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2008,gameCode:"leping2008",family:"poker:pao-de-kuai",playVersion:"leping2008-v1.0.0",regionCode:"CN-36-02-81",providerKey:"native-pdk-leping2008",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2009,gameCode:"bozhou2009",family:"poker:pao-de-kuai",playVersion:"bozhou2009-v1.0.0",regionCode:"CN-34-16",providerKey:"native-pdk-bozhou2009",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2010,gameCode:"yugan2010",family:"poker:pao-de-kuai",playVersion:"yugan2010-v1.0.0",regionCode:"CN-36-11-27",providerKey:"native-pdk-yugan2010",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2011,gameCode:"jian2011",family:"poker:pao-de-kuai",playVersion:"jian2011-v1.0.0",regionCode:"CN-36-08",providerKey:"native-pdk-jian2011",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2012,gameCode:"gushi2012",family:"poker:pao-de-kuai",playVersion:"gushi2012-v1.0.0",regionCode:"CN-41-15-25",providerKey:"native-pdk-gushi2012",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2013,gameCode:"xiaogan2013",family:"poker:pao-de-kuai",playVersion:"xiaogan2013-v1.0.0",regionCode:"CN-42-09",providerKey:"native-pdk-xiaogan2013",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2014,gameCode:"ningdu2014",family:"poker:pao-de-kuai",playVersion:"ningdu2014-v1.0.0",regionCode:"CN-36-07-30",providerKey:"native-pdk-ningdu2014",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2015,gameCode:"huaihua2015",family:"poker:pao-de-kuai",playVersion:"huaihua2015-v1.0.0",regionCode:"CN-43-12",providerKey:"native-pdk-huaihua2015",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2016,gameCode:"xinxian2016",family:"poker:pao-de-kuai",playVersion:"xinxian2016-v1.0.0",regionCode:"CN-41-15-23",providerKey:"native-pdk-xinxian2016",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2017,gameCode:"jingdezhen2017",family:"poker:pao-de-kuai",playVersion:"jingdezhen2017-v1.0.0",regionCode:"CN-36-02",providerKey:"native-pdk-jingdezhen2017",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2018,gameCode:"jiangsu2018",family:"poker:pao-de-kuai",playVersion:"jiangsu2018-v1.0.0",regionCode:"CN-32",providerKey:"native-pdk-jiangsu2018",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2019,gameCode:"henan2019",family:"poker:pao-de-kuai",playVersion:"henan2019-v1.0.0",regionCode:"CN-41",providerKey:"native-pdk-henan2019",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2020,gameCode:"taizhou2020",family:"poker:pao-de-kuai",playVersion:"taizhou2020-v1.0.0",regionCode:"CN-32-12",providerKey:"native-pdk-taizhou2020",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2021,gameCode:"huaibin2021",family:"poker:pao-de-kuai",playVersion:"huaibin2021-v1.0.0",regionCode:"CN-41-15-27",providerKey:"native-pdk-huaibin2021",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2022,gameCode:"huangchuan2022",family:"poker:pao-de-kuai",playVersion:"huangchuan2022-v1.0.0",regionCode:"CN-41-15-26",providerKey:"native-pdk-huangchuan2022",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2023,gameCode:"poyang2023",family:"poker:pao-de-kuai",playVersion:"poyang2023-v1.0.0",regionCode:"CN-36-11-28",providerKey:"native-pdk-poyang2023",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2024,gameCode:"jintan2024",family:"poker:pao-de-kuai",playVersion:"jintan2024-v1.0.0",regionCode:"CN-32-04-13",providerKey:"native-pdk-jintan2024",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2025,gameCode:"gaoan2025",family:"poker:pao-de-kuai",playVersion:"gaoan2025-v1.0.0",regionCode:"CN-36-09-83",providerKey:"native-pdk-gaoan2025",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2026,gameCode:"yixing2026",family:"poker:pao-de-kuai",playVersion:"yixing2026-v1.0.0",regionCode:"CN-32-02-82",providerKey:"native-pdk-yixing2026",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2027,gameCode:"xuancheng2027",family:"poker:pao-de-kuai",playVersion:"xuancheng2027-v1.0.0",regionCode:"CN-34-18",providerKey:"native-pdk-xuancheng2027",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2028,gameCode:"fuzhou2028",family:"poker:pao-de-kuai",playVersion:"fuzhou2028-v1.0.0",regionCode:"CN-36-10",providerKey:"native-pdk-fuzhou2028",clientRuntimeEntry:"common-pdk",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
  Object.freeze({gameId:2999,gameCode:"chengdu2999",family:"poker:cd299",playVersion:"cd299-v1.0.0",regionCode:"CN-51-01",providerKey:"cd299-native",clientRuntimeEntry:"cd299",contractVersion:"common-room-v1",status:"CONSUMABLE",failureCodes:Object.freeze([])}),
]);

const BY_GAME_ID = new Map(CANONICAL_RUNTIME_METADATA_BINDINGS.map(binding => [binding.gameId, binding]));

export interface CanonicalIdentityProjection {
    readonly serverDescriptor: CanonicalRuntimeMetadataBinding;
    readonly provider: CanonicalRuntimeMetadataBinding;
    readonly lobby: CanonicalRuntimeMetadataBinding;
    readonly gateway: CanonicalRuntimeMetadataBinding;
    readonly client: CanonicalRuntimeMetadataBinding;
}

export function requireCanonicalRuntimeMetadata(gameId: number, gameCode: string, family: string, playVersion: string, regionCode: string): CanonicalRuntimeMetadataBinding {
    if (gameId === 516) throw new Error('IDENTITY_CONTRACT_COMPATIBILITY_IDENTITY');
    const binding = BY_GAME_ID.get(gameId);
    if (!binding || binding.gameCode !== gameCode || binding.family !== family
        || binding.playVersion !== playVersion || binding.regionCode !== regionCode) {
        throw new Error('IDENTITY_CONTRACT_PROJECTION_MISMATCH gameId=' + gameId);
    }
    if (binding.status !== 'CONSUMABLE' || binding.providerKey === null || binding.contractVersion === null) {
        throw new Error('IDENTITY_CONTRACT_PROJECTION_FAIL_CLOSED gameId=' + gameId + ' reasons=' + binding.failureCodes.join(','));
    }
    return binding;
}

export function projectCanonicalIdentity(binding: CanonicalRuntimeMetadataBinding): CanonicalIdentityProjection {
    return Object.freeze({serverDescriptor: binding, provider: binding, lobby: binding, gateway: binding, client: binding});
}

export function assertCanonicalManifest(expectedSha256: string, expectedEdition: string): void {
    if (expectedSha256 !== CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256) throw new Error('IDENTITY_CONTRACT_MANIFEST_SHA_MISMATCH');
    if (expectedEdition !== CANONICAL_RUNTIME_METADATA_RELEASE_EDITION) throw new Error('IDENTITY_CONTRACT_MANIFEST_EDITION_MISMATCH');
}
