import { Button, Node } from 'cc';
import type { LegacyFormManager } from '../../Common/Code/Runtime/ui/LegacyFormManager';
import {
    ProductionApiClient,
    type AccessTokenSource,
    type ProductionApiConfig,
    type SessionRefresher,
    type SessionRefreshPolicy,
} from '../../Common/Code/Runtime/Activity/ProductionApiClient';
import { ActivityGateway } from '../../Common/Code/Runtime/Activity/ActivityGateway';
import { LuckDrawGateway } from '../../Common/Code/Runtime/Activity/LuckDrawGateway';
import { RankingGateway } from '../../Common/Code/Runtime/Ranking/RankingGateway';
import { ProfileGateway } from '../../Common/Code/Runtime/Profile/ProfileGateway';
import { LocationGateway } from '../../Common/Code/Runtime/Location/LocationGateway';
import { InventoryGateway } from '../../Common/Code/Runtime/Inventory/InventoryGateway';
import { ReplayGateway } from '../../Common/Code/Runtime/Replay/ReplayGateway';
import { TaskController } from '../../Modules/Activity/Code/TaskController';
import { RankingController } from '../../Modules/Ranking/Code/RankingController';
import { ProfileController } from '../../Modules/Profile/Code/ProfileController';
import { LocationController } from './LocationController';
import { StoreController } from '../../Modules/Store/Code/StoreController';
import { ReplayController } from '../../Modules/Records/Code/ReplayController';
import { ClubStatsController } from '../../Modules/Records/Code/ClubStatsController';
import type { ProtocolClient } from '../../Common/Code/Runtime/network/ProtocolClient';
import { LuckDrawController } from '../../Modules/Activity/Code/LuckDrawController';
import { SupportCaseClient } from '../../Modules/Support/Code/SupportCaseClient';
import { SupportLiveSessionClient } from '../../Modules/Support/Code/SupportLiveSessionClient';
import { SupportController } from '../../Modules/Support/Code/SupportController';
import { bindSupportNumberCopy } from '../../Modules/Support/Code/SupportNumberCopyController';
import { IdentityController } from '../../Modules/Profile/Code/IdentityController';
import { WeChatBindingController } from '../../Modules/Profile/Code/WeChatBindingController';
import { ProfileMediaGateway } from '../../Common/Code/Runtime/Profile/ProfileMediaGateway';
import { CompetitionGateway } from '../../Common/Code/Runtime/Competition/CompetitionGateway';
import { CompetitionController } from '../../Modules/Tournament/Code/CompetitionController';
import { RoomSafetyGateway } from '../../Modules/Support/Code/RoomSafety/RoomSafetyGateway';
import { RoomSafetyController } from '../../Modules/Support/Code/RoomSafety/RoomSafetyController';
import { FeedbackController } from '../../Modules/Support/Code/FeedbackController';
import { GameHelpController } from '../../Modules/Help/Code/GameHelpController';

interface LobbySupportCapability {
    open(): Promise<void>;
    destroy(): void;
}

class DisabledSupportCapability implements LobbySupportCapability {
    public constructor(private readonly forms: LegacyFormManager) {}
    public async open(): Promise<void> {
        const form = await this.forms.show('UILobbyService');
        if (!form) return;
        form.find('Popup/Tag/Close')?.once(Button.EventType.CLICK,
            () => this.forms.closeAfterPointer('UILobbyService'));
        bindSupportNumberCopy(form, this.forms);
        form.node.emit('support-capability-disabled');
    }
    public destroy(): void {}
}

export class LobbyModuleCoordinator {
    public readonly task: TaskController;
    public readonly rank: RankingController;
    public readonly profile: ProfileController;
    public readonly location: LocationController;
    public readonly store: StoreController;
    public readonly replay: ReplayController;
    public readonly clubStats: ClubStatsController;
    public readonly luckDraw: LuckDrawController;
    public readonly support: LobbySupportCapability;
    public readonly identity: IdentityController;
    public readonly wechat: WeChatBindingController;
    public readonly competition: CompetitionController;
    public readonly roomSafety: RoomSafetyController;
    public readonly feedback: FeedbackController;
    public readonly help: GameHelpController;
    private readonly api: ProductionApiClient;
    private readonly luckDrawApi: ProductionApiClient;
    private readonly supportApi: ProductionApiClient | null;
    private readonly competitionApi: ProductionApiClient;

