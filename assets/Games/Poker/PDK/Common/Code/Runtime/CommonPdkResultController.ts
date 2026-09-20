import { Button, instantiate, Label, Layout, Node, Prefab, Sprite, SpriteAtlas, UITransform, Vec3 } from 'cc';
import { StaticList } from '../../../../../../Common/Code/UI/StaticList';
import { AssetLoader } from '../../../../../../Common/Code/UI/Infrastructure';
import { CommonHeadController } from '../../../../../../Common/Code/UI/CommonHeadController';
import type { LegacyForm, LegacyFormManager } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import { CardPresenter } from './Room/CardPresenter';
import type { CommonPdkRuntime } from './CommonPdkRuntime';
import { legacyPlatformBridge } from '../../../../../../Common/Code/Runtime/platform/LegacyPlatformBridge';
import { formatPdkRuleSummary } from '../Rules/PdkRuleSummaryFormatter';
import { resolvePdkRegionalProfile } from '../Regional/PdkRegionalProfileRegistry';

const PDK_SMALL_SETTLEMENT_FORM = 'settlement/poker/SmallSettlement';
const PDK_BIG_SETTLEMENT_FORM = 'settlement/poker/BigSettlement';
const PLAYED_HAND_GAP = 2;

interface ResultPlayer {
    readonly dataSeat: number;
    readonly player: Record<string, unknown>;
}

