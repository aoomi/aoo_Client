import { Button, Component, Label, Node, Sprite, SpriteFrame, instantiate } from 'cc';

const LOG_PREFIX = '[chengdu1001BigSettlement]';

export interface Chengdu1001BigSettlementPlayer {
    readonly playerId: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
    /** Omitted when the authority does not publish aggregate win/loss counts. */
    readonly winCount?: number;
    readonly loseCount?: number;
    readonly totalScore: number;
}

/**
 * Display-only projection of the authoritative final-settlement payload.
 * Scoring, winner selection and room completion must be supplied by the server path.
 */
export interface Chengdu1001BigSettlementData {
    readonly roomId: string;
    readonly stateVersion: number;
    readonly operationId?: string;
    readonly currentRound: number;
    readonly totalRounds: number;
    readonly endedAtText: string;
    readonly roomFinished: boolean;
    readonly bestWinnerPlayerId?: string;
    readonly players: readonly Chengdu1001BigSettlementPlayer[];
}

export interface Chengdu1001BigSettlementActions {
    readonly returnLobby: () => void | Promise<void>;
    readonly continueGame: () => void | Promise<void>;
    readonly shareMore?: () => void | Promise<void>;
    readonly showDetails?: () => void | Promise<void>;
}

export interface Chengdu1001BigSettlementDependencies {
    readonly loadAvatar?: (avatarUrl: string) => Promise<SpriteFrame | null>;
}

type BoundButton = Readonly<{ button: Button; handler: () => void }>;

export class Chengdu1001BigSettlementAdapter {
    private readonly boundButtons: BoundButton[] = [];
    private readonly generatedPlayerItems: Node[] = [];
    private disposed = false;

    constructor(
        private readonly root: Node,
        private readonly actions: Chengdu1001BigSettlementActions,
        private readonly dependencies: Chengdu1001BigSettlementDependencies = {},
    ) {
        if (root.name !== 'BigSettlement_0') {
            throw new Error(`${LOG_PREFIX} unexpected root name: ${root.name}`);
        }
        this.bindActions();
    }

    async render(data: Chengdu1001BigSettlementData): Promise<void> {
        this.ensureActive();
        this.validate(data);
        this.root.active = true;

        this.setLabel('FinalSettlementPanel/TopBar/RoomIdLabel', `房间号：${data.roomId}`);
        this.setLabel('FinalSettlementPanel/TopBar/RoundCountLabel', `${data.currentRound}/${data.totalRounds}局`);
        this.setLabel('FinalSettlementPanel/TopBar/EndTimeLabel', data.endedAtText);

        this.node('FinalSettlementPanel/BottomBar/NormalActions').active = !data.roomFinished;
        this.node('FinalSettlementPanel/BottomBar/FinishedActions').active = data.roomFinished;

        await Promise.all([
            this.renderBestWinner(data),
            this.renderPlayers(data),
        ]);

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
        this.clearGeneratedPlayers();
        this.disposed = true;
    }

    private async renderBestWinner(data: Chengdu1001BigSettlementData): Promise<void> {
        const panel = this.node('FinalSettlementPanel/BestWinnerPanel');
        const winner = data.bestWinnerPlayerId
            ? data.players.find((player) => player.playerId === data.bestWinnerPlayerId)
            : undefined;
        panel.active = Boolean(winner);
        if (!winner) {
            return;
        }

        this.setLabel('FinalSettlementPanel/BestWinnerPanel/BestWinnerHead/NickNameBackground/BestWinnerNameLabel', winner.displayName);
        this.setLabel('FinalSettlementPanel/BestWinnerPanel/BestWinnerScoreLabel', this.formatScore(winner.totalScore));
        await this.setAvatar(
            this.node('FinalSettlementPanel/BestWinnerPanel/BestWinnerHead/AvatarSquare/AvatarMask/AvatarImage'),
            winner.avatarUrl,
        );
    }

    private async renderPlayers(data: Chengdu1001BigSettlementData): Promise<void> {
        const content = this.node('FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent');
        const template = this.node('FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent/PlayerItemTemplate');
        template.active = false;
        this.clearGeneratedPlayers();

        // 列表顺序就是名次：总分降序，同分保持权威消息中的座位顺序。
        const rankedPlayers = data.players.map((player, index) => ({ player, index }))
            .sort((left, right) => right.player.totalScore - left.player.totalScore || left.index - right.index)
            .map(({ player }) => player);
        await Promise.all(rankedPlayers.map(async (player, rank) => {
            const item = instantiate(template);
            item.name = `Rank_${rank + 1}_Player_${player.playerId}`;
            item.active = true;
            content.addChild(item);
            this.generatedPlayerItems.push(item);

            this.setLabelFrom(item, 'Head/NickNameBackground/PlayerNameLabel', player.displayName);
            this.setLabelFrom(item, 'Statistics/WinCount/WinCountLabel', player.winCount === undefined ? '--' : String(player.winCount));
            this.setLabelFrom(item, 'Statistics/LoseCount/LoseCountLabel', player.loseCount === undefined ? '--' : String(player.loseCount));
            this.setLabelFrom(item, 'TotalScore/TotalWinScoreLabel', player.totalScore >= 0 ? this.formatScore(player.totalScore) : '');
            this.setLabelFrom(item, 'TotalScore/TotalLoseScoreLabel', player.totalScore < 0 ? this.formatScore(player.totalScore) : '');
            await this.setAvatar(this.nodeFrom(item, 'Head/AvatarSquare/AvatarMask/AvatarImage'), player.avatarUrl);
        }));
    }

