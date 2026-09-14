export type RealNameStatus = 'UNSUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export interface IdentityStatus { realNameStatus: RealNameStatus; maskedName: string; maskedIdNumber: string; phoneVerified: boolean; maskedPhone: string; updatedAt: string | null; }
export interface PhoneChallenge { challengeId: string; expiresAt: string; retryAfterSeconds: number; }
export interface PhoneCredential { credential: string; expiresAt: string; maskedPhone: string; }
export interface IdentityTransport { request<T>(path: string, init: { method: 'GET'|'POST'; headers: Record<string,string>; body?: string }): Promise<{code:string;data:T}>; }

/** Network-only identity flow. It deliberately has no storage dependency and never retains raw form values. */
export class IdentityVerificationClient {
  public constructor(private readonly transport: IdentityTransport) {}
  public async status(): Promise<IdentityStatus> { return (await this.transport.request<IdentityStatus>('/api/v2/identity-verification/status',{method:'GET',headers:this.headers()})).data; }
  public async submitRealName(legalName: string,idNumber: string,idempotencyKey=IdentityVerificationClient.key()): Promise<IdentityStatus> {
    try{return (await this.transport.request<IdentityStatus>('/api/v2/identity-verification/real-name/submissions',{method:'POST',headers:this.headers(idempotencyKey),body:JSON.stringify({legalName,idNumber})})).data;}finally{legalName='';idNumber='';}
  }
  public async sendPhone(phone: string,idempotencyKey=IdentityVerificationClient.key()): Promise<PhoneChallenge> {
    try{return (await this.transport.request<PhoneChallenge>('/api/v2/identity-verification/phone/challenges',{method:'POST',headers:this.headers(idempotencyKey),body:JSON.stringify({phone})})).data;}finally{phone='';}
  }
  public async verifyPhone(challengeId:string,code:string,idempotencyKey=IdentityVerificationClient.key()): Promise<PhoneCredential> {
    try{return (await this.transport.request<PhoneCredential>('/api/v2/identity-verification/phone/challenges/verify',{method:'POST',headers:this.headers(idempotencyKey),body:JSON.stringify({challengeId,code})})).data;}finally{code='';}
  }
  private headers(idempotencyKey?:string):Record<string,string>{const h:Record<string,string>={'X-Aoo-Api-Version':'1','Content-Type':'application/json'};if(idempotencyKey)h['Idempotency-Key']=idempotencyKey;return h;}
  private static key():string{return `identity-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
}
