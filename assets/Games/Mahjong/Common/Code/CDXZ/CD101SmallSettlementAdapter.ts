import { Button, Label, Node, Sprite, SpriteFrame, instantiate } from 'cc';

const LOG_PREFIX = '[CD101SmallSettlement]';

export interface CD101RoundSettlementPlayer {
    readonly playerId: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
    readonly scoreDelta: number;
    readonly detailLines: readonly string[];
}

/** Authoritative single-round settlement projection; this view never calculates scores. */
export interface CD101RoundSettlementData {
    readonly roomId: string;
    readonly stateVersion: number;
    readonly operationId?: string;
    readonly currentRound: number;
    readonly totalRounds: number;
    readonly settledAtText: string;
    readonly ruleText: string;
    readonly players: readonly CD101RoundSettlementPlayer[];
}

export interface CD101SmallSettlementActions {
    readonly continueGame: () => void | Promise<void>;
    readonly exitRoom: () => void | Promise<void>;
    readonly share?: () => void | Promise<void>;
    readonly returnReplay?: () => void | Promise<void>;
}

export interface CD101SmallSettlementDependencies {
    readonly loadAvatar?: (avatarUrl: string) => Promise<SpriteFrame | null>;
}

type BoundButton = Readonly<{ button: Button; handler: () => void }>;

/**
 * JDZ2D single-round settlement presenter for the Creator 3.8.8 prefab.
 * All displayed player and round values are supplied by the authoritative state push.
 */
export class CD101SmallSettlementAdapter {
    private readonly boundButtons: BoundButton[] = [];
    private readonly generatedPlayerItems: Node[] = [];
    private disposed = false;

    constructor(
        private readonly root: Node,
        private readonly actions: CD101SmallSettlementActions,
        private readonly dependencies: CD101SmallSettlementDependencies = {},
    ) {
        if (root.name !== 'CD101SmallSettlement_JDZ2D') {
            throw new Error(`${LOG_PREFIX} unexpected root name: ${root.name}`);
        }
        this.bindActions();
    }

    async render(data: CD101RoundSettlementData): Promise<void> {
        this.ensureActive();
        this.validate(data);
        this.root.active = true;

        this.setLabel('settlement_panel/room_info/lb_jushu', `第${data.currentRound}/${data.totalRounds}局`);
        this.setLabel('settlement_panel/room_info/endTime', data.settledAtText);
        this.setLabel('settlement_panel/room_info/roomID', `房间号：${data.roomId}`);
        this.setLabel('settlement_panel/room_info/lb_wanfa', data.ruleText);
        await this.renderPlayers(data.players);

        console.info(LOG_PREFIX, 'rendered authoritative round settlement', {
            roomId: data.roomId,
            operationId: data.operationId ?? 'none',
            stateVersion: data.stateVersion,
            currentRound: data.currentRound,
            playerCount: data.players.length,
        });
    }

    hide(): void {
        this.ensureActive();
        this.root.active = false;
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        for (const { button, handler } of this.boundButtons) {
            button.node.off('click', handler, this);
        }
        this.boundButtons.length = 0;
        this.clearPlayers();
        this.disposed = true;
    }

    private async renderPlayers(players: readonly CD101RoundSettlementPlayer[]): Promise<void> {
        const content = this.node('settlement_panel/players/scrollview/view/content');
        const template = this.node('settlement_panel/players/scrollview/view/content/PlayerItemTemplate');
        template.active = false;
        this.clearPlayers();

        await Promise.all(players.map(async (player) => {
            const item = instantiate(template);
            item.name = `Player_${player.playerId}`;
            item.active = true;
            content.addChild(item);
            this.generatedPlayerItems.push(item);

            this.setLabelFrom(item, 'displayName', player.displayName);
            this.setLabelFrom(item, 'scoreDelta', this.formatScore(player.scoreDelta));
            this.setLabelFrom(item, 'details', player.detailLines.join('\n'));
            await this.setAvatar(this.nodeFrom(item, 'avatar'), player.avatarUrl);
        }));
    }

