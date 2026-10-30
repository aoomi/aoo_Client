import { assetManager, director, instantiate, Node, Prefab, UITransform } from 'cc';

const COMMON_ROOM_BUNDLE = 'games-common';
const COMMON_ROOM_PREFAB = 'Prefab/CommonRoom';

/** The only feature-facing mount point for the shared CommonRoom prefab. */
export function mountCommonRoomShell(parent: Node): Promise<Node> {
    return new Promise((resolve, reject) => {
        const host = resolveCommonRoomHost(parent);
        if (!host?.isValid || !host.children) {
            reject(new Error('COMMON_ROOM_PARENT_INVALID'));
            return;
        }
        // Canvas is the UI render root. Mounting through a plain Node creates
        // an invisible branch because it is not a UI container. Gameplay may
        // mount only its own content beside this direct Canvas child.
        const existing = host.children.find(child => child.isValid && child.name === 'CommonRoom');
        if (existing) {
            // A failed handoff can leave the direct Canvas child behind after
            // its feature runtime has already gone away.  The public shell is
            // single-instance by design: hand the valid root back to the new
            // lifecycle so it can rebind every capability and seat instead of
            // rejecting the next game entry as a duplicate.
            existing.active = true;
            placeShellInMiddle(host, existing);
            resolve(existing);
            return;
        }
        const mount = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
            if (!bundle) {
                reject(new Error('COMMON_ROOM_BUNDLE_MISSING'));
                return;
            }
            bundle.load(COMMON_ROOM_PREFAB, Prefab, (error, prefab) => {
                if (error || !prefab) {
                    reject(error ?? new Error('COMMON_ROOM_PREFAB_MISSING'));
                    return;
                }
                const root = instantiate(prefab);
                if (!host.isValid || !host.children) {
                    root.destroy();
                    reject(new Error('COMMON_ROOM_PARENT_INVALID'));
                    return;
                }
                try {
                    host.addChild(root);
                    placeShellInMiddle(host, root);
                    resolve(root);
                } catch (mountError) {
                    if (root.isValid) root.destroy();
                    reject(mountError);
                }
            });
        };
        const bundle = assetManager.getBundle(COMMON_ROOM_BUNDLE);
        if (bundle) mount(bundle);
        else assetManager.loadBundle(COMMON_ROOM_BUNDLE, (error, loaded) => {
            if (error) reject(error);
            else mount(loaded);
        });
    });
}

/** Keep public room controls above the table background but below cards/effects. */
function placeShellInMiddle(host: Node, root: Node): void {
    if (!host.isValid || !root.isValid) return;
    const children = host.children.filter(child => child.isValid && child !== root);
    const gameplayLayer = children.find(child => child.name === 'PlayerLayer'
        || child.name === 'OperationLayer' || child.name === 'EffectLayer'
        || child.name === 'PopupLayer' || child.name === 'ResultLayer');
    const authoritativeRoom = children.find(child => /AuthoritativeRoom$/i.test(child.name));
    const tableLayer = children.find(child => child.name === 'TableLayer');
    const backgroundLayer = children.find(child => child.name === 'BackgroundLayer');
    const indexOf = (node: Node | undefined): number => node ? children.indexOf(node) : -1;
    const gameplayIndex = indexOf(gameplayLayer);
    const tableIndex = indexOf(tableLayer);
    const backgroundIndex = indexOf(backgroundLayer);
    const authoritativeIndex = indexOf(authoritativeRoom);
    const target = gameplayIndex >= 0 ? gameplayIndex
        : authoritativeIndex >= 0 ? authoritativeIndex
        : tableIndex >= 0 ? tableIndex + 1 : backgroundIndex >= 0 ? backgroundIndex + 1 : children.length;
    // The root is intentionally never moved to the end of the Canvas. This
    // keeps CommonRoom buttons and CommonHead avatars in the middle UI band,
    // where gameplay cards/effects can render above them when required.
    root.setSiblingIndex(Math.max(0, Math.min(target, children.length)));
    const layer = host.layer;
    const apply = (node: Node): void => {
        node.layer = layer;
        for (const child of node.children) apply(child);
    };
    apply(root);
}

/**
 * Resolve a renderable, touch-enabled UI host at the point a room is entered.
 *
 * Some shipped scenes use a direct `Canvas` child, while others keep the real
 * UI root below a scene-management node.  Falling back to `Scene` itself is
 * invalid for a UI prefab: it can render behind gameplay and is outside the
 * UI event path.  The lobby node is authoritative when it still belongs to
 * the active scene; otherwise use the active scene's Canvas or first UI root.
 */
function resolveCommonRoomHost(parent: Node): Node | null {
    const scene = director.getScene();
    if (!scene?.isValid) return parent?.isValid ? parent : null;

    const canvas = findActiveNode(scene, node => node.name === 'Canvas'
        && Boolean(node.getComponent(UITransform)));
    if (canvas) return canvas;

    if (parent?.isValid && parent.scene === scene && parent.getComponent(UITransform)) return parent;

    return findActiveNode(scene, node => Boolean(node.getComponent(UITransform)));
}

function findActiveNode(root: Node, predicate: (node: Node) => boolean): Node | null {
    for (const child of root.children) {
        if (!child.isValid || !child.activeInHierarchy) continue;
        if (predicate(child)) return child;
        const nested = findActiveNode(child, predicate);
        if (nested) return nested;
    }
    return null;
}
