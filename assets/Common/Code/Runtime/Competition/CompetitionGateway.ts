import { ProductionApiClient } from '../Activity/ProductionApiClient';

export type MatchState = 'IDLE'|'WAITING'|'MATCHED'|'PENDING_CONFIRM'|'CONFIRMED'|'CANCELLED'|'TIMED_OUT'|'EXPIRED';
export interface MatchSnapshot { state:MatchState;gameId:number;matchId?:number;roomId?:number;route?:string;expiresAt?:string;confirmDeadline?:string;confirmed?:boolean; }
export interface Tournament { tournamentId:number;gameId:number;name:string;phase:'REGISTRATION'|'GROUPED'|'RUNNING'|'COMPLETED';status:'NOT_REGISTERED'|'REGISTERED'|'WITHDRAWN'|'ADVANCED';group?:number|null;seed?:number|null;score:number;rank?:number|null; }
export interface CompetitionEvent { eventId:number;type:string;payload:Record<string,unknown>;createdAt:string; }

/** Sole authenticated client entry for matchmaking and tournament authority. */
export class CompetitionGateway {
  public constructor(private readonly api:ProductionApiClient) {}
  public queue(gameId:number,timeoutSeconds=120):Promise<MatchSnapshot>{return this.api.mutate('POST','/api/v2/matchmaking',{action:'queue',gameId,timeoutSeconds},ProductionApiClient.operationKey('match-queue'));}
  public cancel(gameId:number):Promise<MatchSnapshot>{return this.api.mutate('POST','/api/v2/matchmaking',{action:'cancel',gameId},ProductionApiClient.operationKey('match-cancel'));}
  public confirm(matchId:number):Promise<MatchSnapshot>{return this.api.mutate('POST','/api/v2/matchmaking',{action:'confirm',matchId},ProductionApiClient.operationKey('match-confirm'));}
  public status(gameId:number):Promise<MatchSnapshot>{return this.api.get('/api/v2/matchmaking',{gameId});}
  public tournaments():Promise<Tournament[]>{return this.api.get('/api/v2/tournaments');}
  public register(tournamentId:number):Promise<Tournament>{return this.api.mutate('POST','/api/v2/tournaments',{action:'register',tournamentId},ProductionApiClient.operationKey('tournament-register'));}
  public withdraw(tournamentId:number):Promise<Tournament>{return this.api.mutate('POST','/api/v2/tournaments',{action:'withdraw',tournamentId},ProductionApiClient.operationKey('tournament-withdraw'));}
  public events(after:number):Promise<CompetitionEvent[]>{return this.api.get('/api/v2/competition/events',{after});}
}
