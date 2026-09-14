import { sys } from 'cc';
import { legacyPlatformBridge } from './LegacyPlatformBridge';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export interface LegacyAnalyticsEvent {
    name: string;
    values?: Record<string, string | number | boolean>;
}

export class LegacyAnalyticsService {
    private accountId = '';

    public setAccount(accountId: string, level?: number): void {
        this.accountId = accountId;
        this.track({ name: 'account', values: { accountId, level: level ?? 0 } });
    }

    public track(event: LegacyAnalyticsEvent): void {
        if (!event.name) return;
        const payload = { accountId: this.accountId, ...event.values };
        legacyPlatformEvents.emit('legacy-analytics', { name: event.name, ...payload });
        if (sys.isNative) {
            legacyPlatformBridge.callLegacy('trackEvent', {
                eventName: event.name,
                eventData: JSON.stringify(payload),
            });
        }
    }

    public beginMission(id: string | number): void { this.track({ name: 'mission-begin', values: { id: String(id) } }); }
    public completeMission(id: string | number): void { this.track({ name: 'mission-complete', values: { id: String(id) } }); }
    public failMission(id: string | number, reason: string): void { this.track({ name: 'mission-failed', values: { id: String(id), reason } }); }
    public chargeRequested(orderId: string, item: string, amount: number): void {
        this.track({ name: 'charge-request', values: { orderId, item, amount } });
    }
    public chargeSucceeded(orderId: string, item: string, amount: number): void {
        this.track({ name: 'charge-success', values: { orderId, item, amount } });
    }
    public reward(amount: number, reason: string): void { this.track({ name: 'reward', values: { amount, reason } }); }
}

export const legacyAnalyticsService = new LegacyAnalyticsService();
