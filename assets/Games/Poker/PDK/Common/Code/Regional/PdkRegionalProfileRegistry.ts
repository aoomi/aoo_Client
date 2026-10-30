import{NEIJIANG2002_PROFILE}from'../../../NJPDK/Code/Neijiang2002RoomProfile';
import{LIANGSHAN2003_PROFILE}from'../../../LSPDK/Code/Liangshan2003RoomProfile';
import{PDK_BUSINESS_CODES}from'./PdkBusinessCodes';
import{NEW_PDK_REGION_PROFILES}from'./PdkLegacyRegionProfile';
import type{PdkRegionalRoomProfile}from'./PdkRegionalRoomProfile';

const REGIONAL_PROFILES:Record<string,PdkRegionalRoomProfile<unknown>>={
 [PDK_BUSINESS_CODES.NEIJIANG]:NEIJIANG2002_PROFILE as PdkRegionalRoomProfile<unknown>,
 [PDK_BUSINESS_CODES.LIANGSHAN]:LIANGSHAN2003_PROFILE as PdkRegionalRoomProfile<unknown>
};
for(const profile of NEW_PDK_REGION_PROFILES){
 REGIONAL_PROFILES[profile.gameCode]=profile as PdkRegionalRoomProfile<unknown>;
}

export function resolvePdkRegionalProfile(gameCode:string):PdkRegionalRoomProfile<unknown>|null{
 return REGIONAL_PROFILES[gameCode.trim()]??null;
}
