import{NJ201_PROFILE}from'../../../NJPDK/Code/NJ201RoomProfile';
import{LS201_PROFILE}from'../../../LSPDK/Code/LS201RoomProfile';
import{PDK_BUSINESS_CODES}from'./PdkBusinessCodes';
import type{PdkRegionalRoomProfile}from'./PdkRegionalRoomProfile';

const REGIONAL_PROFILES:Readonly<Record<string,PdkRegionalRoomProfile<unknown>>>={
 [PDK_BUSINESS_CODES.NEIJIANG]:NJ201_PROFILE as PdkRegionalRoomProfile<unknown>,
 [PDK_BUSINESS_CODES.LIANGSHAN]:LS201_PROFILE as PdkRegionalRoomProfile<unknown>
};

export function resolvePdkRegionalProfile(gameCode:string):PdkRegionalRoomProfile<unknown>|null{
 return REGIONAL_PROFILES[gameCode.trim()]??null;
}
