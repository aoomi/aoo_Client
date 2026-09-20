import { assetManager, Camera, instantiate, Node, Prefab, view } from 'cc';
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
    readonly onCD299ExitRequested?: (roomId: number) => Promise<void>;
}

/** The single static composition point for native game runtimes shipped by Creator. */
export function createProductionGameRuntimeEntryRegistry(
    options: ProductionGameRuntimeEntriesOptions,
): GameRuntimeEntryRegistry {
    // Dynamic room UI must live under the scene's real Canvas so rendering and
    // pointer/touch hit testing use the same UI camera and coordinate space.
    const roomHost = options.lobbyNode;
    const cn297Host = createCN297Host(roomHost);
    const presentation = new GameRuntimePresentationLifecycle(options.lobbyNode);
    return createGameRuntimeEntryRegistry([
        options.pdk,
        createCD299GameRuntimeEntry({
            parent: roomHost,
            playerId: options.playerId,
            requestPrefix: 'cd299',
            onExitRequested: options.onCD299ExitRequested,
        }),
        createCN298GameRuntimeEntry({
            playerId: options.playerId,
            requestPrefix: 'cn298',
            host: () => roomHost,
        }),
        createCN297GameRuntimeEntry(cn297Host, () => ({
            playerId: options.playerId,
        })),
    ].map(entry => withPresentationLifecycle(entry, presentation)));
}

type ChildPresentationState = { readonly node: Node; readonly active: boolean };

/**
 * Owns the visual handoff between the persistent lobby/loading Canvas and a
 * dynamically mounted game room. The scene UI Camera is deliberately kept
 * active: feature prefabs mounted beside the Canvas still require it to render.
 */
class GameRuntimePresentationLifecycle {
    private hiddenChildren: ChildPresentationState[] = [];
    private enteredCount = 0;

    public constructor(private readonly source: Node) {}

    public preparing(): void {
        if (!this.source.isValid || this.hiddenChildren.length > 0) return;
        // Snapshot before the feature mounts its room node. The new room must
        // remain visible; only the pre-existing lobby/loading presentation hides.
        this.hiddenChildren = this.source.children.map(node => ({ node, active: node.active }));
    }

    public entered(entryId: string): void {
        this.enteredCount += 1;
        if (!this.source.isValid) return;
        for (const { node, active } of this.hiddenChildren) {
            const ownsCamera = Boolean(node.getComponent(Camera) ?? node.getComponentInChildren(Camera));
            if (active && !ownsCamera) node.active = false;
        }
        console.info('[GameRuntimePresentation]', {
            action: 'ENTERED', entryId, source: this.source.name,
            hiddenChildren: this.hiddenChildren.filter(item => item.active && !item.node.active).map(item => item.node.name),
            cameraPreserved: Boolean(this.source.getComponent(Camera) ?? this.source.getComponentInChildren(Camera)),
        });
    }

    public exited(entryId: string): void {
        this.enteredCount = Math.max(0, this.enteredCount - 1);
        if (this.enteredCount > 0) return;
        for (const { node, active } of this.hiddenChildren) {
            if (node.isValid) node.active = active;
        }
        this.hiddenChildren = [];
        console.info('[GameRuntimePresentation]', { action: 'EXITED', entryId, source: this.source.name });
    }

    public failed(): void {
        if (this.enteredCount === 0) this.hiddenChildren = [];
    }
}

/** Enter success is the only boundary allowed to hide the source presentation. */
function withPresentationLifecycle(entry: GameRuntimeEntry,
    presentation: GameRuntimePresentationLifecycle): GameRuntimeEntry {
    let entered = false;
    return {
        id: entry.id,
        canonicalGameCodes: entry.canonicalGameCodes,
        families: entry.families,
        preload: entry.preload ? handoff => entry.preload!(handoff) : undefined,
        enter: async handoff => {
            presentation.preparing();
            try {
                await entry.enter(handoff);
                if (!entered) {
                    entered = true;
                    presentation.entered(entry.id);
                }
            } catch (error) {
                presentation.failed();
                throw error;
            }
        },
        enterReplay: entry.enterReplay ? async handoff => {
            presentation.preparing();
            try {
                await entry.enterReplay!(handoff);
                if (!entered) {
                    entered = true;
                    presentation.entered(entry.id);
                }
            } catch (error) {
                presentation.failed();
                throw error;
            }
        } : undefined,
        destroy: () => {
            entry.destroy();
            if (entered) presentation.exited(entry.id);
            entered = false;
        },
    };
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
