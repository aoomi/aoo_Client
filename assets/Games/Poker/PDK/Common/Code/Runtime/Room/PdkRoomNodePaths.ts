export const COMMON_ROOM_FORM = 'room/CommonRoom';
export const DISSOLVE_ROOM_FORM = 'room/DissolveRoom';
export const PDK_ROOM_FORM = 'pdk/PDK_CommonRoom';
export const POKER_CARD_SELECTION_FORM = 'poker/CardSelection';

export const CommonRoomNodePath = Object.freeze({
    turnActions: 'TurnActions',
    clubCent: 'RoomInfo/Lb_ClubCent',
    roomIdLabel: 'RoomInfo/Lb_RoomId',
    roundLabel: 'RoomInfo/Lb_Round',
    readyButton: 'WaitingActions/Btn_Ready',
    startButton: 'WaitingActions/Btn_Start',
    chatButton: 'Btn/Btn_Chat',
    voiceButton: 'Btn/Btn_Voice',
    backButton: 'Btn/Btn_Back',
    smallSettlementButton: 'Btn/Btn_SmallSettlement',
    moreButton: 'Btn/Btn_More',
    moreItems: 'CardCounter/MoreMenu/MoreItems',
    roomRuleButton: 'CardCounter/MoreMenu/MoreItems/Btn_RoomRule',
    settingsButton: 'CardCounter/MoreMenu/MoreItems/Btn_Settings',
    dissolveButton: 'CardCounter/MoreMenu/MoreItems/Btn_DissolveRoom',
} as const);

export const PdkRoomNodePath = Object.freeze({
    operationButtons: 'Btn',
    passButton: 'Btn/Btn_Pass',
    hintButton: 'Btn/Btn_Hint',
    playButton: 'Btn/Btn_Play',
    keepRoomOpenButton: 'Btn/Btn_KeepRoomOpen',
    closeRoomButton: 'Btn/Btn_CloseRoom',
    noGrabButton: 'Btn/Btn_NoGrab',
    grabDealerButton: 'Btn/Btn_GrabDealer',
} as const);
