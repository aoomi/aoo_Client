import { Button, Label, Layout, Node, Sprite, instantiate } from 'cc';
import { UnifiedScroll, UnifiedScrollDirection } from '../../../Common/Code/UI/UnifiedScroll';
import { PlayerAvatarService } from '../../../Common/Code/UI/PlayerAvatarService';
import type { LobbyClubListSource, LobbyClubSummary } from './LobbyClubListGateway';

export interface LobbyClubListActions {
    close(): void;
    create(): void | Promise<void>;
    join(): void | Promise<void>;
    enter(club: LobbyClubSummary): void | Promise<void>;
    report(error: unknown): void;
}

/** Business controller for LobbyClubList; consumers are intentionally wired in a later task. */
export class LobbyClubListController {
    private readonly staticDisposers: Array<() => void> = [];
    private readonly rowDisposers: Array<() => void> = [];
    private readonly pendingClubIds = new Set<number>();
    private avatarEpoch = 0;
    private requestEpoch = 0;
    private installed = false;
    private disposed = false;

    public constructor(
        private readonly root: Node,
        private readonly source: LobbyClubListSource,
        private readonly actions: LobbyClubListActions,
    ) {}

    public install(): void {
        if (this.disposed) throw new Error('LobbyClubListController has been disposed');
        if (this.installed) return;
        this.installed = true;
        this.bindClick(this.requireNode('Popup/Back'), () => this.actions.close(), this.staticDisposers);
        this.bindClick(this.requireNode('Body/Actions/Create'), () => this.actions.create(), this.staticDisposers);
        this.bindClick(this.requireNode('Body/Actions/Join'), () => this.actions.join(), this.staticDisposers);
        const list = this.requireNode('Body/List');
        UnifiedScroll.ensure(list, UnifiedScrollDirection.Horizontal);
    }

    public async refresh(): Promise<void> {
        const epoch = ++this.requestEpoch;
        try {
            const clubs = await this.source.list();
            if (!this.disposed && epoch === this.requestEpoch) this.render(clubs);
        } catch (error: unknown) {
            if (!this.disposed && epoch === this.requestEpoch) this.actions.report(error);
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.installed = false;
        this.requestEpoch += 1;
        this.pendingClubIds.clear();
        this.clearRows();
        const content = this.root.getChildByPath('Body/List/View/Content');
        const template = content?.getChildByName('Item');
        for (const child of [...(content?.children ?? [])]) {
            if (child !== template) child.destroy();
        }
        for (const dispose of this.staticDisposers.splice(0)) dispose();
    }

    private render(clubs: readonly LobbyClubSummary[]): void {
        const content = this.requireNode('Body/List/View/Content');
        const template = content.getChildByName('Item');
        if (!template) throw new Error('LobbyClubList requires Body/List/View/Content/Item');
        this.clearRows();
        for (const child of [...content.children]) {
            if (child !== template) child.destroy();
        }
        template.active = false;
        for (const club of clubs) {
            const row = instantiate(template);
            row.name = 'ClubItem';
            row.active = true;
            this.setLabel(row, 'Id', this.displayClubId(club));
            this.setLabel(row, 'Name', String(club.name ?? ''));
            this.setLabel(row, 'Role', this.positionName(club));
            const avatarPlayerId = Number(club.curatorId ?? club.player?.pid ?? club.player?.id ?? club.id ?? 0);
            this.loadAvatar(row.getChildByPath('Photo/FrameBox/Mask/Avatar'), avatarPlayerId,
                String(club.curatorAvatarUrl ?? club.player?.iconUrl ?? club.player?.headImageUrl ?? ''));
            this.bindClick(row.getChildByPath('Actions/Pin'), () => this.pin(club), this.rowDisposers);
            this.bindClick(row.getChildByPath('Actions/Enter'), () => this.enter(club), this.rowDisposers);
            content.addChild(row);
        }
        content.getComponent(Layout)?.updateLayout();
    }

    private async pin(club: LobbyClubSummary): Promise<void> {
        let clubId = 0;
        try {
            clubId = this.requireClubId(club);
            if (this.pendingClubIds.has(clubId)) return;
            this.pendingClubIds.add(clubId);
            const clubs = await this.source.pin(clubId);
            if (!this.disposed) this.render(clubs);
        } catch (error: unknown) {
            if (!this.disposed) this.actions.report(error);
        } finally {
            this.pendingClubIds.delete(clubId);
        }
    }

    private async enter(club: LobbyClubSummary): Promise<void> {
        let clubId = 0;
        try {
            clubId = this.requireClubId(club);
            if (this.pendingClubIds.has(clubId)) return;
            this.pendingClubIds.add(clubId);
            const detail = await this.source.detail(clubId);
            if (!this.disposed) await this.actions.enter({ ...club, ...detail });
        } catch (error: unknown) {
            if (!this.disposed) this.actions.report(error);
        } finally {
            this.pendingClubIds.delete(clubId);
        }
    }

    private loadAvatar(node: Node | null, playerId: number, url: string): void {
        if (!node || playerId <= 0) return;
        const epoch = this.avatarEpoch;
        void PlayerAvatarService.frame(playerId, url).then((frame) => {
            if (this.disposed || epoch !== this.avatarEpoch || !node.isValid) return;
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = frame;
        }).catch(() => undefined);
    }

    private clearRows(): void {
        this.avatarEpoch += 1;
        for (const dispose of this.rowDisposers.splice(0)) dispose();
    }

    private bindClick(node: Node | null, action: () => void | Promise<void>, disposers: Array<() => void>): void {
        if (!node) throw new Error('LobbyClubList button node is missing');
        const listener = (): void => { void action(); };
        node.on(Button.EventType.CLICK, listener);
        disposers.push(() => {
            if (node.isValid && (node as Node & { _eventProcessor?: unknown })._eventProcessor) {
                node.off(Button.EventType.CLICK, listener);
            }
        });
    }

    private setLabel(root: Node, path: string, value: string): void {
        const label = root.getChildByPath(path)?.getComponent(Label);
        if (!label) throw new Error(`LobbyClubList label is missing: ${path}`);
        label.string = value;
    }

    private requireNode(path: string): Node {
        const node = this.root.getChildByPath(path);
        if (!node) throw new Error(`LobbyClubList node is missing: ${path}`);
        return node;
    }

    private requireClubId(club: LobbyClubSummary): number {
        const clubId = Number(club.id ?? 0);
        if (!Number.isSafeInteger(clubId) || clubId <= 0) throw new Error('Lobby club id is invalid');
        return clubId;
    }

    private displayClubId(club: LobbyClubSummary): string {
        if (club.clubsign !== undefined) return String(club.clubsign);
        const key = String(club.key ?? '');
        return key.length > 9 ? key.slice(9) : key;
    }

    private positionName(club: LobbyClubSummary): string {
        const minister = Number(club.minister ?? 0);
        if (Boolean(club.isPromotionManage) && minister > 0) return '管理/队长';
        if (Boolean(club.isPromotionManage)) return '队长';
        if (minister === 2) return '圈主';
        if (minister > 0) return '管理';
        return '成员';
    }
}
