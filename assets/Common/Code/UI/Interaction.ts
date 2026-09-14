import { _decorator, Button, Component, EventKeyboard, Input, input, Node, sys } from 'cc';
import { LifecycleScope, SingleFlight } from '../Runtime/core/LifecycleScope';

const { ccclass, property } = _decorator;

@ccclass('AooGuardedButton')
export class GuardedButton extends Component {
    @property({ min: 0 }) public intervalMs = 500;
    private acceptedAt = -Infinity;
    private busy = false;

    public accept(now = performance.now()): boolean {
        if (this.busy || now - this.acceptedAt < this.intervalMs) return false;
        this.acceptedAt = now;
        return true;
    }

    public async run(operation: () => Promise<void>): Promise<boolean> {
        if (!this.accept()) return false;
        this.busy = true;
        const button = this.getComponent(Button);
        if (button) button.interactable = false;
        try { await operation(); return true; }
        finally { this.busy = false; if (button?.isValid) button.interactable = true; }
    }
}

export class PopupStack {
    private readonly stack: Node[] = [];
    public push(node: Node): void {
        if (!node.isValid) return;
        this.prune();
        this.remove(node);
        this.stack.push(node);
        node.active = true;
        node.setSiblingIndex(Math.max(0, (node.parent?.children.length ?? 1) - 1));
    }
    public top(): Node | undefined { this.prune(); return this.stack[this.stack.length - 1]; }
    public pop(): Node | undefined {
        this.prune();
        const node = this.stack.pop();
        if (node?.isValid) node.destroy();
        return node;
    }
    public remove(node: Node): void { const index = this.stack.indexOf(node); if (index >= 0) this.stack.splice(index, 1); }
    public clear(): void { while (this.stack.length) this.pop(); }
    private prune(): void {
        for (let index = this.stack.length - 1; index >= 0; index -= 1) {
            if (!this.stack[index].isValid) this.stack.splice(index, 1);
        }
    }
}

export class BackKeyRouter {
    private readonly scope = new LifecycleScope();
    private handlers: Array<() => boolean> = [];

    public start(): void {
        this.scope.open();
        const listener = (event: EventKeyboard): void => {
            if (event.keyCode !== 27) return;
            for (let i = this.handlers.length - 1; i >= 0; i -= 1) if (this.handlers[i]()) break;
        };
        input.on(Input.EventType.KEY_UP, listener);
        this.scope.own(() => input.off(Input.EventType.KEY_UP, listener));
    }

    public add(handler: () => boolean): () => void {
        this.handlers.push(handler);
        return () => { this.handlers = this.handlers.filter(candidate => candidate !== handler); };
    }

    public stop(): void { this.scope.close(); this.handlers = []; }
}

export class TabSelection<T extends string | number> {
    private selected: T | undefined;
    public select(value: T): boolean { if (this.selected === value) return false; this.selected = value; return true; }
    public value(): T | undefined { return this.selected; }
}

export class RequestState {
    private readonly flight = new SingleFlight();
    public async run<T>(key: string, request: () => Promise<T>): Promise<T> { return this.flight.run(key, request); }
    public pending(key: string): boolean { return this.flight.isRunning(key); }
}

export class SettingsStore {
    public getBoolean(key: string, fallback: boolean): boolean {
        const value = sys.localStorage.getItem(`settings.${key}`);
        return value === null ? fallback : value === '1';
    }
    public setBoolean(key: string, value: boolean): void { sys.localStorage.setItem(`settings.${key}`, value ? '1' : '0'); }
    public getNumber(key: string, fallback: number): number {
        const stored = sys.localStorage.getItem(`settings.${key}`);
        if (stored === null || stored.trim() === '') return fallback;
        const value = Number(stored);
        return Number.isFinite(value) ? value : fallback;
    }
    public setNumber(key: string, value: number): void { sys.localStorage.setItem(`settings.${key}`, String(value)); }
}
