import { BrowserKeyValueStorage } from '../../../Common/Code/Runtime/core/Storage';
import { legacyPlatformRuntime } from '../../../Common/Code/Runtime/platform/LegacyPlatformRuntime';
import { resolveRuntimeEndpoints } from '../../../Common/Code/Runtime/config/RuntimeEndpoints';
import { AccountAuthGateway } from '../Auth/UnifiedIdentityAuthGateway';
import { AuthSession } from '../Auth/AuthSession';
import { GuestSessionStore } from '../Auth/GuestSessionStore';
import { LastAccountStore } from '../Auth/LastAccountStore';
import { NetworkRuntime } from '../Network/NetworkRuntime';
import { SceneRouter } from '../Navigation/SceneRouter';
import { RoomRecoveryStore } from '../../../Common/Code/Runtime/room/RoomRecoveryStore';
import { sessionLifecycle } from '../../../Common/Code/Runtime/network/LegacyWebSocketClient';
import { currentAooLoadingBootState } from './LoadingEnvironmentPolicy';
import { StuckRoomCleanupService } from '../../../Common/Code/Runtime/room/StuckRoomCleanupService';

export interface ClientServices {
    readonly auth: AuthSession;
    readonly network: NetworkRuntime;
    readonly scenes: SceneRouter;
    readonly roomRecovery: RoomRecoveryStore;
}

const runtimeKey = Symbol.for('aoo.client.runtime.services');
type RuntimeRegistry = typeof globalThis & { [runtimeKey]?: ClientServices };

/** Presentation scenes may consume the Boot-owned runtime but must never create it. */
export function getStartedClientServices(): ClientServices | null {
    return (globalThis as RuntimeRegistry)[runtimeKey] ?? null;
}

/** The sole composition root. It holds no business state and creates no persistent Cocos node. */
export function startClientServices(): ClientServices {
    const registry = globalThis as RuntimeRegistry;
    if (registry[runtimeKey]) return registry[runtimeKey];
    const storage = new BrowserKeyValueStorage();
    const auth = new AuthSession(
        new AccountAuthGateway({ endpoint: resolveRuntimeEndpoints().apiBaseUrl }),
        new LastAccountStore(storage),
        new GuestSessionStore(storage),
        () => sessionLifecycle.resumeAfterExplicitLogin(),
        async (account) => {
            const bootState = currentAooLoadingBootState();
            if (!bootState.claimRoomCleanup()) return;
            try {
                await new StuckRoomCleanupService().cleanup(account);
            } catch (error: unknown) {
                bootState.releaseRoomCleanupClaim();
                throw error;
            }
        },
    );
    const network = new NetworkRuntime();
    const roomRecovery = new RoomRecoveryStore(storage);
    const scenes = new SceneRouter(auth, network, roomRecovery);
    try {
        auth.start();
        network.start();
        scenes.start();
        legacyPlatformRuntime.start();
    } catch (error: unknown) {
        scenes.dispose();
        network.dispose();
        auth.dispose();
        legacyPlatformRuntime.stop();
        throw error;
    }
    const services: ClientServices = Object.freeze({ auth, network, scenes, roomRecovery });
    registry[runtimeKey] = services;
    return services;
}
