import{PdkRegionalProtocolAdapter}from'../../Common/Code/Regional/PdkRegionalProtocolAdapter';
import type{CommonPdkRuntime}from'../../Common/Code/Runtime/CommonPdkRuntime';
import{LS201_PROFILE}from'./LS201RoomProfile';
import type{LiangshanPdkRoomInput}from'./LS201RoomProfile';

export class LS201Adapter extends PdkRegionalProtocolAdapter<LiangshanPdkRoomInput>{
 public constructor(runtime:CommonPdkRuntime){super(runtime,LS201_PROFILE);}
 public competeDealer(compete:boolean):Promise<unknown>{
  return this.dispatch('robDealer',{compete},`robDealer:${compete}`);
 }
}
