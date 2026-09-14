import { BlockInputEvents, Button, EditBox, Node, sys } from 'cc';
import { ProtocolClient } from '../../../Common/Code/Runtime/network/ProtocolClient';
import { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { LegacyJoinClubController } from '../../../Club/Code/Runtime/LegacyJoinClubController';
import { LegacyClubMainController } from '../../../Club/Code/Runtime/LegacyClubMainController';
import type { ClubTopBarPort } from '../../../Club/Code/Runtime/ClubTopBarPort';
import { LobbyClubListController } from './LobbyClubListController';
import { LobbyClubListGateway, type LobbyClubSummary } from './LobbyClubListGateway';
import { hostRouteStore } from '../../../Common/Code/Runtime/navigation/HostRouteStore';

interface ClubDetail extends LobbyClubSummary {
    diamond?: number;
    roomCard?: number;
    showUplevelId?: number;
    showClubSign?: number;
    skinType?: number;
    unionId?: number;
}

/** Owns the lobby-facing club list and hands a selected club to the Club domain. */
export class LobbyClubEntryController {
    private readonly disposers: Array<() => void> = [];
    private readonly boundCreateForms = new WeakSet<Node>();
    private readonly enteringClubIds = new Set<number>();
    private listController: LobbyClubListController | null = null;
    private mainController: LegacyClubMainController | null = null;
    private createPending = false;

    public constructor(
        private readonly forms: LegacyFormManager,
        private readonly client: ProtocolClient,
        private readonly mainNode: Node,
        private readonly top: ClubTopBarPort,
        private readonly playerId: number,
        private readonly playerName: string,
        private readonly accountId: string,
    ) {}

    public install(): void {
        new LegacyJoinClubController(this.forms, this.client).install();
        this.disposers.push(this.client.on('SClub_Join', body => { void this.handleJoinNotification(body); }));
        const openCreate = (): void => { void this.openCreate(); };
        this.mainNode.on('legacy-open-club-create', openCreate);
        this.disposers.push(() => {
            if (this.mainNode.isValid) this.mainNode.off('legacy-open-club-create', openCreate);
        });
        this.mainController = new LegacyClubMainController(
            this.forms, this.client, this.mainNode, this.top, this.playerId, this.playerName,
            () => hostRouteStore.save(this.accountId, { name: 'lobby' }),
        );
        this.mainController.install();
        this.forms.register('UILobbyClubList', {
            // The list remains the painted source while a selected club hydrates
            // underneath it; the ready club surface is revealed atomically.
            zOrder: 8,
            lifecycle: {
                onCreate: form => {
                    this.blockInput(form.node);
                    this.bindCreateForm(form.node);
                    this.listController = new LobbyClubListController(
                        form.node,
                        new LobbyClubListGateway(this.client),
                        {
                            close: () => this.forms.closeAfterPointer('UILobbyClubList'),
                            create: () => this.openCreate(),
                            join: async () => { await this.forms.show('ui/club/UIJoinClub'); },
                            enter: async club => { await this.enterClub(club as ClubDetail, true); },
                            report: error => { void this.tip(error, '俱乐部数据加载失败，请稍后再试'); },
                        },
                    );
                    this.listController.install();
                },
                onShow: (form, showCreate) => {
                    this.mainNode.active = false;
                    const createPanel = form.find('CreatecCub');
                    if (createPanel) createPanel.active = showCreate === true;
                    if (showCreate === true) this.prepareCreateForm(form.node);
                    void this.listController?.refresh();
                },
                onClose: () => {
                    this.mainNode.active = !this.isClubMainVisible();
                },
                onDestroy: () => {
                    this.listController?.dispose();
                    this.listController = null;
                },
            },
        });
    }

    public dispose(): void {
        this.createPending = false;
        this.enteringClubIds.clear();
        this.listController?.dispose();
        this.listController = null;
        this.mainController?.dispose();
        this.mainController = null;
        for (const dispose of this.disposers.splice(0)) dispose();
    }

    public async restoreLastClub(preferredClubId?: number): Promise<boolean> {
        if (Number.isSafeInteger(preferredClubId) && Number(preferredClubId) > 0) {
            return await this.enterClub({ id: Number(preferredClubId) });
        }
        const raw = sys.localStorage.getItem(`legacy_last_club_${this.playerId}`);
        if (!raw) return false;
        try {
            const club = JSON.parse(raw) as ClubDetail;
            if (Number(club.id ?? 0) <= 0) return false;
            return await this.enterClub(club);
        } catch {
            return false;
        }
    }

    public async openAll(): Promise<void> {
        try {
            await this.forms.show('UILobbyClubList');
        } catch (error: unknown) {
            await this.tip(error, '俱乐部数据加载失败，请稍后再试');
        }
    }

    private async openCreate(): Promise<void> {
        await this.forms.show('UILobbyClubList', true);
    }

    private bindCreateForm(root: Node): void {
        if (this.boundCreateForms.has(root)) return;
        this.boundCreateForms.add(root);
        const createPanel = root.getChildByName('CreatecCub');
        if (!createPanel) return;
        createPanel.active = false;
        this.onClick(createPanel.getChildByPath('Popup/Tag/Close'), () => { createPanel.active = false; });
        this.onClick(createPanel.getChildByPath('Create/Confirm'), () => { void this.createClub(root); });
    }

    private prepareCreateForm(root: Node): void {
        const editBox = root.getChildByPath('CreatecCub/Create/Found/EditBox')?.getComponent(EditBox);
        if (!editBox) return;
        editBox.inputMode = EditBox.InputMode.ANY;
        editBox.inputFlag = EditBox.InputFlag.DEFAULT;
        editBox.maxLength = -1;
        editBox.string = '';
    }

    private async createClub(root: Node): Promise<void> {
        if (this.createPending) return;
        const name = root.getChildByPath('CreatecCub/Create/Found/EditBox')?.getComponent(EditBox)?.string ?? '';
        if (!name.trim()) {
            await this.forms.show('UIMessage_Drift', null, null, '请输入俱乐部名称');
            return;
        }
        this.createPending = true;
        try {
            const club = await this.client.request<ClubDetail>('club.CClubCreate', { clubName: name });
            const balance = Number(club.diamond ?? club.roomCard);
            if (Number.isFinite(balance)) this.top.setDiamond(balance);
            await this.forms.show('UIMessage_Drift', null, null, '俱乐部创建成功');
            this.forms.close('UILobbyClubList');
            this.mainNode.emit('legacy-club-created', club);
            await this.enterClub(club);
        } catch (error: unknown) {
            await this.tip(error, '俱乐部创建失败，请稍后再试');
        } finally {
            this.createPending = false;
        }
    }

    private async handleJoinNotification(body: unknown): Promise<void> {
        const packet = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const messages: Readonly<Record<number, string>> = {
            1: '加入俱乐部申请正在等待管理员审批', 2: '加入俱乐部申请已被拒绝',
            4: '加入俱乐部申请已通过', 8: '您已被移出俱乐部', 64: '您已退出俱乐部',
        };
        const state = Number(packet.state ?? packet.status ?? packet.joinStatus ?? 0);
        if (messages[state]) await this.forms.show('UIMessage_Drift', null, null, messages[state]);
        if ([2, 4, 8, 64].includes(state)) await this.listController?.refresh();
    }

    private async enterClub(club: ClubDetail, detailLoaded = false): Promise<boolean> {
        const clubId = Number(club.id ?? 0);
        if (!Number.isSafeInteger(clubId) || clubId <= 0 || this.enteringClubIds.has(clubId)) return false;
        this.enteringClubIds.add(clubId);
        try {
            const selected = detailLoaded ? club
                : { ...club, ...await this.client.request<ClubDetail>('club.CGetClubListById', { clubId }) };
            sys.localStorage.setItem(`legacy_last_club_${this.playerId}`, JSON.stringify({
                id: selected.id, clubsign: selected.clubsign, name: selected.name,
                showUplevelId: selected.showUplevelId ?? 0, showClubSign: selected.showClubSign ?? 0,
                skinType: selected.skinType ?? 0, unionId: selected.unionId ?? 0,
            }));
            const skin = Number(selected.skinType ?? 0);
            const path = skin === 1 ? 'ui/club_1/UIClubMain_1'
                : skin === 2 ? 'ui/club_2/UIClubMain_2' : 'ui/club/ClubMain';
            const clubForm = await this.forms.show(path, { club: selected, rooms: [] });
            if (!clubForm?.isShown()) throw new Error('俱乐部界面未完成挂载');
            await this.mainController?.restoreAuthoritativeTemplates(clubId, '进入俱乐部后的模板恢复');
            // Keep the higher list layer painted until the target's authoritative
            // desks are ready. Closing before hydration reveals an empty club frame.
            this.forms.close('UILobbyClubList');
            hostRouteStore.save(this.accountId, { name: 'club', clubId });
            this.mainNode.emit('legacy-club-enter', { club: selected });
            return true;
        } catch (error: unknown) {
            await this.tip(error, '俱乐部数据加载失败，请稍后再试');
            return false;
        } finally {
            this.enteringClubIds.delete(clubId);
        }
    }

    private async tip(error: unknown, fallback: string): Promise<void> {
        const message = error instanceof Error && error.message ? error.message : fallback;
        await this.forms.show('UIMessage_Drift', null, null, message);
    }

    private isClubMainVisible(): boolean {
        return [
            'ui/club/ClubMain',
            'ui/club_1/UIClubMain_1',
            'ui/club_2/UIClubMain_2',
        ].some(path => this.forms.get(path)?.isShown() === true);
    }

    private onClick(node: Node | null, listener: () => void): void {
        if (!node) return;
        node.on(Button.EventType.CLICK, listener);
        this.disposers.push(() => {
            if (node.isValid && (node as Node & { _eventProcessor?: unknown })._eventProcessor) {
                node.off(Button.EventType.CLICK, listener);
            }
        });
    }

    private blockInput(node: Node): void {
        // Button provides the hit area and visual state; BlockInputEvents owns
        // modal event consumption so background presses cannot reach the lobby.
        if (!node.getComponent(BlockInputEvents)) node.addComponent(BlockInputEvents);
        const background = node.getChildByName('Bg');
        if (background && !background.getComponent(BlockInputEvents)) {
            background.addComponent(BlockInputEvents);
        }
    }
}
