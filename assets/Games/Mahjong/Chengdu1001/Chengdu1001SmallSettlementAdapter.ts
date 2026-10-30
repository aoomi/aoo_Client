import { Button, Label, Node, Sprite, SpriteFrame, instantiate } from 'cc';

const LOG_PREFIX = '[chengdu1001SmallSettlement]';

export interface Chengdu1001RoundSettlementPlayer {
    readonly playerId: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
    readonly scoreDelta: number;
    readonly detailLines: readonly string[];
}

/** Authoritative single-round settlement projection; this view never calculates scores. */
export interface Chengdu1001RoundSettlementData {
    readonly roomId: string;
    readonly stateVersion: number;
    readonly operationId?: string;
    readonly currentRound: number;
    readonly totalRounds: number;
    readonly settledAtText: string;
    readonly ruleText: string;
    readonly players: readonly Chengdu1001RoundSettlementPlayer[];
}

export interface Chengdu1001SmallSettlementActions {
    readonly continueGame: () => void | Promise<void>;
    readonly exitRoom: () => void | Promise<void>;
    readonly share?: () => void | Promise<void>;
    readonly returnReplay?: () => void | Promise<void>;
}

export interface Chengdu1001SmallSettlementDependencies {
    readonly loadAvatar?: (avatarUrl: string) => Promise<SpriteFrame | null>;
}

type BoundButton = Readonly<{ button: Button; handler: () => void }>;

/**
 * 成都血战单局结算展示器，只消费服务端权威结算数据。
 * All displayed player and round values are supplied by the authoritative state push.
 */
export class Chengdu1001SmallSettlementAdapter {
    private readonly boundButtons: BoundButton[] = [];
    private readonly generatedPlayerItems: Node[] = [];
    private disposed = false;

    constructor(
        private readonly root: Node,
        private readonly actions: Chengdu1001SmallSettlementActions,
        private readonly dependencies: Chengdu1001SmallSettlementDependencies = {},
    ) {
        if (root.name !== 'SmallSettlement') {
            throw new Error(`${LOG_PREFIX} unexpected root name: ${root.name}`);
        }
        this.bindActions();
    }

    async render(data: Chengdu1001RoundSettlementData): Promise<void> {
        this.ensureActive();
        this.validate(data);
        this.show();

        this.setLabel('Small/Top/Num', `局数:${data.currentRound}/${data.totalRounds}`);
        this.setLabel('Small/Top/Time', data.settledAtText);
        this.setLabel('Small/Top/RoomID', `房号:${data.roomId}`);
        this.setLabel('Small/Bottom/PageTurning/Num', `${data.currentRound}/${data.totalRounds}`);
        this.setLabel('Small/Bottom/Rule/Label', data.ruleText);
        await this.renderPlayers(data.players);

    }

    show(): void {
        this.ensureActive();
        this.root.active = true;
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

    private async renderPlayers(players: readonly Chengdu1001RoundSettlementPlayer[]): Promise<void> {
        const content = this.node('Small/Players/View/Content');
        const template = this.node('Small/Players/View/Content/Clone');
        template.active = false;
        this.clearPlayers();

        await Promise.all(players.map(async (player) => {
            const item = instantiate(template);
            item.name = `Player_${player.playerId}`;
            item.active = true;
            content.addChild(item);
            this.generatedPlayerItems.push(item);

            this.setLabelFrom(item, 'Head/NickName/Name', player.displayName);
            const win = this.nodeFrom(item, 'Score/Win');
            const lose = this.nodeFrom(item, 'Score/Lose');
            win.active = player.scoreDelta >= 0;
            lose.active = player.scoreDelta < 0;
            this.setLabelFrom(item, player.scoreDelta >= 0 ? 'Score/Win' : 'Score/Lose',
                this.formatScore(player.scoreDelta));
            this.setLabelFrom(item, 'CardType/Label', player.detailLines.join(' '));
            await this.setAvatar(this.nodeFrom(item, 'Head/Square/Mask/Avatar'), player.avatarUrl);
        }));
    }

    private bindActions(): void {
        this.bindButton('Small/Bottom/Btns/Goon', this.actions.continueGame);
        this.bindButton('Small/Bottom/Btns/Return', this.actions.exitRoom);
        this.node('Small/Bottom/Btns/BigSettlement').active = false;
        this.node('Small/Bottom/PageTurning').active = false;
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

    private validate(data: Chengdu1001RoundSettlementData): void {
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