/** Renders the authoritative PDK round payload into SmallSettlement. */
export class CommonPdkResultController {
    private form: LegacyForm | null = null;
    private setEnd: Record<string, unknown> = {};
    private viewSetEnd: Record<string, unknown> = {};
    private settlementRoomId = 0;
    private displayedRoundNo = 0;
    private readonly settlementHistory = new Map<number, Record<string, unknown>>();
    private settlementHistoryRequestRoomId = 0;
    private settlementHistoryRequest: Promise<void> | null = null;
    private openedFromRoomButton = false;
    private readonly cards = new CardPresenter();
    private readonly assets = new AssetLoader();
    private readonly headRevisions = new WeakMap<Node, number>();
    private readonly remainingCardRevisions = new WeakMap<Node, number>();
    private readonly playedCardRevisions = new WeakMap<Node, number>();
    private readonly specialHandRevisions = new WeakMap<Node, number>();
    private continueInFlight = false;
    private continueRoundKey = '';
    private replayCodeRequest = 0;
    private autoContinueTimer: ReturnType<typeof setInterval> | null = null;
    private autoContinueSeconds = 0;
    private autoContinueDeadlineLocalMillis = 0;
    private finalSettlementOpening = false;
    private readonly continueClick = () => this.continueGame();
    private readonly finalSettlementClick = () => { void this.showBigSettlement(); };
    private readonly returnLobbyClick = () => this.requestLeave('result-exit');
    private readonly shareClick = () => { void this.shareReplay(); };
    private readonly previousPageClick = () => this.changeSettlementPage(-1);
    private readonly nextPageClick = () => this.changeSettlementPage(1);

    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly requestLeave: (reason: string) => void,
        private readonly openShare: () => void,
        private readonly smallSettlementForm = PDK_SMALL_SETTLEMENT_FORM,
        private readonly bigSettlementForm = PDK_BIG_SETTLEMENT_FORM,
        private readonly showMessage: (message: string) => void = () => undefined,
        private readonly loadReplayCode: (roomId: number, setId: number) => Promise<string> = async () => '',
        private readonly loadSettlementHistory: (roomId: number) => Promise<unknown> = async () => ({}),
        private readonly clearCompletedRoundVisuals: () => void = () => undefined,
    ) {}

    public onCreate(form: LegacyForm): void {
        if (this.form && this.form !== form) this.unbindButtons(this.form);
        this.form = form;
        this.bindButtons(form);
    }

    public onShow(setEnd?: unknown): void {
        if (this.form) this.bindButtons(this.form);
        this.setEnd = (setEnd ?? this.runtime.getRoomSet().GetRoomSetProperty('setEnd') ?? {}) as Record<string, unknown>;
        if (this.isCompletedSettlement(this.setEnd)) this.recordSettlement(this.setEnd);
        this.viewSetEnd = this.setEnd;
        this.displayedRoundNo = this.numberValue(this.setEnd.roundNo);
        this.openedFromRoomButton = this.setEnd.openedFromRoomButton === true;
        if (this.form?.node) {
            (this.form.node as Node & { __pdkRoomButtonReview?: boolean }).__pdkRoomButtonReview = this.openedFromRoomButton;
        }
        this.render();
        void this.hydrateSettlementHistory();
        this.startAutoContinue();
        if (!this.displayedReplayCode()) void this.refreshReplayCode();
    }

    public onClose(): void { this.stopAutoContinue(); }

    public prepareRoomButtonReview(): void {
        this.openedFromRoomButton = true;
        if (this.form?.node) {
            (this.form.node as Node & { __pdkRoomButtonReview?: boolean }).__pdkRoomButtonReview = true;
        }
        this.stopAutoContinue();
        this.text('Bottom/Btn/Btn_Continue/Label', '继续');
        const button = this.node('Bottom/Btn/Btn_Continue')?.getComponent(Button);
        if (button) button.interactable = true;
    }

    private bindButtons(form: LegacyForm): void {
        this.bindButton(form, 'Bottom/Btn/Btn_Continue', this.continueClick);
        this.bindButton(form, 'Bottom/Btn/Btn_Final', this.finalSettlementClick, true);
        this.bindButton(form, 'Bottom/Btn/Btn_Return', this.returnLobbyClick);
        this.bindButton(form, 'Bottom/Btn_Share', this.shareClick);
        this.bindButton(form, 'Bottom/Page/Btn_Previous', this.previousPageClick);
        this.bindButton(form, 'Bottom/Page/Btn_Next', this.nextPageClick);
    }

    private bindButton(form: LegacyForm, path: string, handler: () => void, pointerEndFallback = false): void {
        const node = form.find(path);
        node?.off(Button.EventType.CLICK, handler, this);
        node?.on(Button.EventType.CLICK, handler, this);
        if (!pointerEndFallback) return;
        node?.off(Node.EventType.TOUCH_END, handler, this);
        node?.off(Node.EventType.MOUSE_UP, handler, this);
        node?.on(Node.EventType.TOUCH_END, handler, this);
        node?.on(Node.EventType.MOUSE_UP, handler, this);
    }

    public destroy(): void {
        this.stopAutoContinue();
        if (this.form) this.unbindButtons(this.form);
        this.form = null;
    }

    private unbindButtons(form: LegacyForm): void {
        const bindings: Array<[string, () => void]> = [
            ['Bottom/Btn/Btn_Continue', this.continueClick],
            ['Bottom/Btn/Btn_Final', this.finalSettlementClick],
            ['Bottom/Btn/Btn_Return', this.returnLobbyClick],
            ['Bottom/Btn_Share', this.shareClick],
            ['Bottom/Page/Btn_Previous', this.previousPageClick],
            ['Bottom/Page/Btn_Next', this.nextPageClick],
        ];
        for (const [path, handler] of bindings) {
            const node = form.find(path);
            node?.off(Button.EventType.CLICK, handler, this);
            node?.off(Node.EventType.TOUCH_END, handler, this);
            node?.off(Node.EventType.MOUSE_UP, handler, this);
        }
    }

    private render(): void {
        const room = this.runtime.getRoom();
        const playersByPos = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const historicalPlayers = this.viewSetEnd.posInfo;
        const seatKeys = new Set([
            ...Object.keys(playersByPos),
            ...(Array.isArray(historicalPlayers)
                ? historicalPlayers.map((_, index) => String(index))
                : historicalPlayers && typeof historicalPlayers === 'object'
                    ? Object.keys(historicalPlayers) : []),
        ]);
        const players: ResultPlayer[] = [...seatKeys]
            .map((key) => {
                const dataSeat = Number(key);
                const live = this.objectValue(playersByPos[key]);
                const historical = this.objectValue(this.indexed(historicalPlayers, dataSeat));
                return { dataSeat, player: { ...historical, ...live } };
            })
            .filter(({ dataSeat }) => Number.isSafeInteger(dataSeat) && dataSeat >= 0)
            .filter(({ player }) => Number(player.pid ?? 0) > 0)
            .sort((left, right) => left.dataSeat - right.dataSeat);
        const roomEnded = this.matchFinished();
        this.text('Top/Lb_RoomId', `房号:${room.GetRoomProperty('key') ?? ''}`);
        this.text('Top/Lb_Time', this.date(this.viewSetEnd.startTime));
        const replayCode = this.displayedReplayCode();
        this.text('Top/Lb_PlaybackCode', replayCode ? `回放码:${replayCode}` : '回放码:获取失败');
        const display = this.viewSetEnd;
        const roundNo = this.numberValue(display.roundNo ?? room.GetRoomProperty('setID'));
        const roundLimit = this.numberValue(this.setEnd.roundLimit ?? room.GetRoomConfigByProperty('setCount'));
        this.text('Bottom/Page/Label', `${roundNo}/${roundLimit}`);
        this.updatePageButtons();
        const config = room.GetRoomConfig() ?? {};
        this.text('Bottom/Bg_Rule/Label', formatPdkRuleSummary(
            display.ruleSnapshot ?? config.ruleSnapshot ?? config.ruleOptions ?? config,
            display.ruleFields ?? config.ruleFields,
        ));
        this.active('Bottom/Btn_Share', Boolean(replayCode));
        this.active('Top/Btn_Replay', false);
        const canContinue = this.canContinue();
        this.active('Bottom/Btn/Btn_Continue', !roomEnded);
        const continueButton = this.node('Bottom/Btn/Btn_Continue')?.getComponent(Button);
        if (continueButton) continueButton.interactable = canContinue && !this.continueInFlight;
        this.active('Bottom/Btn/Btn_Final', roomEnded);
        // The prefab keeps both actions at the same visual slot. Showing ReturnLobby here
        // would cover Btn_FinalSettlement and turn a summary click into an immediate exit.
        // Leaving the completed room belongs to FinalSettlement after totals are visible.
        this.active('Bottom/Btn/Btn_Return', false);

        const list = this.node('PlayerList/Content')?.getComponent(StaticList);
        if (!list) throw new Error('SmallSettlement 缺少 StaticList');
        list.setData(players, (item, entry) => this.renderPlayer(item, entry));
    }

    /**
     * Keep every authoritative completed round for the lifetime of this room.
     * Collection is driven by the settlement event, not by whether the modal was
     * eventually mounted: floating presentation and duplicate-terminal filtering
     * must never create holes in 1..currentRound pagination.
     */
    public recordSettlement(payload: Record<string, unknown>): void {
        if (!this.isCompletedSettlement(payload)) return;
        const roomId = this.numberValue(payload.roomId ?? this.runtime.getRoomManager().GetEnterRoomID());
        const roundNo = this.numberValue(payload.roundNo);
        if (roomId <= 0 || roundNo <= 0) return;
        if (this.settlementRoomId !== roomId) {
            this.settlementHistory.clear();
            this.settlementRoomId = roomId;
        }
        this.settlementHistory.set(roundNo, payload);
        console.info('[PdkSettlementHistory]', {
            roomId,
            roundNo,
            availableRounds: [...this.settlementHistory.keys()].sort((left, right) => left - right),
        });
    }

    /** Restore completed rounds after refresh/reconnect from Hall's durable history. */
    private hydrateSettlementHistory(): Promise<void> {
        const roomId = this.numberValue(this.setEnd.roomId
            ?? this.runtime.getRoomManager().GetEnterRoomID());
        if (roomId <= 0) return Promise.resolve();
        if (this.settlementHistoryRequest && this.settlementHistoryRequestRoomId === roomId) {
            return this.settlementHistoryRequest;
        }
        this.settlementHistoryRequestRoomId = roomId;
        this.settlementHistoryRequest = this.loadSettlementHistory(roomId).then((raw) => {
            const envelope = this.objectValue(raw);
            const detail = this.objectValue(envelope.data ?? envelope);
            const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
            const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
            const seatByPlayer = new Map<number, number>();
            const historicalSeatCount = rounds.reduce((maximum, value) => {
                const round = this.objectValue(value);
                const settlement = this.objectValue(round.settlement);
                return Math.max(maximum, Array.isArray(settlement.entries) ? settlement.entries.length : 0);
            }, 0);
            const currentSeatCount = Math.max(-1,
                ...Object.keys(players).map(Number).filter(Number.isSafeInteger)) + 1;
            const seatCount = Math.max(currentSeatCount, historicalSeatCount);
            Object.entries(players).forEach(([seat, value]) => {
                const player = this.objectValue(value);
                const playerId = Number(player.pid ?? player.playerId ?? 0);
                if (playerId > 0) seatByPlayer.set(playerId, Number(seat));
            });
            const totals = Array.from({ length: seatCount }, () => 0);
            for (const rawRound of rounds) {
                const round = this.objectValue(rawRound);
                const roundNo = this.numberValue(round.roundNo);
                if (roundNo <= 0) continue;
                const pointList = Array.from({ length: seatCount }, () => 0);
                const surplusCardList: number[][] = Array.from({ length: seatCount }, () => []);
                const playedCardList: number[][] = Array.from({ length: seatCount }, () => []);
                const specialHandList: string[][] = Array.from({ length: seatCount }, () => []);
                const closeDoorList = Array.from({ length: seatCount }, () => false);
                const posInfo: Array<Record<string, unknown>> = Array.from({ length: seatCount }, () => ({}));
                const restoredPlayHistory: Array<Record<string, unknown>> = [];
                const settlement = this.objectValue(round.settlement);
                const entries = Array.isArray(settlement.entries) ? settlement.entries : [];
                for (const [entryIndex, rawEntry] of entries.entries()) {
                    const entry = this.objectValue(rawEntry);
                    const mappedSeat = seatByPlayer.get(Number(entry.playerId ?? 0));
                    const seat = mappedSeat ?? (entryIndex < seatCount ? entryIndex : undefined);
                    if (seat === undefined) continue;
                    const playerId = Number(entry.playerId ?? 0);
                    if (playerId > 0 && mappedSeat === undefined) seatByPlayer.set(playerId, seat);
                    const delta = Number(entry.scoreDelta ?? 0);
                    pointList[seat] = Number.isFinite(delta) ? delta : 0;
                    totals[seat] += pointList[seat];
                    surplusCardList[seat] = [...this.remainingCards(entry.remainingCards)];
                    playedCardList[seat] = [...this.remainingCards(entry.playedCards)];
                    specialHandList[seat] = Array.isArray(entry.initialPatterns)
                        ? entry.initialPatterns.map(String).filter(Boolean) : [];
                    const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
                    closeDoorList[seat] = tags.includes('SHUT_OUT');
                    posInfo[seat] = {
                        pos: seat,
                        pid: playerId,
                        playerId,
                        name: String(entry.name ?? ''),
                        headImageUrl: String(entry.headImageUrl ?? ''),
                    };
                    const hands = Array.isArray(entry.playedHands) ? entry.playedHands : [];
                    for (const rawHand of hands) {
                        const hand = this.objectValue(rawHand);
                        const cards = [...this.remainingCards(hand.cards)];
                        if (cards.length === 0) continue;
                        restoredPlayHistory.push({
                            ...hand,
                            seat,
                            cards,
                            playIndex: this.numberValue(hand.playIndex) || restoredPlayHistory.length + 1,
                        });
                    }
                }
                const settlementHistory = Array.isArray(settlement.playHistory)
                    && settlement.playHistory.length > 0
                    ? settlement.playHistory : restoredPlayHistory.sort((left, right) =>
                        this.numberValue(left.playIndex) - this.numberValue(right.playIndex));
                const restored = {
                    ...this.setEnd,
                    roomId,
                    roundNo,
                    pointList,
                    totalPointList: [...totals],
                    surplusCardList,
                    playedCardList,
                    specialHandList,
                    closeDoorList,
                    posInfo,
                    playHistory: settlementHistory,
                    replayCode: String(round.replayCode ?? ''),
                    startTime: round.settledAt,
                    ruleSnapshot: detail.ruleSnapshot,
                    ruleFields: detail.ruleFields,
                    matchFinished: roundNo >= this.numberValue(this.setEnd.roundLimit),
                    authorityPhase: 'FINISHED',
                };
                const existing = this.settlementHistory.get(roundNo);
                if (!existing || !this.hasSettlementCards(existing)) this.recordSettlement(restored);
            }
            console.info('[PdkSettlementHistory]', {
                roomId,
                stage: 'HYDRATED',
                responseKeys: Object.keys(envelope),
                roundCount: rounds.length,
                availableRounds: [...this.settlementHistory.keys()].sort((left, right) => left - right),
            });
            if (!this.isCompletedSettlement(this.viewSetEnd)) {
                const completedRounds = [...this.settlementHistory.keys()].sort((left, right) => left - right);
                const latestRound = completedRounds.at(-1);
                const latest = latestRound === undefined ? undefined : this.settlementHistory.get(latestRound);
                if (latest) {
                    this.setEnd = latest;
                    this.viewSetEnd = latest;
                    this.displayedRoundNo = latestRound;
                }
            }
            if (this.form) this.render();
        }).catch((error: unknown) => {
            console.warn('[PdkSettlementHistory] hydrate failed', {
                roomId,
                reason: error instanceof Error ? error.message : String(error),
            });
        }).finally(() => {
            this.settlementHistoryRequest = null;
        });
        return this.settlementHistoryRequest;
    }

    private changeSettlementPage(direction: -1 | 1): void {
        const rounds = [...this.settlementHistory.keys()].sort((left, right) => left - right);
        const currentIndex = rounds.indexOf(this.displayedRoundNo);
        const targetIndex = currentIndex + direction;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rounds.length) return;
        const targetRound = rounds[targetIndex];
        const target = this.settlementHistory.get(targetRound);
        if (!target) return;
        this.displayedRoundNo = targetRound;
        this.viewSetEnd = target;
        console.info('[PdkSettlementPage]', {
            roomId: this.settlementRoomId,
            roundNo: targetRound,
            latestRoundNo: this.numberValue(this.setEnd.roundNo),
        });
        this.render();
        if (!this.displayedReplayCode()) void this.refreshReplayCode();
    }

    private updatePageButtons(): void {
        const rounds = [...this.settlementHistory.keys()].sort((left, right) => left - right);
        const currentIndex = rounds.indexOf(this.displayedRoundNo);
        const previous = this.node('Bottom/Page/Btn_Previous')?.getComponent(Button);
        const next = this.node('Bottom/Page/Btn_Next')?.getComponent(Button);
        if (previous) previous.interactable = currentIndex > 0;
        if (next) next.interactable = currentIndex >= 0 && currentIndex < rounds.length - 1;
    }

    private async refreshReplayCode(): Promise<void> {
        const request = ++this.replayCodeRequest;
        const roomId = Number(this.runtime.getRoomManager().GetEnterRoomID());
        const target = this.viewSetEnd;
        const roundNo = Number(target.roundNo);
        const setId = Number.isSafeInteger(roundNo) && roundNo > 0
            ? roundNo - 1
            : Number(this.runtime.getRoom().GetRoomProperty('setID') ?? 0);
        try {
            const code = await this.loadReplayCode(roomId, setId);
            if (request !== this.replayCodeRequest || target !== this.viewSetEnd
                || !this.validReplayCode(code)) return;
            target.replayCode = code;
            this.render();
        } catch (error: unknown) {
            if (request === this.replayCodeRequest && target === this.viewSetEnd) {
                this.showMessage(error instanceof Error ? error.message : '回放码尚未生成');
            }
        }
    }

    private async shareReplay(): Promise<void> {
        if (!this.displayedReplayCode()) await this.refreshReplayCode();
        const replayCode = this.displayedReplayCode();
        if (!replayCode) { this.showMessage('回放码尚未生成，请稍后重试'); return; }
        const copied = await legacyPlatformBridge.writeClipboard(replayCode).catch(() => false);
        this.showMessage(copied ? `回放码 ${replayCode} 已复制` : `回放码：${replayCode}`);
        this.openShare();
    }

    private displayedReplayCode(): string {
        const value = String(this.viewSetEnd.replayCode ?? '');
        return this.validReplayCode(value) ? value : '';
    }

    private validReplayCode(value: string): boolean {
        return /^(?:\d{6}|\d{7}|\d{8}|\d{11})$/.test(value);
    }

    private renderPlayer(item: Node, entry: ResultPlayer): void {
        const { dataSeat, player } = entry;
        const point = Number(this.indexed(this.viewSetEnd.pointList, dataSeat) ?? 0);
        const total = Number(this.indexed(this.viewSetEnd.totalPointList, dataSeat) ?? point);
        const remainingSource = this.remainingCardSource(dataSeat);
        const remaining = this.remainingCards(remainingSource);
        const remainingCount = this.remainingCount(remainingSource, remaining);
        const playedHands = this.playedHands(dataSeat);
        const played = playedHands.flatMap((hand) => hand.cards);
        void this.renderPlayerHead(item, player).catch((error: unknown) => {
            console.error('PDK 小结算公共头像加载失败', error);
        });
        this.nodeActive(item, 'Score/Lb_Lose', point < 0);
        this.nodeActive(item, 'Score/Lb_Win', point >= 0);
        this.nodeText(item, 'Score/Lb_Lose', point < 0 ? String(point) : '');
        this.nodeText(item, 'Score/Lb_Win', point >= 0 ? `+${point}` : '');
        this.nodeActive(item, 'RemCards', remainingCount > 0);
        this.nodeText(item, 'RemCards/Count/Label', `余:${remainingCount}`);
        void this.renderRemainingCards(item, remaining).catch((error: unknown) => {
            console.error('PDK 小结算剩余手牌加载失败', error);
        });
        this.nodeActive(item, 'PlayedCards', played.length > 0);
        void this.renderPlayedCards(item, playedHands).catch((error: unknown) => {
            console.error('PDK 小结算已出牌加载失败', error);
        });
        this.nodeActive(item, 'RemCards/Total', total !== point);
        this.nodeText(item, 'RemCards/Total/Lb_Lose', total < 0 ? String(total) : '');
        this.nodeText(item, 'RemCards/Total/Lb_Win', total >= 0 ? `+${total}` : '');
        void this.renderSpecialHands(item, dataSeat).catch((error: unknown) => {
            console.error('[PdkSettlementSpecialHands] render failed', {
                gameCode: this.runtime.getGameCode(), dataSeat, error,
            });
        });
        this.nodeActive(item, 'CloseDoor', Boolean(this.indexed(this.viewSetEnd.closeDoorList, dataSeat)));
    }

    private async renderSpecialHands(item: Node, dataSeat: number): Promise<void> {
        const mount = this.nodeAt(item, 'SpecialHands');
        if (!mount) return;
        const revision = (this.specialHandRevisions.get(item) ?? 0) + 1;
        this.specialHandRevisions.set(item, revision);
        for (const child of [...mount.children]) child.destroy();
        const rawPatterns = this.indexed(this.viewSetEnd.specialHandList, dataSeat);
        const patterns = Array.isArray(rawPatterns) ? rawPatterns.map(String).filter(Boolean) : [];
        const profile = resolvePdkRegionalProfile(this.runtime.getGameCode())?.settlementSpecialHands;
        const frames = profile ? patterns.map((pattern) => profile.frameByPattern[pattern]).filter(Boolean) : [];
        mount.active = frames.length > 0;
        if (!profile || frames.length === 0) return;
        const bundle = await this.assets.bundle(profile.bundleName);
        const atlas = await this.assets.load(profile.atlasPath, SpriteAtlas, bundle);
        if (!item.isValid || !mount.isValid || this.specialHandRevisions.get(item) !== revision) return;
        const nodes = frames.flatMap((frameName) => {
            const frame = atlas.getSpriteFrame(frameName);
            if (!frame) return [];
            const node = new Node(frameName);
            const size = frame.originalSize;
            node.addComponent(UITransform).setContentSize(size.width, size.height);
            node.addComponent(Sprite).spriteFrame = frame;
            mount.addChild(node);
            return [node];
        });
        const gap = 4;
        const widths = nodes.map((node) => node.getComponent(UITransform)?.contentSize.width ?? 0);
        const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, nodes.length - 1) * gap;
        let x = -total / 2;
        nodes.forEach((node, index) => {
            const width = widths[index];
            node.setPosition(x + width / 2, 0, 0);
            x += width + gap;
        });
        mount.active = nodes.length > 0;
        console.info('[PdkSettlementSpecialHands]', {
            roomId: this.settlementRoomId, roundNo: this.displayedRoundNo,
            gameCode: this.runtime.getGameCode(), dataSeat, patterns, frames,
        });
    }

    private async renderPlayerHead(item: Node, player: Record<string, unknown>): Promise<void> {
        const mount = this.nodeAt(item, 'Head');
        if (!mount) throw new Error('SmallSettlement 条目缺少 Head 挂点');
        const revision = (this.headRevisions.get(item) ?? 0) + 1;
        this.headRevisions.set(item, revision);
        let head = mount.getChildByName('CommonHead');
        if (!head?.isValid) {
            const bundle = await this.assets.bundle(COMMON_ASSET_BUNDLE);
            const prefab = await this.assets.load(COMMON_HEAD_ASSET, Prefab, bundle);
            if (!item.isValid || !mount.isValid || this.headRevisions.get(item) !== revision) return;
            head = instantiate(prefab);
            for (const child of [...mount.children]) child.destroy();
            mount.addChild(head);
        }
        const controller = head.getComponent(CommonHeadController);
        if (!controller) throw new Error('CommonHead 缺少 CommonHeadController');
        const listVariant = controller.useVariant('List');
        const mountSize = mount.getComponent(UITransform)?.contentSize;
        const variantSize = listVariant.getComponent(UITransform)?.contentSize;
        const scale = mountSize && variantSize && variantSize.width > 0 && variantSize.height > 0
            ? Math.min(mountSize.width / variantSize.width, mountSize.height / variantSize.height)
            : 1;
        head.setScale(new Vec3(scale, scale, 1));
        // CommonHead keeps all three variants separated for prefab editing. Align
        // the selected List variant itself with the settlement's authored Head mount.
        head.setPosition(-listVariant.position.x * scale, -listVariant.position.y * scale, 0);
        this.nodeText(head, 'List/Lb_PlayerName', String(player.name ?? player.nickName ?? ''));
        this.nodeActive(head, 'List/Icon_Banker', Number(player.pid) === Number(this.runtime.getRoom().GetRoomProperty('ownerID')));
        await controller.showPlayerAvatar(Number(player.pid ?? 0), String(player.headImageUrl ?? ''));
    }

    private async renderRemainingCards(item: Node, values: readonly number[]): Promise<void> {
        const parent = this.nodeAt(item, 'RemCards/Cards');
        if (!parent) return;
        const revision = (this.remainingCardRevisions.get(item) ?? 0) + 1;
        this.remainingCardRevisions.set(item, revision);
        const template = parent.getChildByName('Card');
        const layout = parent.getComponent(Layout);
        const cardStep = this.horizontalCardStep(parent, template);
        const cardOrigin = template?.position.clone() ?? new Vec3();
        const sorted = this.sortedCards(values);
        this.cards.clearExcept(parent, ['Card']);
        if (template) template.active = false;
        // The prefab's right-anchored Cards node defines the right edge. Position
        // cards from that edge towards the left so a long remainder stays visible.
        // Runtime card roots have a different source size, so Layout cannot derive
        // the authored spacing reliably even after their visual scale is applied.
        if (layout) layout.enabled = false;
        for (const [index, value] of sorted.entries()) {
            const card = await this.createCardSlot(parent, template, value, `RemainCard_${index}`);
            if (!item.isValid || !parent.isValid || this.remainingCardRevisions.get(item) !== revision) {
                if (card.isValid) card.destroy();
                return;
            }
            card.setPosition(
                cardOrigin.x - (sorted.length - 1 - index) * cardStep,
                cardOrigin.y,
                cardOrigin.z,
            );
        }
    }

    private async renderPlayedCards(item: Node, hands: ReadonlyArray<{ playIndex: number; cards: number[] }>): Promise<void> {
        const parent = this.nodeAt(item, 'PlayedCards');
        if (!parent) return;
        const revision = (this.playedCardRevisions.get(item) ?? 0) + 1;
        this.playedCardRevisions.set(item, revision);
        const cardTemplate = parent.getChildByName('Card');
        const countTemplate = parent.getChildByName('Count');
        const layout = parent.getComponent(Layout);
        const cardStep = this.horizontalCardStep(parent, cardTemplate);
        const cardOrigin = cardTemplate?.position.clone() ?? new Vec3();
        const countOffset = countTemplate
            ? new Vec3(countTemplate.position.x - cardOrigin.x, countTemplate.position.y - cardOrigin.y, countTemplate.position.z - cardOrigin.z)
            : new Vec3();
        this.cards.clearExcept(parent, ['Card', 'Count', 'Bg_Count']);
        if (cardTemplate) cardTemplate.active = false;
        if (countTemplate) countTemplate.active = false;
        // Positions below are authored from the prefab Card/Count anchors. An
        // enabled Layout runs again at frame end and moves every generated slot
        // back to the container edge, overriding those authored coordinates.
        if (layout) layout.enabled = false;
        const renderedCardWidth = this.renderedWidth(cardTemplate) || cardStep;
        let nextHandX = cardOrigin.x;
        for (const hand of hands) {
            const sorted = this.sortedCards(hand.cards);
            let lastCardX = nextHandX;
            for (const [index, value] of sorted.entries()) {
                const card = await this.createCardSlot(parent, cardTemplate, value, `PlayedCard_${hand.playIndex}_${index}`);
                if (!item.isValid || !parent.isValid || this.playedCardRevisions.get(item) !== revision) {
                    if (card.isValid) card.destroy();
                    return;
                }
                lastCardX = nextHandX + index * cardStep;
                card.setPosition(lastCardX, cardOrigin.y, cardOrigin.z);
            }
            if (countTemplate && sorted.length > 0) {
                const count = instantiate(countTemplate);
                count.name = `PlayCount_${hand.playIndex}`;
                count.active = true;
                count.setPosition(
                    lastCardX + countOffset.x,
                    cardOrigin.y + countOffset.y,
                    cardOrigin.z + countOffset.z,
                );
                parent.addChild(count);
                this.nodeText(count, 'Label', String(hand.playIndex));
            }
            if (sorted.length > 0) nextHandX = lastCardX + renderedCardWidth + PLAYED_HAND_GAP;
        }
    }

    private horizontalCardStep(parent: Node, template: Node | null): number {
        const width = template?.getComponent(UITransform)?.contentSize.width ?? 0;
        const layout = parent.getComponent(Layout);
        const step = width + (layout?.spacingX ?? 0);
        return step > 0 ? step : Math.max(1, width * 0.3);
    }

    /**
     * Clone the authored Card node as a layout slot. Runtime poker visuals only
     * fill this slot; they never replace its position, dimensions or scale.
     */
    private async createCardSlot(parent: Node, template: Node | null, value: number, name: string): Promise<Node> {
        if (!template) throw new Error('SmallSettlement 缺少 Card 模板节点');
        const slot = instantiate(template);
        slot.name = name;
        slot.active = true;
        try {
            // Build the complete card while the slot is detached. Settlement can
            // rerender during bundle loading (history hydration/replay-code refresh);
            // attaching first would let the newer render destroy this slot and the
            // resumed factory would then add a child to an invalid Cocos node.
            const card = await this.cards.create(slot, value);
            if (!parent.isValid) {
                slot.destroy();
                return slot;
            }
            parent.addChild(slot);
            const slotSize = slot.getComponent(UITransform)?.contentSize;
            const cardSize = card.getComponent(UITransform)?.contentSize;
            const scaleX = slotSize && cardSize && cardSize.width > 0
                ? slotSize.width / cardSize.width
                : 1;
            const scaleY = slotSize && cardSize && cardSize.height > 0
                ? slotSize.height / cardSize.height
                : 1;
            card.setPosition(0, 0, 0);
            // Width and height are both authored controls. Do not preserve the
            // source prefab aspect ratio here, otherwise changing only one axis in
            // SmallSettlement/Card appears to have no effect at runtime.
            card.setScale(scaleX, scaleY, 1);
            return slot;
        } catch (error) {
            if (slot.isValid) slot.destroy();
            throw error;
        }
    }

    private renderedWidth(template: Node | null): number {
        const width = template?.getComponent(UITransform)?.contentSize.width ?? 0;
        return width * Math.abs(template?.scale.x ?? 1);
    }

    private playedHands(dataSeat: number): Array<{ playIndex: number; cards: number[] }> {
        const history = Array.isArray(this.viewSetEnd.playHistory) ? this.viewSetEnd.playHistory : [];
        const hands = history.flatMap((value, order) => {
            const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            if (Number(item.seat) !== dataSeat || !Array.isArray(item.cards)) return [];
            const playIndex = Number.isSafeInteger(Number(item.playIndex)) && Number(item.playIndex) > 0
                ? Number(item.playIndex) : order + 1;
            return [{ playIndex, cards: this.remainingCards(item.cards) as number[] }];
        });
        if (hands.length > 0) return hands;
        const legacy = this.remainingCards(this.indexed(this.viewSetEnd.playedCardList, dataSeat));
        return legacy.length > 0 ? [{ playIndex: 1, cards: [...legacy] }] : [];
    }

    private remainingCardSource(dataSeat: number): unknown {
        return this.indexed(this.viewSetEnd.surplusCardList, dataSeat) ?? this.indexed(this.viewSetEnd.remainCards, dataSeat) ?? [];
    }

    private remainingCards(source: unknown): readonly number[] {
        if (!Array.isArray(source)) return [];
        return source.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
    }

    private remainingCount(source: unknown, cards: readonly number[]): number {
        if (Array.isArray(source)) return cards.length;
        return Math.max(0, Number(source ?? 0));
    }

    private sortedCards(values: readonly number[]): number[] {
        return [...values].sort((left, right) => this.compareCard(right, left));
    }

    private compareCard(left: number, right: number): number {
        const valueDelta = this.cardValue(left) - this.cardValue(right);
        if (valueDelta !== 0) return valueDelta;
        return this.cardColor(left) - this.cardColor(right);
    }

    private cardValue(card: number): number {
        const value = card > 500 ? card - 500 : card;
        return value >= 100 ? value % 100 : value & 0x0f;
    }

    private cardColor(card: number): number {
        const value = card > 500 ? card - 500 : card;
        return value >= 100 ? Math.floor(value / 100) : value & 0xf0;
    }

    private continueGame(): void {
        const currentSet = this.runtime.getRoomSet().GetRoomSetInfo() as Record<string, unknown> | undefined;
        const currentPhase = String(currentSet?.authorityPhase ?? '').toUpperCase();
        // Reopening the latest settlement from the persistent room button is a
        // read-only review. The round's continue request was already committed;
        // "继续" only returns to the live table and must not submit it again.
        if (this.openedFromRoomButton
            || (this.form?.node as (Node & { __pdkRoomButtonReview?: boolean }) | undefined)?.__pdkRoomButtonReview === true
            // A stale settlement payload may still say canContinue after the next
            // round has begun. The live authoritative phase always wins.
            || (currentPhase.length > 0 && currentPhase !== 'FINISHED')) {
            this.stopAutoContinue();
            this.forms.close(this.smallSettlementForm);
            return;
        }
        const room = this.runtime.getRoom();
        if (this.matchFinished()) { void this.showBigSettlement(); return; }
        if (!this.canContinue()) {
            this.showMessage('本局尚未结算完成，请稍候');
            return;
        }
        const roomId = Number(this.runtime.getRoomManager().GetEnterRoomID());
        const roundKey = `${roomId}:${this.numberValue(this.setEnd.roundNo)}`;
        if (this.continueInFlight || this.continueRoundKey === roundKey) return;
        this.stopAutoContinue();
        this.continueInFlight = true;
        this.continueRoundKey = roundKey;
        const button = this.node('Bottom/Btn/Btn_Continue')?.getComponent(Button);
        if (button) button.interactable = false;
        // Continue is the visual lifetime boundary of the completed round. Clear
        // synchronously on the accepted click, before closing the modal or waiting
        // for the network acknowledgement, so the old table cannot flash through.
        this.clearCompletedRoundVisuals();
        void this.runtime.action('continue', 'common.room.continue_req', { roomID: roomId }).then(() => {
            this.forms.close(this.smallSettlementForm);
        }).catch((error: unknown) => {
            this.continueRoundKey = '';
            const message = error instanceof Error && error.message.includes('round not finished')
                ? '本局尚未结算完成，请稍候'
                : error instanceof Error ? error.message : '继续游戏失败，请重试';
            this.showMessage(message);
        }).finally(() => {
            this.continueInFlight = false;
            if (button?.isValid) button.interactable = this.canContinue();
        });
    }

    private canContinue(): boolean {
        if (this.openedFromRoomButton) return true;
        const roomSet = this.runtime.getRoomSet().GetRoomSetInfo() as Record<string, unknown> | undefined;
        return Boolean(this.setEnd.canContinue ?? roomSet?.canContinue) && !this.matchFinished();
    }

    private isCompletedSettlement(payload: Record<string, unknown>): boolean {
        const phase = String(payload.authorityPhase ?? payload.phase ?? '').toUpperCase();
        return ['FINISHED', 'ROUND_SETTLEMENT', 'INTER_ROUND', 'SETTLED', 'DIRECT_WIN'].includes(phase)
            || payload.matchFinished === true
            || payload.canContinue === true;
    }

    private hasSettlementCards(payload: Record<string, unknown>): boolean {
        const collections = [payload.surplusCardList, payload.playedCardList, payload.playHistory];
        return collections.some((value) => Array.isArray(value) && value.some((entry) =>
            Array.isArray(entry) ? entry.length > 0 : Boolean(entry && typeof entry === 'object')));
    }

    private startAutoContinue(): void {
        this.stopAutoContinue();
        if (this.openedFromRoomButton) {
            this.text('Bottom/Btn/Btn_Continue/Label', '继续');
            const button = this.node('Bottom/Btn/Btn_Continue')?.getComponent(Button);
            if (button) button.interactable = true;
            return;
        }
        if (this.matchFinished()) return;
        const deadline = this.setEnd.nextRoundDeadline && typeof this.setEnd.nextRoundDeadline === 'object'
            ? this.setEnd.nextRoundDeadline as Record<string, unknown> : {};
        const deadlineEpochMillis = Number(deadline.deadlineEpochMillis ?? 0);
        const serverEpochMillis = Number(this.setEnd.serverEpochMillis ?? 0);
        if (!String(deadline.operationId ?? '')
            || !Number.isFinite(deadlineEpochMillis)
            || !Number.isFinite(serverEpochMillis)
            || serverEpochMillis <= 0) {
            // No Authority deadline means this is a manually advanced settlement.
            this.text('Bottom/Btn/Btn_Continue/Label', '继续');
            return;
        }
        this.autoContinueDeadlineLocalMillis = Date.now()
            + Math.max(0, deadlineEpochMillis - serverEpochMillis);
        this.updateAuthoritativeContinueCountdown();
        this.renderContinueCountdown();
        this.autoContinueTimer = setInterval(() => {
            this.updateAuthoritativeContinueCountdown();
            this.renderContinueCountdown();
            // Authority alone advances a floating settlement. At zero the
            // client only stops its display timer and waits for the next state.
            if (this.matchFinished() || this.autoContinueSeconds === 0) this.stopAutoContinue();
        }, 1000);
    }

    private stopAutoContinue(): void {
        if (this.autoContinueTimer !== null) clearInterval(this.autoContinueTimer);
        this.autoContinueTimer = null;
    }

    private renderContinueCountdown(): void {
        this.text('Bottom/Btn/Btn_Continue/Label',
            `继续(${this.autoContinueSeconds})`);
    }

    private updateAuthoritativeContinueCountdown(): void {
        this.autoContinueSeconds = Math.max(
            0,
            Math.ceil((this.autoContinueDeadlineLocalMillis - Date.now()) / 1000),
        );
    }

    private matchFinished(): boolean {
        const room = this.runtime.getRoom();
        const roomSet = this.runtime.getRoomSet().GetRoomSetInfo() as Record<string, unknown> | undefined;
        const explicit = this.booleanValue(this.setEnd.matchFinished ?? roomSet?.matchFinished);
        if (explicit !== null) return explicit;
        // Authority 的 FINISHED 表示“一局结束”，不是“整场结束”。这里必须用
        // matchFinished 或局数上限兜底，避免 1/8 小结算错误隐藏“继续”入口。
        const roundNo = this.numberValue(this.setEnd.roundNo ?? roomSet?.roundNo ?? room.GetRoomProperty('setID'));
        const roundLimit = this.numberValue(this.setEnd.roundLimit ?? roomSet?.roundLimit ?? room.GetRoomConfigByProperty('setCount'));
        return roundLimit > 0 && roundNo >= roundLimit;
    }

    private async showBigSettlement(): Promise<void> {
        if (this.finalSettlementOpening) return;
        this.finalSettlementOpening = true;
        this.stopAutoContinue();
        try {
            const form = await this.forms.show(this.bigSettlementForm, this.setEnd);
            if (form) this.forms.close(this.smallSettlementForm);
        } catch (error: unknown) {
            this.showMessage(error instanceof Error ? error.message : '总结算加载失败，请重试');
        } finally {
            this.finalSettlementOpening = false;
        }
    }

    private date(value: unknown): string {
        const milliseconds = Number(value ?? Date.now());
        const date = new Date(milliseconds < 100000000000 ? milliseconds * 1000 : milliseconds);
        const pad = (number: number) => number < 10 ? `0${number}` : String(number);
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    private node(path: string): Node | null { return this.form?.find(path) ?? null; }
    private active(path: string, value: boolean): void { const node = this.node(path); if (node) node.active = value; }
    private text(path: string, value: string): void { const label = this.node(path)?.getComponent(Label); if (label) label.string = value; }
    private nodeAt(root: Node, path: string): Node | null { return root.getChildByPath(path) ?? null; }
    private nodeActive(root: Node, path: string, value: boolean): void { const node = this.nodeAt(root, path); if (node) node.active = value; }
    private nodeText(root: Node, path: string, value: string): void { const label = this.nodeAt(root, path)?.getComponent(Label); if (label) label.string = value; }
    private indexed(value: unknown, index: number): unknown {
        if (Array.isArray(value)) return value[index];
        if (value && typeof value === 'object') return (value as Record<string, unknown>)[String(index)];
        return undefined;
    }
    private booleanValue(value: unknown): boolean | null {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return null;
    }
    private numberValue(value: unknown): number {
        const number = Number(value);
        return Number.isSafeInteger(number) ? number : 0;
    }
    private objectValue(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown> : {};
    }
}
