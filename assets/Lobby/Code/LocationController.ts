import { Node, sys } from 'cc';
import { LocationGateway } from '../../Common/Code/Runtime/Location/LocationGateway';

export class LocationController {
    private generation = 0;

    public constructor(
        private readonly node: Node,
        private readonly gateway: LocationGateway,
        private readonly reportError: (error: unknown) => void,
    ) {}

    public async open(): Promise<void> {
        const generation = ++this.generation;
        try {
            if (!navigator.geolocation) throw new Error('当前设备不支持定位');
            await this.gateway.authorization('GRANTED');
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 8_000,
                    maximumAge: 30_000,
                });
            });
            if (generation !== this.generation) return;
            const data = await this.gateway.signals({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracyMeters: position.coords.accuracy,
                capturedAt: new Date(position.timestamp).toISOString(),
                authorization: 'GRANTED',
            });
            if (generation !== this.generation) return;
            sys.localStorage.setItem('aoo.location.consent', 'granted');
            this.node.emit('legacy-location-updated', data);
        } catch (error) {
            if (generation === this.generation) this.reportError(error);
        }
    }

    public destroy(): void {
        this.generation += 1;
    }
}
