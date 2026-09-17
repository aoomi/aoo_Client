import type { LegacySubgameTicket } from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { GameRuntimeEntry } from '../../../../../Common/Code/Runtime/GameRuntimeEntry';
import { CommonPdkGameSceneLauncher } from './CommonPdkGameSceneLauncher';
import { CommonPdkSwitchCoordinator } from './CommonPdkSwitchCoordinator';

/** Keeps the established PDK scene and replay paths behind the shared game-entry contract. */
export class CommonPdkRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'common-pdk';
    public readonly canonicalGameCodes = Object.freeze(['CD201', 'NJ201', 'LS201']);
    public readonly families = Object.freeze(['poker-pao-de-kuai']);

    public constructor(
        private readonly launcher: CommonPdkGameSceneLauncher,
        private readonly coordinator: CommonPdkSwitchCoordinator,
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

    public destroy(): void {
        this.launcher.destroy();
        this.coordinator.destroy();
    }
}
