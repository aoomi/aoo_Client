import { ProductionApiClient } from '../../../Common/Code/Runtime/Activity/ProductionApiClient';

export type SupportCaseStatus = 'OPEN'|'IN_REVIEW'|'RESOLVED'|'REJECTED'|'WITHDRAWN';
export interface SupportEvidence { type:'REPLAY'|'ADMIN_CASE'|'URL'; referenceId:string; label:string }
export interface SupportCase { id:number; kind:'REPORT'|'APPEAL'|'TICKET'; subject:string; description:string; status:SupportCaseStatus; resolutionSummary?:string; evidence:SupportEvidence[]; updatedAt:string; version:number }

/** Support module's sole player-case transport, sharing the authenticated HTTP boundary. */
export class SupportCaseClient {
    public constructor(private readonly api:ProductionApiClient) {}
    public list(limit=50):Promise<SupportCase[]>{return this.api.get('/api/v2/support/cases',{limit});}
    public get(id:number):Promise<SupportCase>{return this.api.get(`/api/v2/support/cases/${id}`);}
    public create(kind:SupportCase['kind'],subject:string,description:string,evidence:SupportEvidence[]=[]):Promise<SupportCase>{
        return this.api.mutate('POST','/api/v2/support/cases',{kind,subject,description,evidence},ProductionApiClient.operationKey('support-case-create'));
    }
    public withdraw(id:number,version:number):Promise<SupportCase>{return this.api.mutate('POST',`/api/v2/support/cases/${id}/withdraw`,{version},ProductionApiClient.operationKey('support-case-withdraw'));}
}
