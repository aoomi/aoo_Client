import{PdkRegionalProtocolAdapter}from'../../Common/Code/Regional/PdkRegionalProtocolAdapter';
import type{CommonPdkRuntime}from'../../Common/Code/Runtime/CommonPdkRuntime';
import{NJ201_PROFILE}from'./NJ201RoomProfile';
import type{NeijiangPdkRoomInput}from'./NJ201RoomProfile';

export class NJ201Adapter extends PdkRegionalProtocolAdapter<NeijiangPdkRoomInput>{
 public constructor(runtime:CommonPdkRuntime){super(runtime,NJ201_PROFILE);}
}
