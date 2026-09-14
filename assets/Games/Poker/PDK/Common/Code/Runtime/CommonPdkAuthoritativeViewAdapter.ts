export interface CommonPdkAuthoritativeRoomView extends Record<string, unknown> {
    roomId: number;
    ownerId: number;
    family: string;
    playerCount: number;
    roundNo: number;
    roundLimit: number;
    playVersion: string;
    stateVersion: number;
    phase: string;
    currentSeat: number;
    currentPlayerId?: number;
    seats: Record<string, unknown>;
    currentTrick?: Record<string, unknown>;
    operationDeadline?: Record<string, unknown>;
    nextRoundDeadline?: Record<string, unknown>;
    serverEpochMillis?: number;
    dissolved?: boolean;
    dissolveReason?: string;
    dissolveVote?: Record<string, unknown>;
}

function integer(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value);
}

function positiveInteger(value: unknown): value is number {
    return integer(value) && value > 0;
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function unwrap(packet: unknown): Record<string, unknown> {
    const root = record(packet);
    return record(root.payload ?? root.state ?? root);
}

function legacyState(phase: string): 'Waiting' | 'Playing' | 'End' {
    if (phase === 'PLAYING' || phase === 'COMPETE_DEALER') return 'Playing';
    if (phase === 'FINISHED' || phase === 'DIRECT_WIN' || phase === 'ROUND_SETTLEMENT'
        || phase === 'INTER_ROUND' || phase === 'SETTLED') return 'End';
    return 'Waiting';
}

function legacyPatternOptions(ruleOptions: Record<string, unknown>): number[] {
    const triple = String(ruleOptions.tripleAttachmentMode ?? '');
    const four = String(ruleOptions.fourAttachmentMode ?? '');
    const tripleTiming = String(ruleOptions.tripleWithoutAttachmentTiming ?? '');
    const specialBombRanks = ruleOptions.specialTripleBombRanks;
    if (!triple || !four || !tripleTiming || !Array.isArray(specialBombRanks)) {
        throw new Error('CommonPdk 权威牌型配置不完整');
    }
    const patterns: number[] = [];
    if (ruleOptions.allowTerminalAttachmentShortage === true) patterns.push(0);
    if (triple === 'SINGLES' || triple === 'EITHER') patterns.push(1, 3);
    if (triple === 'PAIRS' || triple === 'EITHER') patterns.push(2);
    patterns.push(4);
    if (ruleOptions.allowFourBombWithOne === true) patterns.push(5);
    if (specialBombRanks.length > 0) patterns.push(6);
    if (four === 'SINGLES' || four === 'EITHER') patterns.push(7);
    if (ruleOptions.allowFourWithThree === true) patterns.push(8);
    if (tripleTiming === 'ANYTIME') patterns.push(9);
    return patterns;
}

function projectedSeatCards(seat: Record<string, unknown>, phase: string, pos: number): number[] {
    const cards = seat.cards;
    if (phase === 'WAITING' && cards === undefined) return [];
    if (!Array.isArray(cards)) throw new Error(`CommonPdk 权威座位${pos} cards 数组缺失`);
    return cards.map((value, index) => {
        const card = Number(value);
        if (!Number.isSafeInteger(card)) throw new Error(`CommonPdk 权威座位${pos} cards[${index}] 无效`);
        return card;
    });
}

function cardValues(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => Number(item)).filter((item) => Number.isSafeInteger(item));
}

function legacyOperationType(type: unknown): number {
    if (integer(type)) return type;
    switch (String(type ?? '').trim().toUpperCase()) {
        case 'SINGLE': return 2;
        case 'PAIR': return 3;
        case 'STRAIGHT': return 4;
        case 'TRIPLE': return 5;
        case 'TRIPLE_WITH_ONE': return 6;
        case 'TRIPLE_WITH_TWO': return 7;
        case 'FOUR_BOMB_WITH_ONE':
        case 'FOUR_WITH_TWO_PAIRS': return 8;
        case 'FOUR_WITH_TWO': return 9;
        case 'FOUR_WITH_THREE': return 10;
        case 'BOMB':
        case 'SPECIAL_TRIPLE_BOMB':
        case 'SPECIAL_TRIPLE_BOMB_WITH_ONE':
        case 'CONSECUTIVE_BOMB': return 11;
        case 'CONSECUTIVE_PAIRS': return 14;
        case 'TRIPLE_WITH_PAIR': return 15;
        case 'AIRPLANE_WITH_SINGLES': return 16;
        case 'AIRPLANE_WITH_PAIRS': return 17;
        case 'AIRPLANE_WITH_TWO': return 18;
        case 'AIRPLANE': return 19;
        default: return 0;
    }
}

function remainingOperationSeconds(deadline: Record<string, unknown>, serverEpochMillis: unknown): number {
    const deadlineEpochMillis = Number(deadline.deadlineEpochMillis ?? 0);
    const serverNow = Number(serverEpochMillis ?? Date.now());
    if (!Number.isFinite(deadlineEpochMillis) || !Number.isFinite(serverNow) || deadlineEpochMillis <= serverNow) return 0;
    return Math.ceil((deadlineEpochMillis - serverNow) / 1000);
}

