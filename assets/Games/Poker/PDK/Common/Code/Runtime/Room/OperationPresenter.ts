import { Layout, UITransform, view } from 'cc';
import { RoomViewBindings } from './RoomViewBindings';
import { PdkRoomNodePath } from './PdkRoomNodePaths';

export interface PdkOperationState {
    readonly isLocalTurn: boolean;
    readonly canPass: boolean;
    readonly canTip: boolean;
    readonly canPlay: boolean;
    readonly isCompeteDealer: boolean;
}

export class OperationPresenter {
    private static readonly BUTTON_GAP = 10;

    public constructor(private readonly view: RoomViewBindings) {}
    public render(state: PdkOperationState): void {
        this.view.visible(PdkRoomNodePath.operationButtons, state.isLocalTurn);
        this.view.visible(PdkRoomNodePath.passButton, state.isLocalTurn && !state.isCompeteDealer && state.canPass);
        this.view.visible(PdkRoomNodePath.hintButton, state.isLocalTurn && !state.isCompeteDealer && state.canTip);
        this.view.visible(PdkRoomNodePath.playButton, state.isLocalTurn && !state.isCompeteDealer && state.canPlay);
        if (state.isLocalTurn) this.centerVisibleButtons();
    }
    public hide(): void {
        this.render({ isLocalTurn: false, canPass: false, canTip: false, canPlay: false, isCompeteDealer: false });
    }
    public syncLayout(): void {
        if (this.view.find(PdkRoomNodePath.operationButtons)?.activeInHierarchy) this.centerVisibleButtons();
    }

    /**
     * The prefab keeps every possible operation in one container. A Creator
     * Layout resized that container while all children were inactive, leaving
     * it at width -10 and preserving stale child coordinates. Arrange the live
     * subset explicitly so every operation combination is centred as a group.
     */
    private centerVisibleButtons(): void {
        const container = this.view.find(PdkRoomNodePath.operationButtons);
        if (!container) return;
        const layout = container.getComponent(Layout);
        if (layout) layout.enabled = false;
        const visible = container.children.filter(child => child.active);
        if (!visible.length) return;
        const widths = visible.map(child => {
            const transform = child.getComponent(UITransform);
            return Math.max(0, transform?.width ?? 0) * Math.abs(child.scale.x);
        });
        const totalWidth = widths.reduce((sum, width) => sum + width, 0)
            + OperationPresenter.BUTTON_GAP * Math.max(0, visible.length - 1);
        const containerTransform = container.getComponent(UITransform);
        if (containerTransform) containerTransform.setContentSize(totalWidth, containerTransform.height);
        let cursor = -totalWidth / 2;
        visible.forEach((child, index) => {
            const width = widths[index];
            child.setPosition(cursor + width / 2, 0, child.position.z);
            cursor += width + OperationPresenter.BUTTON_GAP;
        });

        // The prefab root remains centred in the 1280 design coordinate system;
        // on a wider viewport that is not the centre of the visible area. Use
        // Cocos' visible world rectangle so desktop and mobile landscape share
        // the same true screen centre.
        const visibleOrigin = view.getVisibleOrigin();
        const visibleSize = view.getVisibleSize();
        const world = container.worldPosition;
        container.setWorldPosition(visibleOrigin.x + visibleSize.width / 2, world.y, world.z);
    }
}
