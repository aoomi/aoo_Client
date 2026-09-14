import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export type OverlayKind = 'toast' | 'loading';

/** One queue for transient Toast and one reference-counted Loading overlay. */
export class OverlayCenter {
    private readonly toastQueue: string[] = [];
    private loadingCount = 0;
    public toast(message: string): void { if (message.trim()) this.toastQueue.push(message.trim()); }
    public takeToast(): string | undefined { return this.toastQueue.shift(); }
    public showLoading(): () => void { this.loadingCount += 1; let active = true; return () => { if (active) this.loadingCount = Math.max(0, this.loadingCount - 1); active = false; }; }
    public isLoading(): boolean { return this.loadingCount > 0; }
    public clear(): void { this.toastQueue.length = 0; this.loadingCount = 0; }
}

export const overlayCenter = new OverlayCenter();

@ccclass('AooRedDot')
export class RedDot extends Component {
    @property(Label) public countLabel: Label | null = null;
    public setCount(count: number): void {
        const normalized = Math.max(0, Math.floor(count));
        this.node.active = normalized > 0;
        if (this.countLabel) this.countLabel.string = normalized > 99 ? '99+' : String(normalized);
    }
}

export interface ChatMessage { id: string; sender: string; text?: string; voiceAssetId?: string; emoji?: string; }
export interface ChatAdapter { send(message: Omit<ChatMessage, 'id'>): Promise<void>; }

export class ChatCenter {
    private readonly seen = new Set<string>();
    public constructor(private readonly adapter: ChatAdapter) {}
    public accept(message: ChatMessage): boolean { if (this.seen.has(message.id)) return false; this.seen.add(message.id); return true; }
    public text(sender: string, text: string): Promise<void> { return this.adapter.send({ sender, text: text.trim() }); }
    public voice(sender: string, voiceAssetId: string): Promise<void> { return this.adapter.send({ sender, voiceAssetId }); }
    public emoji(sender: string, emoji: string): Promise<void> { return this.adapter.send({ sender, emoji }); }
    public clear(): void { this.seen.clear(); }
}

export class NodePool<T extends Node> {
    private readonly available: T[] = [];
    private readonly pooled = new Set<T>();
    private readonly leased = new Set<T>();
    public constructor(private readonly create: () => T, private readonly reset: (node: T) => void,
        private readonly capacity = 32) {
        if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error('pool capacity must be a non-negative integer');
    }
    public acquire(parent?: Node): T {
        let node = this.available.pop();
        while (node && !node.isValid) { this.pooled.delete(node); node = this.available.pop(); }
        node ??= this.create();
        this.pooled.delete(node);
        this.leased.add(node);
        node.active = true;
        if (parent) parent.addChild(node);
        return node;
    }
    public release(node: T): void {
        if (!node.isValid || !this.leased.delete(node)) return;
        this.reset(node);
        node.removeFromParent();
        node.active = false;
        if (this.available.length >= this.capacity) {
            node.destroy();
            return;
        }
        this.pooled.add(node);
        this.available.push(node);
    }
    public clear(): void {
        for (const node of this.available) if (node.isValid) node.destroy();
        for (const node of this.leased) if (node.isValid) node.destroy();
        this.available.length = 0;
        this.pooled.clear();
        this.leased.clear();
    }
}
