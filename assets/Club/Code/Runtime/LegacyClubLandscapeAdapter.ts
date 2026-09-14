import { Node, Sprite, UITransform, Vec3, Widget } from 'cc';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const HALF_WIDTH = DESIGN_WIDTH / 2;
const HALF_HEIGHT = DESIGN_HEIGHT / 2;

interface ScreenRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function adaptClubMainLandscape(root: Node): void {
    normalizeClubRoot(root);
    updateWidgets(root);
}

export function adaptClubModalLandscape(root: Node): void {
    normalizeClubRoot(root);
    coverLargeBackgrounds(root);
    updateWidgets(root);
    clampScreenButton(root, 'btn_close', 20);
    clampScreenButton(root, 'bg/btn_close', 20);
    clampScreenButton(root, 'bg/bg_create/btn_close', 20);
}

export function adaptClubMemberLandscape(root: Node): void {
    normalizeClubRoot(root);
    updateWidgets(root);
    clampScreenButton(root, 'btn_close', 20);
    clampScreenButton(root, 'bottom/btn_close', 20);
}

function normalizeClubRoot(root: Node): void {
    const transform = root.getComponent(UITransform);
    if (transform) transform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    disableWidget(root);
    root.setPosition(0, 0, 0);
    root.setScale(1, 1, 1);
}

function coverLargeBackgrounds(root: Node): void {
    const visit = (node: Node, depth: number): void => {
        if (depth > 2) return;
        for (const child of node.children) {
            const transform = child.getComponent(UITransform);
            const sprite = child.getComponent(Sprite);
            const isLarge = Boolean(transform)
                && transform!.width >= DESIGN_WIDTH * 0.9
                && transform!.height >= DESIGN_HEIGHT * 0.85;
            if (sprite && isLarge && looksLikeBackground(child.name)) {
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                transform!.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
                child.setPosition(0, 0, child.position.z);
                disableWidget(child);
            }
            visit(child, depth + 1);
        }
    };
    visit(root, 0);
}

function clampScreenButton(root: Node, path: string, padding: number): void {
    const node = findNode(root, path);
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    const worldRect = transform.getBoundingBoxToWorld();
    const rootTransform = root.getComponent(UITransform);
    if (!rootTransform || !worldRect) return;
    const bottomLeft = rootTransform.convertToNodeSpaceAR(new Vec3(worldRect.x, worldRect.y, 0));
    const topRight = rootTransform.convertToNodeSpaceAR(
        new Vec3(worldRect.x + worldRect.width, worldRect.y + worldRect.height, 0),
    );
    const rect = {
        x: bottomLeft.x + HALF_WIDTH,
        y: bottomLeft.y + HALF_HEIGHT,
        width: topRight.x - bottomLeft.x,
        height: topRight.y - bottomLeft.y,
    };
    const width = Math.min(rect.width, DESIGN_WIDTH - padding * 2);
    const height = Math.min(rect.height, DESIGN_HEIGHT - padding * 2);
    setScreenRect(root, node, {
        x: clamp(rect.x, padding, DESIGN_WIDTH - padding - width),
        y: clamp(rect.y, padding, DESIGN_HEIGHT - padding - height),
        width,
        height,
    });
}

function setScreenRect(root: Node, pathOrNode: string | Node, rect: ScreenRect): void {
    const node = typeof pathOrNode === 'string' ? findNode(root, pathOrNode) : pathOrNode;
    const transform = node?.getComponent(UITransform);
    if (!node || !transform) return;
    disableWidget(node);
    transform.setContentSize(rect.width, rect.height);
    const rootTransform = root.getComponent(UITransform);
    const parentTransform = node.parent?.getComponent(UITransform);
    const rootCenter = new Vec3(
        rect.x + rect.width / 2 - HALF_WIDTH,
        rect.y + rect.height / 2 - HALF_HEIGHT,
        node.position.z,
    );
    if (rootTransform && parentTransform) {
        const worldCenter = rootTransform.convertToWorldSpaceAR(rootCenter);
        const localCenter = parentTransform.convertToNodeSpaceAR(worldCenter);
        node.setPosition(localCenter.x, localCenter.y, node.position.z);
        return;
    }
    node.setPosition(rootCenter.x, rootCenter.y, node.position.z);
}

function updateWidgets(root: Node): void {
    const visit = (node: Node): void => {
        const widget = node.getComponent(Widget);
        if (widget?.enabled) widget.updateAlignment();
        for (const child of node.children) visit(child);
    };
    visit(root);
}

function disableWidget(node: Node | null): void {
    const widget = node?.getComponent(Widget);
    if (widget) widget.enabled = false;
}

function findNode(root: Node, path: string): Node | null {
    let current: Node | null = root;
    for (const part of path.split('/')) current = current?.getChildByName(part) ?? null;
    return current;
}

function looksLikeBackground(name: string): boolean {
    return /^(bg|bj|background|beijing|di|mask|heidi|sprite|bg_bottom_popup)$/i.test(name);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
