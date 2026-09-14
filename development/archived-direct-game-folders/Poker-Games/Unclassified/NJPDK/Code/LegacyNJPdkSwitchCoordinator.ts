import { Node } from 'cc';
import type { AuthenticatedAccount } from '../../../../../../core/runtime/auth/AuthTypes';
import { LegacyWebSocketClient } from '../../../../../../core/runtime/network/LegacyWebSocketClient';
import { LegacyRoleGateway } from '../../../../../../core/runtime/role/LegacyRoleGateway';
import { LegacyFormManager } from '../../../../../../core/runtime/ui/LegacyFormManager';
import { resolveRuntimeEndpoints } from '../../../../../../core/runtime/config/RuntimeEndpoints';
import { LegacyNJPdkRuntime } from './LegacyNJPdkRuntime';
import { LegacyNJPdkPlayController } from './LegacyNJPdkPlayController';
import { LegacyNJPdkResultController } from './LegacyNJPdkResultController';
import { LegacyNJPdkDissolveController } from './LegacyNJPdkDissolveController';
import { LegacyNJPdkRecordController } from './LegacyNJPdkRecordController';
import { LegacyNJPdkReplayController } from './LegacyNJPdkReplayController';
import { LegacyNJPdkShareController } from './LegacyNJPdkShareController';

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

export class LegacyNJPdkSwitchCoordinator {
    private gameClient: LegacyWebSocketClient | null = null;
    private runtime: LegacyNJPdkRuntime | null = null;
    private playController: LegacyNJPdkPlayController | null = null;
    private resultController: LegacyNJPdkResultController | null = null;
    private dissolveController: LegacyNJPdkDissolveController | null = null;
    private recordController: LegacyNJPdkRecordController | null = null;
    private replayController: LegacyNJPdkReplayController | null = null;
    private shareController: LegacyNJPdkShareController | null = null;
    private switching = false;
    private inGame = false;
    private sourceTicket: LegacySubgameTicket | null = null;
    private externalSwitchGeneration = 0;

