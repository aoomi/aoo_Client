import type { LegacySubgameTicket } from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { CommonRoomFeaturePorts, GameRuntimeEntry } from '../../../../../Common/Code/Runtime/GameRuntimeEntry';
import { PDK_BUSINESS_CODE_LIST, supportsPdkPlayVersion } from '../Regional/PdkBusinessCodes';
import { PdkGameSceneLauncher } from './PdkGameSceneLauncher';
import { PdkSwitchCoordinator } from './PdkSwitchCoordinator';

/** Keeps the established PDK scene and replay paths behind the shared game-entry contract. */
export class PdkRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'common-pdk';
    public readonly canonicalGameCodes = Object.freeze([...PDK_BUSINESS_CODE_LIST]);
    public readonly families = Object.freeze(['poker-pao-de-kuai']);
    public supportsPlayVersion(playVersion: string, handoff: LegacySubgameTicket): boolean {
        const gameCode = String(handoff.gameName ?? '').trim().toLowerCase();
        return supportsPdkPlayVersion(gameCode, playVersion);
    }

    public constructor(
        private readonly launcher: PdkGameSceneLauncher,
        private readonly coordinator: PdkSwitchCoordinator,
    ) {}

    public preload(): Promise<void> {
        return this.launcher.prewarmDefaultRoom();
    }

    public enter(handoff: LegacySubgameTicket): Promise<void> {
        return this.launcher.launch(handoff);
    }

    public enterReplay(handoff: LegacySubgameTicket): Promise<void> {
        return this.coordinator.enterReplay(String(handoff.playBackCode ?? ''));
    }

    public enterExternalReplay(handoff: LegacySubgameTicket): void {
        this.coordinator.enterExternalReplay(handoff);
    }

    public commonRoomPorts(): CommonRoomFeaturePorts | null {
        // Direct startup recovery creates the live room coordinator inside
        // PdkGameSceneLauncher after the GameRoom2D scene is mounted.  The
        // coordinator injected by LobbyScreenController is the lobby-owned
        // instance and has no gameplay session on that path.  Prefer the
        // launcher-owned coordinator so CommonRoom composes against the same
        // room runtime for both ordinary entry and recovery/reconnect.
        const launcherPorts = this.launcher.commonRoomPorts();
        const coordinatorPorts = launcherPorts ? null : this.coordinator.commonRoomPorts();
        return launcherPorts ?? coordinatorPorts;
    }

    public destroy(): void {
        this.launcher.destroy();
        this.coordinator.destroy();
    }
}
