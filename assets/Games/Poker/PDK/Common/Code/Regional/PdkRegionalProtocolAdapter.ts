import type{CommonPdkRuntime}from'../Runtime/CommonPdkRuntime';
import type{PdkRegionalRoomProfile,PdkRoomRulePayload}from'./PdkRegionalRoomProfile';

/** Thin regional envelope; all state projection and game behavior remain in CommonPdkRuntime. */
export class PdkRegionalProtocolAdapter<Input>{
 public constructor(protected readonly runtime:CommonPdkRuntime,
  public readonly profile:PdkRegionalRoomProfile<Input>){}

 public createRoomRules(input:Input):PdkRoomRulePayload{return this.profile.toImmutableRules(input);}

 protected dispatch<T>(action:string,payload:Readonly<Record<string,unknown>>,key=action):Promise<T>{
  return this.runtime.action<T>(`${this.profile.gameCode}:${key}`,
   `poker.${this.profile.gameCode}.dispatch`,{action,payload});
 }
}
