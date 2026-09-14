import { ProductionApiClient } from '../Activity/ProductionApiClient';
export interface FriendRequest { id:number;requesterId:number;recipientId:number;status:string;createdAt:string; }
export interface Friend { accountId:number;state:'ONLINE'|'AWAY'|'OFFLINE';roomId?:number|null;lastSeenAt?:string|null; }
export interface NotificationItem { id:number;recipientId:number;type:string;payload:string;createdAt:string; }
export interface NotificationFeed { items:NotificationItem[];nextCursor:number;readCursor:number; }
export interface MailItem { id:number;recipientId:number;subject:string;body:string;createdAt:string; }
export interface MailFeed { items:MailItem[];nextCursor:number;readCursor:number; }
export interface NoticeItem { id:number;title:string;content:string;startsAt:string;endsAt:string;updatedAt:string; }
export interface RedDotSummary { mail:number;notification:number;notice:number;total:number; }
/** Sole player-facing friend/notification transport; never emits legacy family/social packets. */
export class SocialGateway {
 public constructor(private readonly api:ProductionApiClient){}
 public request(recipientId:number):Promise<FriendRequest>{return this.mutate('friendRequest',{recipientId});}
 public accept(requestId:number):Promise<FriendRequest>{return this.mutate('friendAccept',{requestId});}
 public reject(requestId:number):Promise<FriendRequest>{return this.mutate('friendReject',{requestId});}
 public friends():Promise<Friend[]>{return this.query('friendList');}
 public requests():Promise<FriendRequest[]>{return this.query('friendRequests');}
 public setPresence(state:Friend['state'],roomId?:number,visibility:'FRIENDS'|'NOBODY'='FRIENDS'):Promise<{updated:boolean}>{return this.mutate('presenceSet',{state,roomId,visibility});}
 public notifications(cursor:number,limit=50):Promise<NotificationFeed>{return this.api.mutate('POST','/api/v2/notifications',{action:'list',cursor,limit},ProductionApiClient.operationKey(`notification-list:${cursor}`));}
 public read(cursor:number):Promise<{readCursor:number}>{return this.api.mutate('POST','/api/v2/notifications',{action:'read',cursor},ProductionApiClient.operationKey(`notification-read:${cursor}`));}
 public mails(cursor:number,limit=50):Promise<MailFeed>{return this.api.mutate('POST','/api/v2/mail',{action:'list',cursor,limit},ProductionApiClient.operationKey(`mail-list:${cursor}`));}
 public mailDetail(mailId:number):Promise<MailItem>{return this.api.mutate('POST','/api/v2/mail',{action:'detail',mailId},ProductionApiClient.operationKey(`mail-detail:${mailId}`));}
 public readMail(cursor:number):Promise<{readCursor:number}>{return this.api.mutate('POST','/api/v2/mail',{action:'read',cursor},ProductionApiClient.operationKey(`mail-read:${cursor}`));}
 public notices(cursor:number,limit=50):Promise<{items:NoticeItem[];nextCursor:number;readCursor:number}>{return this.api.mutate('POST','/api/v2/notices',{action:'list',cursor,limit},ProductionApiClient.operationKey(`notice-list:${cursor}`));}
 public readNotices(cursor:number):Promise<{readCursor:number}>{return this.api.mutate('POST','/api/v2/notices',{action:'read',cursor},ProductionApiClient.operationKey(`notice-read:${cursor}`));}
 public redDots():Promise<RedDotSummary>{return this.api.mutate('POST','/api/v2/red-dots',{action:'summary'},ProductionApiClient.operationKey('red-dot-summary'));}
 private query<T>(action:string):Promise<T>{return this.api.mutate('POST','/api/v2/social',{action},ProductionApiClient.operationKey(`social:${action}`));}
 private mutate<T>(action:string,fields:Record<string,unknown>):Promise<T>{return this.api.mutate('POST','/api/v2/social',{action,...fields},ProductionApiClient.operationKey(`social:${action}`));}
}
