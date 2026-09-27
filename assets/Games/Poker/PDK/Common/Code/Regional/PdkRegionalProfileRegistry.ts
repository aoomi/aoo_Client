import{NJ201_PROFILE}from'../../../NJPDK/Code/NJ201RoomProfile';
import{LS201_PROFILE}from'../../../LSPDK/Code/LS201RoomProfile';
import{PDK_BUSINESS_CODES}from'./PdkBusinessCodes';
import{NEW_PDK_REGION_PROFILES}from'./LegacyPdkRegionProfile';
import type{PdkRegionalRoomProfile}from'./PdkRegionalRoomProfile';

const REGIONAL_PROFILES:Record<string,PdkRegionalRoomProfile<unknown>>={
 [PDK_BUSINESS_CODES.NEIJIANG]:NJ201_PROFILE as PdkRegionalRoomProfile<unknown>,
 [PDK_BUSINESS_CODES.LIANGSHAN]:LS201_PROFILE as PdkRegionalRoomProfile<unknown>
};
for(const profile of NEW_PDK_REGION_PROFILES){
 REGIONAL_PROFILES[profile.gameCode]=profile as PdkRegionalRoomProfile<unknown>;
}

export function resolvePdkRegionalProfile(gameCode:string):PdkRegionalRoomProfile<unknown>|null{
 return REGIONAL_PROFILES[gameCode.trim()]??null;
}
