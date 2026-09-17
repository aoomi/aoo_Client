import { assetManager, instantiate, Node, Prefab, view } from 'cc';
import { createCD299GameRuntimeEntry } from '../../../Poker/CX/CD299/Code/CD299GameRuntimeEntry';
import { createCN298GameRuntimeEntry } from '../../../Poker/NN/Common/Code/CN298RuntimeEntry';
import {
    createCN297GameRuntimeEntry,
    type CN297RuntimeHost,
} from '../../../Poker/ZJH/Common/Code/CN297GameRuntimeEntry';
import type { GameRuntimeEntry } from './GameRuntimeEntry';
import { GameRuntimeEntryRegistry } from './GameRuntimeEntryRegistry';

/** Composition root used by the lobby; feature packages provide isolated entries. */
export function createGameRuntimeEntryRegistry(entries: readonly GameRuntimeEntry[]): GameRuntimeEntryRegistry {
    const registry = new GameRuntimeEntryRegistry();
    for (const entry of entries) registry.register(entry);
    return registry;
}

export interface ProductionGameRuntimeEntriesOptions {
    readonly pdk: GameRuntimeEntry;
    readonly lobbyNode: Node;
    readonly playerId: number;
}

/** The single static composition point for native game runtimes shipped by Creator. */
export function createProductionGameRuntimeEntryRegistry(
    options: ProductionGameRuntimeEntriesOptions,
): GameRuntimeEntryRegistry {
    const roomHost = options.lobbyNode.parent ?? options.lobbyNode;
    const cn297Host = createCN297Host(roomHost);
    return createGameRuntimeEntryRegistry([
        options.pdk,
        createCD299GameRuntimeEntry({
            parent: roomHost,
            playerId: options.playerId,
            requestPrefix: 'cd299',
            onEntered: () => { options.lobbyNode.active = false; },
        }),
        createCN298GameRuntimeEntry({
            playerId: options.playerId,
            requestPrefix: 'cn298',
            host: () => roomHost,
        }),
        createCN297GameRuntimeEntry(cn297Host, () => ({
            playerId: options.playerId,
        })),
    ]);
}

function createCN297Host(parent: Node): CN297RuntimeHost {
    return {
        isPortrait: () => {
            const size = view.getVisibleSize();
            return size.height > size.width;
        },
        loadAndMountPrefab: async (assetPath, requestedBundle) => {
            const bundleName = String(requestedBundle ?? '').trim() || 'poker-zjh';
            const bundle = assetManager.getBundle(bundleName) ?? await new Promise<ReturnType<typeof assetManager.getBundle>>(
                (resolve, reject) => assetManager.loadBundle(bundleName, (error, loaded) =>
                    error || !loaded ? reject(error ?? new Error(`[CN297] bundle unavailable name=${bundleName}`)) : resolve(loaded)),
            );
            if (!bundle) throw new Error(`[CN297] bundle unavailable name=${bundleName}`);
            const prefab = await new Promise<Prefab>((resolve, reject) => bundle.load(assetPath, Prefab,
                (error, loaded) => error || !loaded
                    ? reject(error ?? new Error(`[CN297] prefab unavailable path=${assetPath}`)) : resolve(loaded)));
            const node = instantiate(prefab);
            parent.addChild(node);
            return node;
        },
        unmount: node => { if (node.isValid) node.destroy(); },
    };
}
