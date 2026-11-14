export const PDK_ROOM_FORM = 'pdk/PDK_CommonRoom';
export const POKER_CARD_SELECTION_FORM = 'poker/CardSelection';
export const DEAL_QUALITY_FORM = 'room/AddSubtract';

export const CommonRoomNodePath = Object.freeze({
    turnActions: 'TurnActions',
    clubCent: 'RoomInfo/Lb_ClubCent',
    roomIdLabel: 'RoomInfo/Lb_RoomId',
    roundLabel: 'RoomInfo/Lb_Round',
    dissolveButton: 'CardCounter/MoreMenu/MoreItems/Btn_DissolveRoom',
} as const);

export const PdkRoomNodePath = Object.freeze({
    playCountTemplate: 'RoomCommon/PlayCount',
    operationButtons: 'Btn',
    passButton: 'Btn/Btn_Pass',
    hintButton: 'Btn/Btn_Hint',
    playButton: 'Btn/Btn_Play',
    keepRoomOpenButton: 'Btn/Btn_KeepRoomOpen',
    closeRoomButton: 'Btn/Btn_CloseRoom',
    noGrabButton: 'Btn/Btn_NoGrab',
    grabDealerButton: 'Btn/Btn_GrabDealer',
} as const);
