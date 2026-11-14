import { PdkRoomViewBindings } from './PdkRoomViewBindings';
import { PdkRoomNodePath } from './PdkRoomNodePaths';

export interface PdkOperationState {
    readonly isLocalTurn: boolean;
    readonly canPass: boolean;
    readonly canTip: boolean;
    readonly canPlay: boolean;
    readonly isCompeteDealer: boolean;
}

export class PdkOperationPresenter {
    public constructor(private readonly view: PdkRoomViewBindings) {}
    public render(state: PdkOperationState): void {
        this.view.visible(PdkRoomNodePath.operationButtons, state.isLocalTurn);
        this.view.visible(PdkRoomNodePath.passButton, state.isLocalTurn && !state.isCompeteDealer && state.canPass);
        this.view.visible(PdkRoomNodePath.hintButton, state.isLocalTurn && !state.isCompeteDealer && state.canTip);
        this.view.visible(PdkRoomNodePath.playButton, state.isLocalTurn && !state.isCompeteDealer && state.canPlay);
    }
    public hide(): void {
        this.render({ isLocalTurn: false, canPass: false, canTip: false, canPlay: false, isCompeteDealer: false });
    }
}