/** Projects the authoritative V2 room view into the migrated 2.4.8 model shape. */
export function projectCommonPdkAuthoritativeView(packet: unknown, localPlayerId: number): {
    view: CommonPdkAuthoritativeRoomView;
    snapshot: Record<string, unknown>;
} {
    const source = unwrap(packet);
    const roomId = source.roomId;
    const ownerId = source.ownerId;
    const playerCount = source.playerCount ?? source.seatLimit;
    const stateVersion = source.stateVersion;
    if (!positiveInteger(roomId) || !positiveInteger(ownerId)) throw new Error('CommonPdk 权威房间标识无效');
    if (!integer(playerCount) || playerCount < 2 || playerCount > 4) throw new Error('CommonPdk 权威人数无效');
    if (!integer(stateVersion) || stateVersion < 0) throw new Error('CommonPdk 权威状态版本无效');
    const family = String(source.family ?? '').trim();
    const playVersion = String(source.playVersion ?? '').trim();
    const phase = String(source.phase ?? '').trim().toUpperCase();
    if (!family || !playVersion || !['WAITING', 'PLAYING', 'FINISHED', 'DIRECT_WIN', 'COMPETE_DEALER', 'DISSOLVED'].includes(phase)) {
        throw new Error('CommonPdk 权威玩法快照不完整');
    }
    // Authority uses the terminal phase as the durable room-closure marker.
    // Do not require a second, optional `dissolved` flag or the client can remain
    // in GameRoom2D after the room has already been removed by the server.
    const dissolved = phase === 'DISSOLVED' || source.dissolved === true;

    const roundNo = integer(source.roundNo) && source.roundNo >= 0 ? source.roundNo : 0;
    const roundLimit = positiveInteger(source.roundLimit) ? source.roundLimit : 1;
    const currentSeat = integer(source.currentSeat) ? source.currentSeat : -1;
    const seats = record(source.seats);
    const ruleOptions = record(source.ruleOptions);
    if (typeof ruleOptions.mustBeatWhenPossible !== 'boolean') {
        throw new Error('CommonPdk 权威不出规则缺失');
    }
    const legacyPatterns = legacyPatternOptions(ruleOptions);
    const posList: Array<Record<string, unknown>> = [];
    const pointList: number[] = [];
    const totalPointList: number[] = [];
    const surplusCardList: number[][] = [];
    const playedCardList: number[][] = [];
    const recordPosInfosList: Array<Record<string, unknown>> = [];
    for (let pos = 0; pos < playerCount; pos += 1) {
        const seat = record(seats[String(pos)]);
        const playerId = positiveInteger(seat.playerId) ? seat.playerId : 0;
        const cards = projectedSeatCards(seat, phase, pos);
        posList.push({
            pos,
            pid: playerId,
            playerCount,
            seatLimit: playerCount,
            isReady: Boolean(seat.ready),
            // 旧房间控制器以 roomReady 决定“准备/取消准备”的互斥显示；Authority 的
            // seat.ready 是唯一权威来源，必须在适配边界显式投影，不能让 UI 自行推断。
            roomReady: Boolean(seat.ready),
            isContinue: Boolean(seat.continued),
            name: String(seat.name ?? (playerId > 0 ? `玩家${playerId}` : '')),
            headImageUrl: String(seat.headImageUrl ?? ''),
            isLostConnect: Boolean(seat.offline),
            isShowLeave: Boolean(seat.offline),
            trusteeship: Boolean(seat.hosting),
            cards,
            cardCount: integer(seat.cardCount) ? seat.cardCount : cards.length,
            totalScore: typeof seat.totalScore === 'number' ? seat.totalScore : 0,
            isSelf: playerId === localPlayerId,
        });
        pointList.push(typeof seat.roundScore === 'number' ? seat.roundScore : 0);
        totalPointList.push(typeof seat.totalScore === 'number' ? seat.totalScore : 0);
        surplusCardList.push(cardValues(seat.remainingCards ?? cards));
        playedCardList.push(cardValues(seat.playedCards));
        recordPosInfosList.push({
            pos,
            playerId,
            pid: playerId,
            point: typeof seat.totalScore === 'number' ? seat.totalScore : 0,
            winCount: integer(seat.winCount) ? seat.winCount : 0,
            loseCount: integer(seat.loseCount) ? seat.loseCount : 0,
        });
    }
    const state = legacyState(phase);
    const matchFinished = Boolean(source.matchFinished);
    const canContinue = Boolean(source.canContinue);
    const lastActions = Array.isArray(source.lastActions) ? source.lastActions : [];
    const lastAction = record(lastActions.at(-1));
    const currentTrick = record(source.currentTrick);
    // Some authoritative pushes omit currentTrick while retaining the current
    // trick's last play in lastActions. Project that play as the effective trick
    // so response hints and the retained Liangshan table never become an empty lead.
    const effectiveTrick = cardValues(currentTrick.cards).length > 0 ? currentTrick : lastAction;
    const lastOpPos = integer(effectiveTrick.seat) ? effectiveTrick.seat : -1;
    const publicCards = cardValues(effectiveTrick.cards);
    const opType = legacyOperationType(effectiveTrick.opCardType ?? effectiveTrick.opType
        ?? effectiveTrick.cardType ?? effectiveTrick.type);
    const isFirstOp = publicCards.length === 0 || opType <= 0 || lastOpPos < 0;
    const operationDeadline = record(source.operationDeadline);
    const nextRoundDeadline = record(source.nextRoundDeadline);
    // Preserve Authority's per-round marker during reconnect. `playedCards` can
    // contain restored history from earlier rounds, so it cannot decide whether
    // the current round has already led. The controller applies the current-trick
    // gate before using this value.
    const activeRequiredFirstCard = integer(source.activeRequiredFirstCard) && source.activeRequiredFirstCard > 0
        ? source.activeRequiredFirstCard : 0;
    const runWaitSec = remainingOperationSeconds(operationDeadline, source.serverEpochMillis);
    const authorityOperationId = String(source.operationId || operationDeadline.operationId || lastAction.operationId || '');
    const set = {
        state,
        authorityPhase: phase,
        cardsDealt: typeof source.cardsDealt === 'boolean'
            ? source.cardsDealt : phase !== 'WAITING' && phase !== 'COMPETE_DEALER',
        setID: roundNo,
        roundNo,
        opPos: currentSeat,
        isFirstOp,
        mustBeatWhenPossible: ruleOptions.mustBeatWhenPossible,
        opType,
        currentPlayerId: positiveInteger(source.currentPlayerId) ? source.currentPlayerId : 0,
        bankerSeat: integer(source.bankerSeat) ? source.bankerSeat : -1,
        competeDealerSeat: integer(source.competeDealerSeat) ? source.competeDealerSeat : -1,
        competeDealerRespondedSeats: Array.isArray(source.competeDealerRespondedSeats)
            ? source.competeDealerRespondedSeats.map(Number).filter(Number.isSafeInteger) : [],
        operationDeadline,
        nextRoundDeadline,
        // This is the card chosen by Authority for the current round, not the
        // static configured card. Lead hints must consume this exact value.
        activeRequiredFirstCard,
        serverEpochMillis: source.serverEpochMillis,
        lastOpPos,
        cardList: publicCards,
        runWaitSec,
        posInfo: posList,
        playedCardList,
        playHistory: Array.isArray(source.playHistory) ? source.playHistory : [],
        winnerSeat: integer(source.winnerSeat) ? source.winnerSeat : -1,
        finished: Boolean(source.finished),
        matchFinished,
        canContinue,
        lastActions,
        trickId: integer(source.trickId) ? source.trickId : 0,
        trickReset: Boolean(source.trickReset),
        setEnd: {
            pointList,
            totalPointList,
            surplusCardList,
            playedCardList,
            playHistory: Array.isArray(source.playHistory) ? source.playHistory : [],
            replayCode: typeof source.replayCode === 'string' ? source.replayCode : '',
            replaySetId: integer(source.replaySetId) ? source.replaySetId : Math.max(0, roundNo - 1),
            recordPosInfosList,
            winnerSeat: integer(source.winnerSeat) ? source.winnerSeat : -1,
            startTime: Date.now(),
            matchFinished,
            canContinue,
            roundNo,
            roundLimit,
            roomId,
            stateVersion,
            operationId: authorityOperationId,
            nextRoundDeadline,
            serverEpochMillis: source.serverEpochMillis,
            settlementPresentation: source.settlementPresentation,
            activeRequiredFirstCard,
            authorityPhase: phase,
            cardsDealt: typeof source.cardsDealt === 'boolean'
                ? source.cardsDealt : phase !== 'WAITING' && phase !== 'COMPETE_DEALER',
        },
    };
    const view = { ...source, dissolved } as CommonPdkAuthoritativeRoomView;
    return {
        view,
        snapshot: {
            roomID: roomId,
            key: roomId,
            ownerID: ownerId,
            state,
            setID: roundNo,
            prizeType: 'RoomCard',
            cfg: {
                clubId: 0,
                unionId: 0,
                playerCount,
                seatLimit: playerCount,
                roundCount: roundLimit,
                setCount: roundLimit,
                playVersion,
                playFamily: family,
                ruleOptions,
                paixing: legacyPatterns,
            },
            posList,
            set,
            roomId,
            ownerId,
            playerCount,
            roundNo,
            roundLimit,
            playVersion,
            stateVersion,
            phase,
            operationId: authorityOperationId,
            capabilities: record(source.capabilities),
            dissolved,
            dissolveReason: String(source.dissolveReason ?? ''),
            dissolveVote: record(source.dissolveVote),
        },
    };
}
