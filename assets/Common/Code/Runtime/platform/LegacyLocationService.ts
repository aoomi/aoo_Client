import { sys } from 'cc';
import { legacyPlatformBridge } from './LegacyPlatformBridge';
import { legacyPlatformEvents } from './LegacyPlatformEvents';

export interface LegacyLocation {
    address: string;
    latitude: number;
    longitude: number;
    state: 0 | 1 | 2;
}

export class LegacyLocationService {
    private lastRequestAt = 0;
    private current: LegacyLocation | null = null;
    private disposers: Array<() => void> = [];

    public start(): void {
        if (this.disposers.length > 0) return;
        this.disposers.push(legacyPlatformEvents.on('GETLOCATION', (data) => this.accept(data)));
        this.disposers.push(legacyPlatformEvents.on('OnGetLocationForBaiduMapCallBack', (data) => {
            legacyPlatformBridge.callLegacy('StopLocationForBaiduMap');
            this.accept(data);
        }));
        this.restore();
    }

    public stop(): void {
        this.disposers.splice(0).forEach((dispose) => dispose());
    }

    public request(): boolean {
        const now = Date.now();
        if (now - this.lastRequestAt < 3000) return false;
        this.lastRequestAt = now;
        if (!sys.isNative) {
            legacyPlatformEvents.emit('EVT_DingWei', { state: 2, reason: 'web-unsupported' });
            return false;
        }
        return legacyPlatformBridge.requestLocation();
    }

    public requestBaiduFallback(): boolean {
        if (!sys.isNative) return false;
        legacyPlatformBridge.callLegacy('GetLocationForBaiduMap');
        return true;
    }

    public getCurrent(): LegacyLocation | null {
        return this.current ? { ...this.current } : null;
    }

    private accept(data: Record<string, unknown>): void {
        const state = Number(data.state) as 0 | 1 | 2;
        const failed = state === 1 || state === 2 || (data.mapType === 'baiduMap' && data.Address === undefined);
        this.current = failed ? {
            address: '', latitude: 0, longitude: 0, state: state === 2 ? 2 : 1,
        } : {
            address: `${String(data.City ?? '')}${String(data.District ?? '')}`,
            latitude: Number(data.Latitude) || 0,
            longitude: Number(data.Longitude) || 0,
            state: 0,
        };
        sys.localStorage.setItem('myLocation', JSON.stringify({
            MyAddress: this.current.address,
            MyLatitudeEx: this.current.latitude,
            MyLongitudeEx: this.current.longitude,
        }));
        legacyPlatformEvents.emit('EVT_DingWei', { ...this.current });
        legacyPlatformEvents.emit('legacy-location-result', { ...this.current, isGetError: failed });
    }

    private restore(): void {
        try {
            const raw = sys.localStorage.getItem('myLocation');
            if (!raw) return;
            const data = JSON.parse(raw) as Record<string, unknown>;
            this.current = {
                address: String(data.MyAddress ?? ''),
                latitude: Number(data.MyLatitudeEx) || 0,
                longitude: Number(data.MyLongitudeEx) || 0,
                state: 0,
            };
        } catch {
            sys.localStorage.removeItem('myLocation');
        }
    }
}

export const legacyLocationService = new LegacyLocationService();
