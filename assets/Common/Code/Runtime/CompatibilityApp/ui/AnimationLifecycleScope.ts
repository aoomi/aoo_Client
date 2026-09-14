import { Node, Tween } from 'cc';

/** Owns UI animation/timer cancellation and terminates it when its node scope closes. */
export class AnimationLifecycleScope {
    private readonly targets = new Set<Node>();
    private readonly cancellations = new Set<() => void>();
    private closed = false;
    public own(target: Node): Node {
        if (this.closed) throw new Error('动画生命周期已关闭');
        this.targets.add(target); return target;
    }
    public defer(cancel: () => void): () => void {
        if (this.closed) throw new Error('动画生命周期已关闭');
        this.cancellations.add(cancel); return () => this.cancellations.delete(cancel);
    }
    public close(): void {
        if (this.closed) return; this.closed = true;
        for (const target of this.targets) if (target.isValid) Tween.stopAllByTarget(target);
        for (const cancel of this.cancellations) cancel();
        this.targets.clear(); this.cancellations.clear();
    }
}