    private bindActions(): void {
        this.bindButton('settlement_panel/btn_list/btn_jixu', this.actions.continueGame);
        this.bindButton('settlement_panel/btn_list/btn_exit', this.actions.exitRoom);
        this.bindOptionalButton('settlement_panel/btn_list/btn_sharemore', this.actions.share);
        this.bindOptionalButton('settlement_panel/btn_list/btn_return_play', this.actions.returnReplay);
    }

    private bindOptionalButton(path: string, action: (() => void | Promise<void>) | undefined): void {
        const target = this.node(path);
        target.active = Boolean(action);
        if (action) {
            this.bindButtonNode(target, action);
        }
    }

    private bindButton(path: string, action: () => void | Promise<void>): void {
        this.bindButtonNode(this.node(path), action);
    }

    private bindButtonNode(node: Node, action: () => void | Promise<void>): void {
        const button = node.getComponent(Button);
        if (!button) {
            throw new Error(`${LOG_PREFIX} missing Button: ${this.pathOf(node)}`);
        }
        const handler = (): void => {
            void Promise.resolve(action()).catch((error: unknown) => {
                console.error(LOG_PREFIX, 'action failed', {
                    node: this.pathOf(node),
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        };
        node.on('click', handler, this);
        this.boundButtons.push({ button, handler });
    }

    private async setAvatar(node: Node, avatarUrl: string | undefined): Promise<void> {
        const sprite = node.getComponent(Sprite);
        if (!sprite) {
            throw new Error(`${LOG_PREFIX} missing Sprite: ${this.pathOf(node)}`);
        }
        if (!avatarUrl || !this.dependencies.loadAvatar) {
            sprite.spriteFrame = null;
            return;
        }
        sprite.spriteFrame = await this.dependencies.loadAvatar(avatarUrl);
    }

    private validate(data: CD101RoundSettlementData): void {
        if (!data.roomId || !Number.isInteger(data.stateVersion) || data.stateVersion < 0) {
            throw new Error(`${LOG_PREFIX} invalid authority identity`);
        }
        if (!Number.isInteger(data.currentRound) || !Number.isInteger(data.totalRounds)
            || data.currentRound < 1 || data.totalRounds < data.currentRound) {
            throw new Error(`${LOG_PREFIX} invalid round counters`);
        }
        if (data.players.length < 2 || data.players.length > 4) {
            throw new Error(`${LOG_PREFIX} invalid player count: ${data.players.length}`);
        }
        const playerIds = new Set<string>();
        for (const player of data.players) {
            if (!player.playerId || !player.displayName || !Number.isFinite(player.scoreDelta)) {
                throw new Error(`${LOG_PREFIX} invalid authoritative player settlement`);
            }
            if (playerIds.has(player.playerId)) {
                throw new Error(`${LOG_PREFIX} duplicate playerId: ${player.playerId}`);
            }
            playerIds.add(player.playerId);
        }
    }

    private setLabel(path: string, value: string): void {
        this.setLabelFrom(this.root, path, value);
    }

    private setLabelFrom(root: Node, path: string, value: string): void {
        const node = this.nodeFrom(root, path);
        const label = node.getComponent(Label);
        if (!label) {
            throw new Error(`${LOG_PREFIX} missing Label: ${this.pathOf(node)}`);
        }
        label.string = value;
    }

    private node(path: string): Node {
        return this.nodeFrom(this.root, path);
    }

    private nodeFrom(root: Node, path: string): Node {
        let cursor: Node | null = root;
        for (const segment of path.split('/')) {
            cursor = cursor.getChildByName(segment);
            if (!cursor) {
                throw new Error(`${LOG_PREFIX} missing node: ${path}`);
            }
        }
        return cursor;
    }

    private clearPlayers(): void {
        for (const item of this.generatedPlayerItems) {
            item.destroy();
        }
        this.generatedPlayerItems.length = 0;
    }

    private ensureActive(): void {
        if (this.disposed) {
            throw new Error(`${LOG_PREFIX} adapter already disposed`);
        }
    }

    private formatScore(value: number): string {
        return value > 0 ? `+${value}` : String(value);
    }

    private pathOf(node: Node): string {
        const segments: string[] = [];
        let cursor: Node | null = node;
        while (cursor) {
            segments.unshift(cursor.name);
            cursor = cursor.parent;
        }
        return segments.join('/');
    }
}