    public enterExternalReplay(ticket: LegacySubgameTicket): void {
        const gameName = String(ticket.gameName ?? '').trim().toLowerCase();
        const gameIdByName: Record<string, number> = { hzmj: 0, scjymj: 628, njpdk: 629 };
        const gameId = Number(ticket.gameId ?? gameIdByName[gameName]);
        void this.prepareExternalHandoff(ticket, gameId, gameName);
    }

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly playerId: number,
        private readonly hallClient: LegacyWebSocketClient,
        private readonly forms: LegacyFormManager,
        private readonly lobbyNode: Node,
    ) {
        this.forms.register('game/NJPDK/UINJPDK_Play', {
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
        this.forms.register('game/NJPDK/UINJPDK_Result', {
            zOrder: 24,
            lifecycle: {
                onCreate: (form) => this.resultController?.onCreate(form),
                onShow: (_form, setEnd) => this.resultController?.onShow(setEnd),
                onDestroy: () => this.resultController?.destroy(),
            },
        });
        this.forms.register('njpdk/ui/njpdk_UIMessage02', {
            zOrder: 28,
            lifecycle: {
                onCreate: (form) => this.dissolveController?.onCreate(form),
                onShow: () => this.dissolveController?.onShow(),
                onDestroy: () => this.dissolveController?.destroy(),
            },
        });
        this.forms.register('game/NJPDK/UINJPDK_Record', {
            zOrder: 25,
            lifecycle: {
                onCreate: (form) => this.recordController?.onCreate(form),
                onShow: () => this.recordController?.onShow(),
                onDestroy: () => this.recordController?.destroy(),
            },
        });
        this.forms.register('game/NJPDK/UINJPDKVideo', {
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
        this.forms.register('game/NJPDK/njpdk_UIShareMore', {
            zOrder: 30,
            lifecycle: {
                onCreate: (form) => this.shareController?.onCreate(form),
                onDestroy: () => this.shareController?.destroy(),
            },
        });
    }

    public async enter(ticket: LegacySubgameTicket): Promise<void> {
        if (this.switching || this.inGame) return;
        const gameId = Number(ticket.gameId ?? 0);
        const gameName = String(ticket.gameName || (gameId === 629 ? 'njpdk' : '')).trim().toLowerCase();
        if (gameId !== 629 && gameName !== 'njpdk') {
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
            const server = await this.hallClient.request<GameServerInfo>('room.CBaseGameTypeUrl', { gametype: 629 });
            if (server.isStart === false) throw new Error('游戏维护中，请稍后重试');
            const gameToken = await this.hallClient.request<unknown>('base.C1110UUID', { gameName: 'njpdk' });
            this.hallClient.setReconnectAuthenticator(null);
            this.hallClient.close();
            const gameClient = new LegacyWebSocketClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, this.endpoint(server))
                .resumeWithToken(this.account, gameToken, 'njpdk');
            const runtime = new LegacyNJPdkRuntime(gameClient, {
                playerId: role.playerId,
                isActualGameScene: () => this.inGame,
                onRoomReady: () => { void this.forms.show('game/NJPDK/UINJPDK_Play'); },
                onEvent: (event, body) => {
                    this.playController?.onEvent(event, body);
                    if (event === 'NJPDKSetEnd') {
                        void this.forms.show('game/NJPDK/UINJPDK_Result', runtime.getRoomSet().GetRoomSetProperty('setEnd'));
                    }
                    if (event === 'NJPDK_PosContinueGame') this.forms.close('game/NJPDK/UINJPDK_Result');
                    if (event === 'NJPDK_StartVoteDissolve') {
                        void this.forms.show('njpdk/ui/njpdk_UIMessage02');
                    }
                    if (event === 'PosDealVote') this.dissolveController?.onVote(body);
                    if (event === 'NJPDK_DissolveRoom') this.forms.close('njpdk/ui/njpdk_UIMessage02', true);
                    if (event === 'RoomEnd') {
                        this.forms.close('game/NJPDK/UINJPDK_Result');
                        void this.forms.show('game/NJPDK/UINJPDK_Record');
                    }
                    this.lobbyNode.emit('legacy-njpdk-event', { event, body });
                },
                onMessage: (message) => { void this.showMessage(message); },
                onExit: () => { void this.leave('room-not-found'); },
            });
            this.runtime = runtime;
            this.playController = new LegacyNJPdkPlayController(
                runtime,
                (reason) => { void this.leave(reason); },
                (message) => { void this.showMessage(message); },
            );
            this.resultController = new LegacyNJPdkResultController(
                runtime,
                this.forms,
                (reason) => { void this.leave(reason); },
            );
            this.dissolveController = new LegacyNJPdkDissolveController(
                runtime,
                this.forms,
                (message) => { void this.showMessage(message); },
            );
            this.shareController = new LegacyNJPdkShareController(runtime, this.forms, (request) => {
                this.lobbyNode.emit('legacy-share-request', request);
            });
            this.recordController = new LegacyNJPdkRecordController(
                runtime,
                (reason) => { void this.leave(reason); },
                (message) => { void this.showMessage(message); },
                this.shareController,
                () => { void this.forms.show('game/NJPDK/njpdk_UIShareMore'); },
            );
            await runtime.enterRoom(roomId);
            this.inGame = true;
            this.lobbyNode.emit('legacy-njpdk-room-ready', {
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
        this.switching = true;
        this.sourceTicket = { gameId: 629, gameName: 'njpdk', playBackCode };
        try {
            const server = await this.hallClient.request<GameServerInfo>('room.CBaseGameTypeUrl', { gametype: 629 });
            if (server.isStart === false) throw new Error('游戏维护中，请稍后重试');
            const gameToken = await this.hallClient.request<unknown>('base.C1110UUID', { gameName: 'njpdk' });
            this.hallClient.setReconnectAuthenticator(null);
            this.hallClient.close();
            const gameClient = new LegacyWebSocketClient();
            this.gameClient = gameClient;
            const role = await new LegacyRoleGateway(gameClient, this.endpoint(server)).resumeWithToken(this.account, gameToken, 'njpdk');
            const runtime = new LegacyNJPdkRuntime(gameClient, {
                playerId: role.playerId,
                isActualGameScene: () => this.inGame,
                onMessage: (message) => { void this.showMessage(message); },
                onExit: () => { void this.leave('replay-exit'); },
            });
            this.runtime = runtime;
            this.replayController = new LegacyNJPdkReplayController(
                runtime,
                (reason) => { void this.leave(reason); },
                (message) => { void this.showMessage(message); },
            );
            this.inGame = true;
            await this.forms.show('game/NJPDK/UINJPDKVideo', playBackCode);
        } catch (error: unknown) {
            this.sourceTicket = null;
            let message = error instanceof Error ? error.message : '进入回放失败';
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

    public async leave(reason = 'user-exit'): Promise<void> {
        if (this.switching) return;
        this.switching = true;
        try {
            await this.recoverHall();
            this.inGame = false;
            this.forms.close('game/NJPDK/UINJPDK_Play', true);
            this.forms.close('game/NJPDK/UINJPDKVideo', true);
            this.lobbyNode.active = true;
            const source = this.sourceTicket;
            this.sourceTicket = null;
            this.lobbyNode.emit('legacy-subgame-returned', { reason, source, fromClub: Boolean(source?.fromClub) });
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
        this.gameClient?.setReconnectAuthenticator(null);
        this.gameClient?.close();
        this.gameClient = null;
        this.sourceTicket = null;
    }

    private async recoverHall(): Promise<void> {
        const game = this.gameClient;
        const hallWsUrl = resolveRuntimeEndpoints().hallWebSocketUrl;
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
        if (game?.isConnected()) {
            try {
                const hallToken = await game.request<unknown>('base.C1110UUID', { gameName: 'hall' });
                game.setReconnectAuthenticator(null);
                game.close();
                await new LegacyRoleGateway(this.hallClient, hallWsUrl)
                    .resumeWithToken(this.account, hallToken, 'hall');
                this.gameClient = null;
                return;
            } catch { /* Fall through to the normal-login recovery used by the old failure path. */ }
        }
        game?.setReconnectAuthenticator(null);
        game?.close();
        this.gameClient = null;
        this.hallClient.close();
        await new LegacyRoleGateway(this.hallClient, hallWsUrl).login(this.account);
    }

    private endpoint(server: GameServerInfo): string {
        const publicUrl = String(server.webSocketUrl ?? '').trim();
        if (/^wss?:\/\//.test(publicUrl)) return publicUrl;
        const host = String(server.gameServerIP ?? '').trim();
        const port = Number(server.gameServerPort);
        if (!host || !Number.isSafeInteger(port) || port <= 0) throw new Error('玩法服地址无效');
        return `ws://${host}:${port}`;
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
            const gameToken = await this.hallClient.request<unknown>('base.C1110UUID', { gameName });
            if (generation !== this.externalSwitchGeneration) return;
            let consumed = false;
            const consume = (): boolean => {
                if (consumed || generation !== this.externalSwitchGeneration) return false;
                consumed = true;
                this.hallClient.setReconnectAuthenticator(null);
                this.hallClient.close();
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
                gameServerUrl: this.endpoint(server),
                gameToken,
                consume,
                cancel,
            };
            this.lobbyNode.emit(ticket.playBackCode ? 'legacy-external-replay' : 'legacy-external-subgame', handoff);
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
