import { isValid, Node } from 'cc';
import type { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { InventoryGateway } from '../../../Common/Code/Runtime/Inventory/InventoryGateway';

export class StoreController {
    private readonly disposers: Array<() => void> = [];

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly node: Node,
        private readonly api: InventoryGateway,
        private readonly reportError: (error: unknown) => void,
    ) {}

    public install(): void {
        this.listen('legacy-store-purchase', value => { void this.purchase(value); });
        this.listen('legacy-store-redeem', value => { void this.redeem(value); });
    }

    public async open(tab?: string): Promise<void> {
        // Page navigation is local and must not be blocked by a catalog outage.
        // Optional hydration failure is exposed as state, not as a failed open.
        const form = await this.forms.show('UIStore', { tab }, tab);
        if (!form) return;
        try {
            const [catalog, inventory, offers] = await Promise.all([
                this.api.catalog(),
                this.api.inventory(),
                this.api.offers(),
            ]);
            const data = { catalog, inventory, offers, tab };
            form.node.emit('legacy-store-loaded', data);
            this.node.emit('legacy-store-loaded', data);
        } catch (error: unknown) {
            // The shop shell remains usable for local navigation even when its
            // optional catalog service is not deployed in the current gateway.
            // Purchase and redemption failures still use reportError below.
            form.node.emit('legacy-store-unavailable', { error, tab });
            this.node.emit('legacy-store-unavailable', { error, tab });
        }
    }

    public destroy(): void {
        if (isValid(this.node, true) && (this.node as unknown as { _eventProcessor?: unknown })._eventProcessor) {
            for (const dispose of this.disposers.splice(0)) dispose();
        } else {
            this.disposers.length = 0;
        }
    }

    private async purchase(value: unknown): Promise<void> {
        const payload = this.record(value);
        try {
            this.node.emit('legacy-store-updated', await this.api.purchase(String(payload.offerCode ?? '')));
        } catch (error: unknown) {
            this.reportError(error);
        }
    }

    private async redeem(value: unknown): Promise<void> {
        const payload = this.record(value);
        try {
            this.node.emit('legacy-store-updated', await this.api.redeem(String(payload.code ?? '')));
        } catch (error: unknown) {
            this.reportError(error);
        }
    }

    private listen(name: string, listener: (value: unknown) => void): void {
        this.node.on(name, listener);
        this.disposers.push(() => this.node.off(name, listener));
    }

    private record(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    }
}
