import { Layout } from 'cc';
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
     * The button group is anchored at its centre. Let Layout resize the group to
     * the currently active children so every operation state stays centred.
     */
    private centerVisibleButtons(): void {
        const container = this.view.find(PdkRoomNodePath.operationButtons);
        if (!container) return;
        const layout = container.getComponent(Layout);
        if (!layout) return;
        layout.enabled = true;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.affectedByScale = true;
        layout.spacingX = OperationPresenter.BUTTON_GAP;
        layout.paddingLeft = 0;
        layout.paddingRight = 0;
        layout.updateLayout();
    }
}