    private bindActions(): void {
        this.bindButton('FinalSettlementPanel/BottomBar/NormalActions/Btn_ReturnLobby', this.actions.returnLobby);
        this.bindButton('FinalSettlementPanel/BottomBar/NormalActions/Btn_Continue', this.actions.continueGame);
        this.bindOptionalButton('FinalSettlementPanel/BottomBar/NormalActions/Btn_ShareMore', this.actions.shareMore);
        this.bindButton('FinalSettlementPanel/BottomBar/FinishedActions/Btn_ReturnLobby', this.actions.returnLobby);
        this.bindOptionalButton('FinalSettlementPanel/BottomBar/FinishedActions/Btn_Details', this.actions.showDetails);
    }

    private bindOptionalButton(path: string, action: (() => void | Promise<void>) | undefined): void {
        const node = this.node(path);
        node.active = Boolean(action);
        if (action) {
            this.bindButton(path, action);
        }
    }

    private bindButton(path: string, action: () => void | Promise<void>): void {
        const button = this.component(this.node(path), Button, path);
        const handler = (): void => {
            Promise.resolve(action()).catch((error: unknown) => {
                console.error(LOG_PREFIX, 'action failed', { path, error });
            });
        };
        button.node.on('click', handler, this);
        this.boundButtons.push({ button, handler });
    }

    private async setAvatar(node: Node, avatarUrl: string | undefined): Promise<void> {
        const sprite = this.component(node, Sprite, node.name);
        if (!avatarUrl || !this.dependencies.loadAvatar) {
            sprite.spriteFrame = null;
            return;
        }
        try {
            sprite.spriteFrame = await this.dependencies.loadAvatar(avatarUrl);
        } catch (error: unknown) {
            sprite.spriteFrame = null;
            console.error(LOG_PREFIX, 'avatar load failed', { node: node.name, error });
        }
    }

    private validate(data: Chengdu1001BigSettlementData): void {
        if (!data.roomId || !Number.isInteger(data.stateVersion) || data.stateVersion < 0) {
            throw new Error(`${LOG_PREFIX} invalid roomId/stateVersion`);
        }
        if (!Number.isInteger(data.currentRound) || !Number.isInteger(data.totalRounds)
            || data.currentRound < 0 || data.totalRounds < data.currentRound) {
            throw new Error(`${LOG_PREFIX} invalid round summary`);
        }
        const playerIds = new Set(data.players.map((player) => player.playerId));
        if (playerIds.size !== data.players.length || [...playerIds].some((playerId) => !playerId)) {
            throw new Error(`${LOG_PREFIX} duplicate or empty playerId`);
        }
        if (data.bestWinnerPlayerId && !playerIds.has(data.bestWinnerPlayerId)) {
            throw new Error(`${LOG_PREFIX} bestWinnerPlayerId is absent from players`);
        }
    }

    private clearGeneratedPlayers(): void {
        for (const item of this.generatedPlayerItems) {
            item.destroy();
        }
        this.generatedPlayerItems.length = 0;
    }

    private setLabel(path: string, value: string): void {
        this.setLabelFrom(this.root, path, value);
    }

    private setLabelFrom(root: Node, path: string, value: string): void {
        this.component(this.nodeFrom(root, path), Label, path).string = value;
    }

    private node(path: string): Node {
        return this.nodeFrom(this.root, path);
    }

    private nodeFrom(root: Node, path: string): Node {
        let current: Node | null = root;
        for (const segment of path.split('/')) {
            current = current.getChildByName(segment);
            if (!current) {
                throw new Error(`${LOG_PREFIX} missing node: ${path}`);
            }
        }
        return current;
    }

    private component<T extends Component>(node: Node, type: new (...args: any[]) => T, context: string): T {
        const component = node.getComponent(type);
        if (!component) {
            throw new Error(`${LOG_PREFIX} missing component at ${context}`);
        }
        return component;
    }

    private formatScore(score: number): string {
        return score > 0 ? `+${score}` : String(score);
    }

    private ensureActive(): void {
        if (this.disposed) {
            throw new Error(`${LOG_PREFIX} adapter is disposed`);
        }
    }
}
