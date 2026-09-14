import { Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../Login/Code/Auth/AuthTypes';
import { ProtocolClient } from '../../network/ProtocolClient';
import { createOwnedGameClient } from '../../network/ConnectionOwnership';
import { LegacyRoleGateway } from '../../role/LegacyRoleGateway';
import { LegacyFormManager } from '../ui/LegacyFormManager';
import { resolveRuntimeEndpoints } from '../../config/RuntimeEndpoints';
import { AypdkRuntime } from './AypdkRuntime';
import { AypdkPlayController } from './AypdkPlayController';
import { AypdkResultController } from './AypdkResultController';
import { AypdkDissolveController } from './AypdkDissolveController';
import { AypdkRecordController } from './AypdkRecordController';
import { AypdkReplayController } from './AypdkReplayController';
import { AypdkShareController } from './AypdkShareController';

export interface LegacySubgameTicket {
    gameId?: number;
    gameName?: string;
    roomId?: number;
    roomID?: number;
    roomKey?: number | string;
    clubId?: number;
    unionId?: number;
    fromClub?: boolean;
    playBackCode?: string;
}

export interface LegacyExternalSubgameHandoff extends LegacySubgameTicket {
    gameId: number;
    gameName: string;
    gameServerUrl: string;
    gameToken: unknown;
    consume: () => boolean;
    cancel: () => void;
}

interface GameServerInfo {
    isStart?: boolean;
    webSocketUrl?: string;
    gameServerIP?: string;
    gameServerPort?: number;
}

export class AypdkSwitchCoordinator {
    private gameClient: ProtocolClient | null = null;
    private runtime: AypdkRuntime | null = null;
    private playController: AypdkPlayController | null = null;
    private resultController: AypdkResultController | null = null;
    private dissolveController: AypdkDissolveController | null = null;
    private recordController: AypdkRecordController | null = null;
    private replayController: AypdkReplayController | null = null;
    private shareController: AypdkShareController | null = null;
    private switching = false;
    private inGame = false;
    private sourceTicket: LegacySubgameTicket | null = null;
    private externalSwitchGeneration = 0;

    public enterExternalReplay(ticket: LegacySubgameTicket): void {
        const gameName = String(ticket.gameName ?? '').trim().toLowerCase();
        const gameIdByName: Record<string, number> = { hzmj: 0, scjymj: 628, aypdk: 77 };
        const gameId = Number(ticket.gameId ?? gameIdByName[gameName]);
        void this.prepareExternalHandoff(ticket, gameId, gameName);
    }

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly playerId: number,
        private readonly hallClient: ProtocolClient,
        private readonly forms: LegacyFormManager,
        private readonly lobbyNode: Node,
        private readonly refreshRoomConnection: (roomId: number) => Promise<{ authorityRoute: string; gameTicket: string }>,
    ) {
        this.forms.register('game/AYPDK/UIAYPDK_Play', {
            zOrder: 20,
            lifecycle: {
                onCreate: (form) => this.playController?.onCreate(form),
                onShow: () => {
                    this.lobbyNode.active = false;
                    this.playController?.onShow();
                },
                onClose: () => { if (!this.inGame) this.lobbyNode.active = true; },
                onDestroy: () => this.playController?.destroy(),
            },
        });
        this.forms.register('game/AYPDK/UIAYPDK_Result', {
            zOrder: 24,
            lifecycle: {
                onCreate: (form) => this.resultController?.onCreate(form),
                onShow: (_form, setEnd) => this.resultController?.onShow(setEnd),
                onDestroy: () => this.resultController?.destroy(),
            },
        });
        this.forms.register('aypdk/ui/aypdk_UIMessage02', {
            zOrder: 28,
            lifecycle: {
                onCreate: (form) => this.dissolveController?.onCreate(form),
                onShow: () => this.dissolveController?.onShow(),
                onDestroy: () => this.dissolveController?.destroy(),
            },
        });
        this.forms.register('game/AYPDK/UIAYPDK_Record', {
            zOrder: 25,
            lifecycle: {
                onCreate: (form) => this.recordController?.onCreate(form),
                onShow: () => this.recordController?.onShow(),
                onDestroy: () => this.recordController?.destroy(),
            },
        });
        this.forms.register('game/AYPDK/UIAYPDKVideo', {
            zOrder: 20,
            lifecycle: {
                onCreate: (form) => this.replayController?.onCreate(form),
                onShow: (_form, playBackCode) => {
                    this.lobbyNode.active = false;
                    this.replayController?.onShow(playBackCode);
                },
                onDestroy: () => this.replayController?.destroy(),
            },
        });
        this.forms.register('game/AYPDK/aypdk_UIShareMore', {
            zOrder: 30,
            lifecycle: {
                onCreate: (form) => this.shareController?.onCreate(form),
                onDestroy: () => this.shareController?.destroy(),
            },
        });
    }

    public accepts(ticket: LegacySubgameTicket): boolean {
        const gameId = Number(ticket.gameId ?? 0);
        const gameName = String(ticket.gameName ?? '').trim().toLowerCase();
        return gameId === 77 || gameName === 'aypdk';
    }

    public async enter(ticket: LegacySubgameTicket): Promise<void> {
        if (this.switching || this.inGame) return;
        const gameId = Number(ticket.gameId ?? 0);
        const gameName = String(ticket.gameName || (gameId === 77 ? 'aypdk' : '')).trim().toLowerCase();
        if (gameId !== 77 && gameName !== 'aypdk') {
            await this.prepareExternalHandoff(ticket, gameId, gameName);
            return;
        }
        const roomId = Number(ticket.roomId ?? ticket.roomID ?? 0);
        if (!Number.isSafeInteger(roomId) || roomId <= 0) {
            await this.showMessage('房间数据无效，请重新进入');
            return;
        }
        this.switching = true;
        this.sourceTicket = { ...ticket };
        try {
            const server = await this.hallClient.request<GameServerInfo>('room.CBaseGameTypeUrl', { gametype: 77 });
            if (server.isStart === false) throw new Error('游戏维护中，请稍后重试');
            const gameToken = (await this.refreshRoomConnection(roomId)).gameTicket;
            const gameClient = createOwnedGameClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, this.gatewayEndpoint())
                .resumeWithToken(this.account, gameToken, 'aypdk');
            const runtime = new AypdkRuntime(gameClient, {
                playerId: role.playerId,
                isActualGameScene: () => this.inGame,
                onRoomReady: () => { void this.forms.show('game/AYPDK/UIAYPDK_Play'); },
                onEvent: (event, body) => {
                    this.playController?.onEvent(event, body);
                    if (event === 'AYPDKSetEnd') {
                        void this.forms.show('game/AYPDK/UIAYPDK_Result', runtime.getRoomSet().GetRoomSetProperty('setEnd'));
                    }
                    if (event === 'AYPDK_PosContinueGame') this.forms.close('game/AYPDK/UIAYPDK_Result');
                    if (event === 'AYPDK_StartVoteDissolve') {
                        void this.forms.show('aypdk/ui/aypdk_UIMessage02');
                    }
                    if (event === 'PosDealVote') this.dissolveController?.onVote(body);
                    if (event === 'AYPDK_DissolveRoom') this.forms.close('aypdk/ui/aypdk_UIMessage02', true);
                    if (event === 'RoomEnd') {
                        this.forms.close('game/AYPDK/UIAYPDK_Result');
                        void this.forms.show('game/AYPDK/UIAYPDK_Record');
                    }
                    this.lobbyNode.emit('legacy-aypdk-event', { event, body });
                },
                onMessage: (message) => { void this.showMessage(message); },
                onExit: () => { void this.leave('room-not-found'); },
            });
            this.runtime = runtime;
            this.playController = new AypdkPlayController(
                runtime,
                (reason) => { void this.leave(reason); },
                (message) => { void this.showMessage(message); },
            );
            this.resultController = new AypdkResultController(
                runtime,
                this.forms,
                (reason) => { void this.leave(reason); },
            );
            this.dissolveController = new AypdkDissolveController(
                runtime,
                this.forms,
                (message) => { void this.showMessage(message); },
            );
            this.shareController = new AypdkShareController(runtime, this.forms, (request) => {
                this.lobbyNode.emit('legacy-share-request', request);
            });
            this.recordController = new AypdkRecordController(
                runtime,
                (reason) => { void this.leave(reason); },
                (message) => { void this.showMessage(message); },
                this.shareController,
                () => { void this.forms.show('game/AYPDK/aypdk_UIShareMore'); },
            );
            await runtime.enterRoom(roomId);
            this.inGame = true;
            this.lobbyNode.emit('legacy-aypdk-room-ready', {
                ticket, room: runtime.getRoom().GetRoomDataInfo(),
            });
        } catch (error: unknown) {
            this.sourceTicket = null;
            let message = error instanceof Error ? error.message : '进入游戏失败';
            try {
                await this.recoverHall();
            } catch (recoveryError: unknown) {
                const detail = recoveryError instanceof Error ? recoveryError.message : '大厅恢复失败';
                message = `${message}；${detail}`;
            }
            await this.showMessage(message);
        } finally {
            this.switching = false;
        }
    }

    public async enterReplay(playBackCode: string): Promise<void> {
        if (this.switching || this.inGame || !playBackCode) return;
        await this.showMessage('历史回放仅通过大厅战绩接口加载，不再建立旧游戏服会话');
    }
    public async leave(reason = 'user-exit'): Promise<void> {
        if (this.switching) return;
        this.switching = true;
        try {
            await this.recoverHall();
            this.inGame = false;
            this.forms.close('game/AYPDK/UIAYPDK_Play', true);
            this.forms.close('game/AYPDK/UIAYPDKVideo', true);
            this.lobbyNode.active = true;
            const source = this.sourceTicket;
            this.sourceTicket = null;
            this.lobbyNode.emit('subgame-returned', { reason, source, fromClub: Boolean(source?.fromClub) });
        } finally {
            this.switching = false;
        }
    }

    public destroy(): void {
        this.externalSwitchGeneration += 1;
        this.runtime?.destroy();
        this.runtime = null;
        this.playController?.destroy();
        this.playController = null;
        this.resultController?.destroy();
        this.resultController = null;
        this.dissolveController?.destroy();
        this.dissolveController = null;
        this.recordController?.destroy();
        this.recordController = null;
        this.replayController?.destroy();
        this.replayController = null;
        this.shareController?.destroy();
        this.shareController = null;
        this.gameClient?.close();
        this.gameClient = null;
        this.sourceTicket = null;
    }

    private async recoverHall(): Promise<void> {
        const game = this.gameClient;
        this.runtime?.destroy();
        this.runtime = null;
        this.playController?.destroy();
        this.playController = null;
        this.resultController?.destroy();
        this.resultController = null;
        this.dissolveController?.destroy();
        this.dissolveController = null;
        this.recordController?.destroy();
        this.recordController = null;
        this.replayController?.destroy();
        this.replayController = null;
        game?.close();
        this.gameClient = null;
        if (!this.hallClient.isConnected()) await this.hallClient.request('gateway.heartbeat', { clientTime: Date.now() });
    }

    private gatewayEndpoint(): string {
        return resolveRuntimeEndpoints().hallWebSocketUrl;
    }

    private async prepareExternalHandoff(
        ticket: LegacySubgameTicket,
        gameId: number,
        gameName: string,
    ): Promise<void> {
        if (this.switching) return;
        if (!Number.isSafeInteger(gameId) || gameId < 0 || !gameName) {
            await this.showMessage('玩法数据无效，请重新进入');
            return;
        }
        this.switching = true;
        const generation = ++this.externalSwitchGeneration;
        try {
            const server = await this.hallClient.request<GameServerInfo>('room.CBaseGameTypeUrl', { gametype: gameId });
            if (generation !== this.externalSwitchGeneration) return;
            if (server.isStart === false) throw new Error('游戏维护中，请稍后重试');
            const roomId = Number(ticket.roomId ?? ticket.roomID ?? 0);
            if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('房间数据无效，请重新进入');
            const gameToken = (await this.refreshRoomConnection(roomId)).gameTicket;
            if (generation !== this.externalSwitchGeneration) return;
            let consumed = false;
            const consume = (): boolean => {
                if (consumed || generation !== this.externalSwitchGeneration) return false;
                consumed = true;
                return true;
            };
            const cancel = (): void => {
                if (consumed || generation !== this.externalSwitchGeneration) return;
                this.externalSwitchGeneration += 1;
                this.switching = false;
            };
            const handoff: LegacyExternalSubgameHandoff = {
                ...ticket,
                gameId,
                gameName,
                gameServerUrl: this.gatewayEndpoint(),
                gameToken,
                consume,
                cancel,
            };
            this.lobbyNode.emit(ticket.playBackCode ? 'authoritative-replay-handoff' : 'authoritative-subgame-handoff', handoff);
        } catch (error: unknown) {
            if (generation === this.externalSwitchGeneration) {
                await this.showMessage(error instanceof Error ? error.message : '进入游戏失败');
            }
        } finally {
            if (generation === this.externalSwitchGeneration) this.switching = false;
        }
    }

    private async showMessage(message: string): Promise<void> {
        await this.forms.show('UIMessage_Drift', null, null, message);
    }
}
