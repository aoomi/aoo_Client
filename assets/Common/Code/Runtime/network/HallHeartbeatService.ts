import { game, Game } from 'cc';
import type { ProtocolTransport } from './StableTransportFacade';

export class HallHeartbeatService {
    private static readonly INTERVAL_MS = 15000;
    private static readonly TIMEOUT_MS = 5000;
    private readonly disposers: Array<() => void> = [];
    private timer = 0;
    private lastActivity = 0;
    private hiddenAt = 0;
    private requestInFlight = false;
    private consecutiveFailures = 0;

    public constructor(private readonly client: ProtocolTransport, private readonly unhealthy: () => void) {}

    public start(): void {
        this.stop();
        this.lastActivity = Date.now();
        this.disposers.push(
            this.client.onActivity(() => { this.lastActivity = Date.now(); }),
        );
        game.on(Game.EVENT_HIDE, this.handleHide, this);
        game.on(Game.EVENT_SHOW, this.handleShow, this);
        this.timer = globalThis.setInterval(() => void this.sendHeartbeat(), HallHeartbeatService.INTERVAL_MS);
    }

    public stop(): void {
        for (const dispose of this.disposers.splice(0)) dispose();
        game.off(Game.EVENT_HIDE, this.handleHide, this);
        game.off(Game.EVENT_SHOW, this.handleShow, this);
        if (this.timer) globalThis.clearInterval(this.timer);
        this.timer = 0;
        this.hiddenAt = 0;
        this.requestInFlight = false;
        this.consecutiveFailures = 0;
    }

    private async sendHeartbeat(): Promise<void> {
        if (this.hiddenAt || this.requestInFlight || !this.client.isConnected()) return;
        this.requestInFlight = true;
        try {
            await this.client.request('gateway.heartbeat', { clientTime: Date.now() }, HallHeartbeatService.TIMEOUT_MS);
            this.lastActivity = Date.now();
            this.consecutiveFailures = 0;
        } catch {
            this.consecutiveFailures += 1;
            if (this.consecutiveFailures >= 2) {
                this.consecutiveFailures = 0;
                this.unhealthy();
            }
        } finally {
            this.requestInFlight = false;
        }
    }

    private handleHide(): void {
        this.hiddenAt = Date.now();
    }

    private handleShow(): void {
        if (this.hiddenAt && Date.now() > this.hiddenAt + HallHeartbeatService.INTERVAL_MS) {
            void this.sendHeartbeat();
        }
        this.hiddenAt = 0;
        this.lastActivity = Date.now();
    }
}