    public constructor(forms: LegacyFormManager, node: Node, token: AccessTokenSource, playerId: string,
        protocolClient: ProtocolClient,
        error: (e: unknown) => void, refreshSession?: SessionRefresher,
        shouldRefreshSession?: SessionRefreshPolicy) {
        const config = (globalThis as typeof globalThis & {
            __aoo_RUNTIME_CONFIG__?: ProductionApiConfig & { competitionHttpUrl?: string };
        }).__aoo_RUNTIME_CONFIG__ ?? {};
        if (config.supportEnabled && !config.supportHttpUrl) throw new Error('supportHttpUrl is required when supportEnabled is true');
        this.api = new ProductionApiClient(token, playerId, undefined, undefined, refreshSession, shouldRefreshSession);
        this.luckDrawApi = new ProductionApiClient(token, playerId, 8000, config.luckDrawHttpUrl, refreshSession, shouldRefreshSession);
        this.supportApi = config.supportEnabled
            ? new ProductionApiClient(token, playerId, 8000, config.supportHttpUrl, refreshSession, shouldRefreshSession)
            : null;
        this.competitionApi = new ProductionApiClient(token, playerId, 8000, config.competitionHttpUrl, refreshSession, shouldRefreshSession);
        this.task = new TaskController(forms, node, new ActivityGateway(this.api), error);
        this.rank = new RankingController(forms, node, new RankingGateway(this.api), error);
        this.profile = new ProfileController(forms, node, new ProfileGateway(this.api), new ProfileMediaGateway(token, playerId), error);
        this.location = new LocationController(node, new LocationGateway(this.api), error);
        this.store = new StoreController(forms, node, new InventoryGateway(this.api), error);
        this.replay = new ReplayController(forms, node, new ReplayGateway(this.api), playerId, error);
        this.clubStats = new ClubStatsController(forms, protocolClient, node, error);
        this.luckDraw = new LuckDrawController(forms, node, new LuckDrawGateway(this.luckDrawApi), error);
        this.support = config.supportEnabled && this.supportApi && config.supportHttpUrl
            ? new SupportController(forms, new SupportCaseClient(this.supportApi),
                new SupportLiveSessionClient(config.supportHttpUrl, async () => (typeof token === 'function' ? token() : token)), error)
            : new DisabledSupportCapability(forms);
        this.identity = new IdentityController(forms, node, typeof token === 'function' ? token() : token, playerId, error);
        this.wechat = new WeChatBindingController(node, typeof token === 'function' ? token() : token, playerId, error);
        this.competition = new CompetitionController(node, new CompetitionGateway(this.competitionApi), error);
        this.roomSafety = new RoomSafetyController(node, new RoomSafetyGateway(this.api), error);
        this.feedback = new FeedbackController(forms, new SupportCaseClient(this.api), error);
        this.help = new GameHelpController();
        for (const controller of [this.task, this.rank, this.profile, this.store, this.replay, this.clubStats, this.competition, this.roomSafety]) {
            controller.install();
        }
    }

    public destroy(): void {
        this.roomSafety.destroy();
        this.feedback.destroy();
        this.competition.destroy();
        this.task.destroy();
        this.rank.destroy();
        this.profile.destroy();
        this.location.destroy();
        this.store.destroy();
        this.replay.destroy();
        this.clubStats.destroy();
        this.luckDraw.destroy();
        this.support.destroy();
        this.identity.destroy();
        this.wechat.destroy();
        this.competitionApi.destroy();
        this.supportApi?.destroy();
        this.luckDrawApi.destroy();
        this.api.destroy();
    }
}
