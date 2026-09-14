import { isValid,Node } from 'cc';
import type { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { ActivityGateway } from '../../../Common/Code/Runtime/Activity/ActivityGateway';
export class TaskController {
    private readonly disposers: Array<() => void> = [];
    public constructor(private readonly forms: LegacyFormManager, private readonly node: Node, private readonly gateway: ActivityGateway, private readonly error: (e: unknown) => void) {}
    public install(): void {
        this.listen('legacy-task-claim', (v) => void this.claim(v));
        this.listen('legacy-check-in', (v) => void this.checkIn(v));
        this.listen('legacy-share-reward', (v) => void this.share(v));
    }
    public async open(form = 'UILobbyTasks'): Promise<void> {
        const opened = await this.forms.show(form);
        if (!opened) return;
        try {
            const data = await this.gateway.catalog();
            this.node.emit('legacy-activity-loaded', data);
        } catch (e) {
            // Opening the local prefab is independent from optional catalog
            // hydration. A missing deployment route must not look like the
            // user failed to open 签到/活动/赏金.
            this.node.emit('legacy-activity-unavailable', e);
        }
    }
    public destroy(): void { if(isValid(this.node,true)&&(this.node as unknown as{_eventProcessor?:unknown})._eventProcessor)for(const d of this.disposers.splice(0))d();else this.disposers.length=0; }
    private async claim(v: unknown): Promise<void> { const p = this.record(v); try { const data = await this.gateway.claim(String(p.activityCode ?? ''), String(p.missionCode ?? '')); this.node.emit('legacy-task-updated', data); } catch (e) { this.error(e); } }
    private async checkIn(v: unknown): Promise<void> { const p = this.record(v); try { const data = await this.gateway.checkIn(String(p.activityCode ?? '')); this.node.emit('legacy-check-in-updated', data); } catch (e) { this.error(e); } }
    private async share(v: unknown): Promise<void> { const p = this.record(v); try { const data = await this.gateway.recordShare(String(p.activityCode ?? ''), String(p.missionCode ?? ''), String(p.shareEventId ?? '')); this.node.emit('legacy-task-updated', data); } catch (e) { this.error(e); } }
    private listen(name: string, fn: (v: unknown) => void): void { this.node.on(name, fn); this.disposers.push(() => this.node.off(name, fn)); }
    private record(v: unknown): Record<string, unknown> { return v && typeof v === 'object' ? v as Record<string, unknown> : {}; }
}
