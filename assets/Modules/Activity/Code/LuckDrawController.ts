import { Button, isValid, Node } from 'cc';
import type { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { LuckDrawGateway, type LuckDrawResult } from '../../../Common/Code/Runtime/Activity/LuckDrawGateway';
import { ProductionApiClient, type ProductionApiConfig } from '../../../Common/Code/Runtime/Activity/ProductionApiClient';

export class LuckDrawController {
    private readonly disposers: Array<() => void> = [];
    private pendingRequestId: string | null = null;
    private campaignCode = '';
    private generation = 0;
    private drawing = false;
    private buttonDisposer: (() => void) | null = null;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly node: Node,
        private readonly api: LuckDrawGateway,
        private readonly error: (e: unknown) => void,
    ) {
        const execute = (): void => { void this.execute(); };
        node.on('legacy-luck-draw-execute', execute);
        this.disposers.push(() => node.off('legacy-luck-draw-execute', execute));
        const close = (): void => this.close();
        node.on('legacy-luck-draw-close', close);
        this.disposers.push(() => node.off('legacy-luck-draw-close', close));
    }

    public async open(): Promise<void> {
        const generation = ++this.generation;
        try {
            const campaignCode = this.resolveCampaignCode();
            const state = await this.api.query(campaignCode);
            if (!this.active(generation)) return;
            this.campaignCode = campaignCode;
            const form = await this.forms.show('UILobbyDraw', state);
            if (!this.active(generation) || !form) return;
            this.bindExecuteButton(form.find('btn_choujiang'));
            this.node.emit('legacy-luck-draw-loaded', state);
        } catch (error: unknown) {
            if (this.active(generation)) this.report(error);
        }
    }

    public destroy(): void {
        this.close();
        if (isValid(this.node, true) && (this.node as unknown as { _eventProcessor?: unknown })._eventProcessor) {
            for (const dispose of this.disposers.splice(0)) dispose();
        } else {
            this.disposers.length = 0;
        }
        this.pendingRequestId = null;
    }

    private async execute(): Promise<void> {
        if (this.drawing || !this.campaignCode) return;
        const generation = this.generation;
        const requestId = this.pendingRequestId ?? ProductionApiClient.operationKey(`luck-draw:${this.campaignCode}`);
        this.pendingRequestId = requestId;
        this.drawing = true;
        this.setButtonEnabled(false);
        try {
            const result = await this.api.draw(this.campaignCode, requestId);
            if (!this.active(generation)) return;
            this.pendingRequestId = null;
            await this.showResult(result);
            if (!this.active(generation)) return;
            this.node.emit('legacy-luck-draw-result', result);
        } catch (error: unknown) {
            if (this.active(generation)) this.report(error);
        } finally {
            if (this.active(generation)) {
                this.drawing = false;
                this.setButtonEnabled(true);
            }
        }
    }

    private close(): void {
        this.generation += 1;
        this.drawing = false;
        this.buttonDisposer?.();
        this.buttonDisposer = null;
        this.api.cancelPending();
    }

    private async showResult(result: LuckDrawResult): Promise<void> {
        const form = await this.forms.show('UILobbyDrawResult', result);
        if (!form) return;
        const prize = form.find('lb_name') ?? form.find('label_name') ?? form.find('prizeName');
        const label = prize?.getComponent('cc.Label') as { string?: string } | null;
        if (label) label.string = `${result.prizeName} × ${result.rewardAmount}`;
    }

    private bindExecuteButton(button: Node | null): void {
        if (!button) return;
        this.buttonDisposer?.();
        const handler = (): void => { void this.execute(); };
        button.on(Button.EventType.CLICK, handler);
        this.buttonDisposer = () => button.isValid && button.off(Button.EventType.CLICK, handler);
    }

    private setButtonEnabled(enabled: boolean): void {
        const component = this.forms.get('UILobbyDraw')?.find('btn_choujiang')?.getComponent(Button);
        if (component) component.interactable = enabled;
    }

    private report(error: unknown): void {
        this.node.emit('legacy-luck-draw-error', error);
        this.error(error);
    }

    private active(generation: number): boolean { return generation === this.generation; }

    private resolveCampaignCode(): string {
        const config = (globalThis as typeof globalThis & { __aoo_RUNTIME_CONFIG__?: ProductionApiConfig }).__aoo_RUNTIME_CONFIG__;
        const value = String(config?.luckDrawCampaignCode ?? '');
        if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(value)) throw new Error('抽奖活动编码未配置');
        return value;
    }
}
