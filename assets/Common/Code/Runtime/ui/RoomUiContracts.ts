export type RoomPanel = 'settings' | 'chat' | 'voice' | 'emoji' | 'dissolve' | 'invite' | 'player';
export type GameFamily = 'mahjong' | 'poker' | 'long-card' | 'character-card';

export interface RoomCommandGateway {
    execute(command: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface RoomPanelController {
    readonly panel: RoomPanel;
    show(context: Readonly<{ roomId: number; playerId: number }>): void;
    hide(): void;
    dispose(): void;
}

export class RoomUiRegistry {
    private readonly panels = new Map<RoomPanel, () => RoomPanelController>();
    private readonly families = new Map<GameFamily, ReadonlySet<string>>();

    public registerPanel(panel: RoomPanel, factory: () => RoomPanelController): void {
        if (this.panels.has(panel)) throw new Error(`duplicate room panel: ${panel}`);
        this.panels.set(panel, factory);
    }

    public createPanel(panel: RoomPanel): RoomPanelController {
        const factory = this.panels.get(panel);
        if (!factory) throw new Error(`room panel not registered: ${panel}`);
        return factory();
    }

    public registerFamily(family: GameFamily, components: readonly string[]): void {
        if (this.families.has(family) || components.length === 0) throw new Error(`invalid game family: ${family}`);
        this.families.set(family, new Set(components));
    }

    public supports(family: GameFamily, component: string): boolean {
        return this.families.get(family)?.has(component) ?? false;
    }
}

export class NavigationStack<T> {
    private readonly stack: T[] = [];
    public push(value: T): void { this.stack.push(value); }
    public peek(): T | undefined { return this.stack[this.stack.length - 1]; }
    public back(): T | undefined { return this.stack.pop(); }
    public clear(): void { this.stack.length = 0; }
}
