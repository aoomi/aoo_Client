import { instantiate, Layout, Node, tween, Tween, UITransform, Vec3 } from 'cc';





import { createSeatEntries } from './Room/PdkSeatPresenter';







import { PdkRoomNodePath } from './Room/PdkRoomNodePaths';

import { Poker_Card_Presenter } from '../../../../Common/Code/Card/Poker_Card_Presenter';

import { layoutPdkRetainedHand, layoutPdkRetainedHands, setPdkRetainedPlayIndex } from './Room/PdkRetainedPlayedCardFlow';

import { type PdkRoundPresentationAcceptance, type PdkRoundPresentationLease } from './Room/PdkRoundPresentationLifecycle';

const HAND_COMPACT_DURATION_SECONDS = 0.35;
const OWN_CARD_FLIGHT_DURATION_SECONDS = 0.32;
const COMPLETED_TRICK_HOLD_MS = 2000;
const OUT_CARD_FALLBACK_WIDTH = 80;

/** Internal behavior module; state remains in its PdkPlayController host. */
export class PdkTablePresentationController {
    public constructor(private readonly host: any) {}

public async renderPublicOperation(
        packet: Record<string, unknown>,
        expectedProjectionGeneration?: number,
    ): Promise<void> {
        if (!this.host.view) return;
        const lease = this.host.roundPresentation.lease();
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat()).find((item) => item.dataSeat === dataSeat);
        if (!entry) return;
        if (expectedProjectionGeneration !== undefined
            && expectedProjectionGeneration !== this.host.publicProjectionGeneration) return;
        // Claim the seat before the mandatory two-second hold. Any newer
        // authority projection or operation for this seat invalidates this
        // renderer, so an old single-card task can never overwrite a newer
        // compound play after its wait finishes.
        const seatRevision = this.claimPublicSeatRender(dataSeat);
        const values = Array.isArray(packet.cardList) ? packet.cardList.map(Number) : [];
        const outCardPath = `Players/Seat_${entry.physicalSlot}/Card/Out_Card`;
        const parent = this.host.view.find(outCardPath);
        this.host.tracePublicProjection('RENDER_BEGIN', {
            dataSeat,
            physicalSlot: entry.physicalSlot,
            operationId: String(packet.operationId ?? packet.actionId ?? ''),
            cardValues: values,
            seatRevision,
            expectedProjectionGeneration: expectedProjectionGeneration ?? null,
            currentProjectionGeneration: this.host.publicProjectionGeneration,
        });
        if (this.host.runtime.arrangementEnabled()) {
            // Liangshan moves the preceding physical nodes into Table_Cards.
            // Never clear/replace Out_Card until that transfer has stopped.
            await this.host.retainedPlayedCardFlow?.waitForPendingTransfers();
        } else {
            await this.waitForPublicCardHold(dataSeat);
        }
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) return;
        let destinationCleared = false;
        // The authority acknowledgement can arrive before the local flight
        // finishes. Clear and hide the destination before waiting, otherwise a
        // stale card is visible underneath the one physical card that is moving.
        if (dataSeat === this.host.clientSeat() && this.host.ownLandingCards.length > 0) {
            await this.clearActionSlot(parent);
            if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) return;
            destinationCleared = true;
            this.setOutCardVisible(outCardPath, false);
            await this.host.ownCardFlight;
            if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) return;
        }
        if (!destinationCleared) await this.clearActionSlot(parent);
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) return;
        // The flying cards themselves become the final Out_Card nodes. This is
        // one physical presentation moving and stopping, never two card copies.
        this.setOutCardVisible(outCardPath, false);
        const landed = dataSeat === this.host.clientSeat() && parent
            && this.host.ownLandingCards.filter((card: Node) => card.isValid).length === values.length
            ? [...this.host.ownLandingCards] : [];
        const landedFromOwnFlight = landed.length > 0;
        if (landed.length > 0 && parent) {
            // These physical nodes already reached the exact prefab-authored
            // Out_Card destinations. Freeze Layout before reparenting so neither
            // the engine nor updateActionCardLayout applies a second ~3px snap.
            const layout = parent.getComponent(Layout);
            if (layout) layout.enabled = false;
            for (const card of landed) {
                const worldPosition = card.worldPosition.clone();
                card.parent = parent;
                card.setWorldPosition(worldPosition);
                // The flight already ends at the authored Out_Card world scale.
                // Once reparented, a unit local scale is that exact final size;
                // preserving a transient world scale here lets a following Layout
                // pass apply the parent scale again and produces a visible grow.
                card.setScale(Vec3.ONE);
            }
            this.host.ownLandingCards.length = 0;
        } else if (parent && values.length > 0) for (const value of values) {
            const card = await this.host.cards.create(parent, value);
            if (!parent.isValid
                || !this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) {
                if (card.isValid) card.destroy();
                return;
            }
        }
        // Layout skips inactive nodes. Activate the complete authoritative hand
        // first, then arrange it in the same frame; otherwise every card keeps
        // the prefab origin and only the last (topmost) card is visible remotely.
        this.setOutCardVisible(outCardPath, values.length > 0);
        if (!landedFromOwnFlight) {
            this.updateActionCardLayout(parent, {
                dataSeat,
                physicalSlot: entry.physicalSlot,
                operationId: String(packet.operationId ?? packet.actionId ?? ''),
                cardValues: values,
            });
        }
        this.clearOutCardPlayCount(parent);
        // Retained-table variants reveal Pointer only after the physical hand has
        // finished moving into Table_Cards. Showing it on Out_Card creates a
        // second, transient pointer that remains visible during the transfer.
        if (parent && values.length > 0 && !this.host.runtime.arrangementEnabled()) {
            this.showCurrentPlayArrow(parent, packet, true);
        }
        if (!this.isPublicSeatRenderCurrent(dataSeat, seatRevision, lease, expectedProjectionGeneration)) return;
        this.host.view.visible(`Players/Seat_${entry.physicalSlot}/Tip/Pass`, values.length === 0);
        if (values.length > 0) {
            this.host.publicSeatOperationIds.set(dataSeat, String(packet.operationId ?? packet.actionId ?? ''));
            this.markPublicCardsShown(dataSeat);
            // Authority can skip every unbeatable responder and return the turn
            // to the player before that player's flight has landed. The turn
            // boundary then runs before a shown timestamp exists. Re-arm the
            // seat-owned clear after landing so the winning lead is visible for
            // the full hold and disappears before the player acts again.
            if (dataSeat === this.host.activeOpPos && !this.host.runtime.arrangementEnabled()) {
                this.clearPublicCardsForTurn(dataSeat);
            }
        } else {
            this.host.publicCardShownAt.delete(dataSeat);
        }
        this.host.tracePublicProjection('RENDER_COMMIT', {
            dataSeat,
            physicalSlot: entry.physicalSlot,
            operationId: String(packet.operationId ?? packet.actionId ?? ''),
            cardValues: values,
            childCount: parent?.children.filter((child: Node) => child.name !== 'PlayCount').length ?? 0,
            active: parent?.activeInHierarchy ?? false,
        });
    }

public async presentPublicOperation(packet: Record<string, unknown>): Promise<void> {
        const lease = this.host.roundPresentation.lease();
        const landing = this.rememberLatestPublicCardLanding(this.renderPublicOperation(packet));
        await landing;
        // The public renderer may yield while cards load, a local flight lands,
        // or a preceding retained transfer drains. A round boundary invalidates
        // the whole operation during any of those awaits. Never capture the
        // generation after the await: doing so lets an old-round continuation
        // adopt the new round's generation and archive its stale operation into
        // an opponent Table_Cards container.
        if (!this.host.roundPresentation.isCurrent(lease)
            || !this.host.view || !this.host.runtime.arrangementEnabled()) return;
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        if (!entry || !operationId) return;
        const outCard = this.host.view.find(`Players/Seat_${entry.physicalSlot}/Card/Out_Card`);
        const tableCards = this.host.view.find(`Players/Seat_${entry.physicalSlot}/Card/Table_Cards`);
        if (!outCard || !tableCards) return;
        this.host.traceOutCards('liangshan-arrangement-hold-start', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot, holdMs: 1500,
        });
        const moved = await this.host.retainedPlayedCardFlow?.moveAfterLiveHold({
            outCard,
            tableCards,
            playCountTemplate: this.host.view.find(PdkRoomNodePath.playCountTemplate),
            operationId,
            playIndex: this.resolveAuthorityPlayIndex(operationId, Number(packet.playIndex ?? 0)),
            isCurrent: () => this.host.roundPresentation.isCurrent(lease) && Boolean(this.host.view),
        });
        this.host.traceOutCards('liangshan-arrangement-move-finish', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot, moved: Boolean(moved),
        });
        if (!this.host.roundPresentation.isCurrent(lease) || !this.host.view) return;
        if (moved) {
            const retainedHand = tableCards.getChildByName(`Play_${operationId}`);
            if (retainedHand) this.showCurrentPlayArrow(retainedHand, packet, true);
        }
        if (moved) return;
        // A live Liangshan action is never reconstructed directly in Table_Cards.
        // If its presentation was superseded, the newer authority action owns the
        // screen; reconnect history is restored separately by restoreTableCards.
        this.host.traceOutCards('liangshan-arrangement-move-superseded', {
            operationId, dataSeat, physicalSlot: entry.physicalSlot,
        });
    }

public rememberLatestPublicCardLanding(landing: Promise<void>): Promise<void> {
        this.host.latestPublicCardLanding = landing;
        return landing;
    }

public resolveAuthorityPlayIndex(operationId: string, fallback: number): number {
        if (Number.isSafeInteger(fallback) && fallback > 0) return fallback;
        if (!operationId) return 0;
        const setInfo = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const operations = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        let playIndex = 0;
        for (const value of operations) {
            const operation = this.host.record(value);
            if (!operation || String(operation.action).toLowerCase() !== 'play') continue;
            const cards = Array.isArray(operation.cards) ? operation.cards : [];
            if (cards.length === 0) continue;
            playIndex += 1;
            if (String(operation.operationId ?? operation.actionId ?? '') === operationId) return playIndex;
        }
        // The low-latency OpCard notification can arrive one packet before the
        // room snapshot includes its operation. At that boundary this committed
        // play is exactly the next play after the complete ledger prefix.
        return playIndex + 1;
    }

public async presentLatestAuthorityAction(
        setInfo: Record<string, unknown>,
        expectedLease: PdkRoundPresentationLease,
    ): Promise<void> {
        if (!this.host.roundPresentation.isCurrent(expectedLease)) return;
        const actions = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        if (actions.length === 0) {
            await this.reconcileAuthorityPublicCards(setInfo);
            return;
        }
        // This method is live-only. onShow restores historical operations and
        // records their ids separately; a false initialization flag here merely
        // means this is the first commit after a round reset, not a reconnect.
        this.host.authorityActionsInitialized = true;
        // Live authority packets can coalesce several committed operations. A
        // latest-only renderer lets every intermediate play fall through to
        // restoreTableCards, where it appears directly in the archive without
        // Hand/Out/Table movement. Present every unseen ledger entry in order;
        // direct history reconstruction remains exclusive to initial/reconnect.
        let playIndex = 0;
        for (const value of actions) {
            const action = this.host.record(value);
            if (!action) continue;
            const isPlay = String(action.action).toLowerCase() === 'play'
                && Array.isArray(action.cards) && action.cards.length > 0;
            if (isPlay) playIndex += 1;
            const actionKey = this.host.authorityActionKey(action);
            const existingPresentation = this.host.tableActionPresentations.get(actionKey);
            if (existingPresentation) {
                await existingPresentation;
                if (!this.host.roundPresentation.isCurrent(expectedLease)) return;
                continue;
            }
            if (this.host.tableActionIds.has(actionKey)) continue;
            this.host.tableActionIds.add(actionKey);
            const presentation = this.presentNewAuthorityAction(action, isPlay ? playIndex : 0);
            this.host.tableActionPresentations.set(actionKey, presentation);
            try {
                await presentation;
                if (!this.host.roundPresentation.isCurrent(expectedLease)) return;
            } finally {
                if (this.host.tableActionPresentations.get(actionKey) === presentation) {
                    this.host.tableActionPresentations.delete(actionKey);
                }
            }
        }
    }

public async presentNewAuthorityAction(
        latest: Record<string, unknown>,
        authorityPlayIndex: number,
    ): Promise<void> {
        const dataSeat = Number(latest.seat ?? latest.pos ?? latest.opPos ?? -1);
        const physicalSlot = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
            .find((entry) => entry.dataSeat === dataSeat)?.physicalSlot ?? 0;
        const operationId = String(latest.operationId ?? '');
        const action = String(latest.action ?? '').toLowerCase();
        const cards = Array.isArray(latest.cards) ? latest.cards.map(Number) : [];
        const actionType = action === 'pass' || cards.length === 0 ? 1
            : this.host.gameAudioOperationType(latest.opCardType ?? latest.opType ?? latest.cardType ?? latest.type);
        // Retained-table authority updates do not emit the legacy OpCard event.
        // Announce the newly committed operation here so every client hears the
        // responding player's card pattern exactly once.
        this.host.playGameOperation(dataSeat, actionType, cards);
        this.playOperationAnimationOnce(operationId, actionType, physicalSlot);
        if (actionType !== 1) void this.host.roomAudio?.play('chupai');
        if (action === 'pass' || cards.length === 0) {
            await this.renderPublicOperation({ pos: dataSeat, cardList: [] });
            return;
        }
        await this.presentPublicOperation({
            pos: dataSeat,
            cardList: cards,
            operationId,
            playIndex: authorityPlayIndex,
        });
    }

public clearPublicCards(): void {
        this.host.currentPlayArrow?.hide();
        this.host.currentPlayArrowIndex = 0;
        this.host.currentPlayArrowOperationId = '';
        this.cancelPublicCardClearTimers();
        this.host.publicCardShownAt.clear();
        this.host.publicSeatOperationIds.clear();
        this.host.cancelPendingPresentations();
        this.host.publicProjectionGeneration += 1;
        this.host.publicSeatRenderRevisions.clear();
        this.host.renderedActionIds.clear();
        if (!this.host.view) return;
        for (let slot = 0; slot < 4; slot += 1) {
            this.host.cards.clear(this.host.view.find(`Players/Seat_${slot}/Card/Out_Card`));
            this.host.view.visible(`Players/Seat_${slot}/Card/Out_Card`, false);
            this.host.view.visible(`Players/Seat_${slot}/Tip/Pass`, false);
        }
    }

public scheduleContinueReadyClear(setInfo: Record<string, unknown>): void {
        if (this.host.continueReadyClearTimer) return;
        const players = this.host.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const count = this.host.authoritativePlayerCount();
        const occupied = Array.from({ length: count }, (_value, seat) => players[seat] ?? {})
            .filter((player) => Number(player.pid ?? 0) > 0);
        if (occupied.length !== count || !occupied.every((player) => Boolean(player.isContinue))) return;
        const roundKey = this.continueReadyRoundKey(setInfo);
        this.host.continueReadyClearTimer = globalThis.setTimeout(() => {
            this.host.continueReadyClearTimer = 0;
            this.host.continueReadyHiddenRoundKey = roundKey;
            this.host.seats?.hideReadyStates();
            console.info('[CommonRoomContinueReadyClear]', {
                roomId: this.host.roomId(), roundKey, delayMs: 1000,
            });
        }, 1000) as unknown as number;
    }

public continueReadyRoundKey(setInfo: Record<string, unknown>): string {
        return `${this.host.roomId()}:${Number(setInfo.roundNo ?? setInfo.setID
            ?? this.host.runtime.getRoom().GetRoomProperty('setID') ?? 0)}`;
    }

public acceptPresentationRound(
        setInfo: Record<string, unknown>,
        source: string,
    ): PdkRoundPresentationAcceptance {
        const acceptance = this.host.roundPresentation.accept({
            roomId: this.host.roomId(),
            roundNo: Number(setInfo.roundNo ?? setInfo.setID
                ?? this.host.runtime.getRoom().GetRoomProperty('setID') ?? 0),
            shuffleSequence: Number(setInfo.shuffleSequence ?? setInfo.dealSequence ?? -1),
            dealIdentity: String(setInfo.dealId ?? setInfo.dealIdentity ?? ''),
        });
        if (!acceptance.accepted) {
            console.info('[CommonRoomRoundVisualBoundary]', {
                stage: `REJECT_${acceptance.rejection}`,
                source,
                roomId: this.host.roomId(),
                roundNo: acceptance.identity.roundNo,
                shuffleSequence: acceptance.identity.shuffleSequence,
                current: this.host.roundPresentation.currentIdentity(),
            });
            return acceptance;
        }
        if (!acceptance.changed && acceptance.previousKey) return acceptance;
        if (acceptance.previousKey) this.host.pendingRoundActivityResetKey = acceptance.lease.key;
        // accept() invalidates all old leases before any old node is detached.
        // The first activation is cleared too because CommonRoom itself may be
        // cached across controller instances even though this lifecycle is new.
        void this.clearRoundPresentationNodes();
        console.info('[CommonRoomRoundVisualBoundary]', {
            stage: acceptance.previousKey ? 'ACCEPT_NEW_DEAL' : 'ACTIVATE_DEAL',
            source, roomId: this.host.roomId(),
            previousRoundKey: acceptance.previousKey,
            nextRoundKey: acceptance.lease.key,
            roundNo: acceptance.identity.roundNo,
            shuffleSequence: acceptance.identity.shuffleSequence,
            dealIdentity: acceptance.identity.dealIdentity,
            stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
        });
        return acceptance;
    }

public shouldResetRoundActivity(
        setInfo: Record<string, unknown>,
        acceptance: PdkRoundPresentationAcceptance,
    ): boolean {
        const key = acceptance.lease.key;
        if (acceptance.changed && acceptance.previousKey) this.host.pendingRoundActivityResetKey = key;
        if (this.host.pendingRoundActivityResetKey !== key) return false;
        if (setInfo.authoritativeTableSnapshotComplete === true) {
            this.host.pendingRoundActivityResetKey = '';
            return false;
        }
        const comparison = this.host.record(setInfo.comparisonState) ?? {};
        const roundNo = Number(setInfo.roundNo ?? setInfo.setID
            ?? this.host.runtime.getRoom().GetRoomProperty('setID') ?? 0);
        const stateVersion = Number(setInfo.stateVersion
            ?? this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const comparisonRoundNo = Number(comparison.authorityRoundNo ?? -1);
        const comparisonStateVersion = Number(comparison.authorityStateVersion ?? -1);
        // Legacy currentTrick is trusted again only after it proves ownership by
        // both the new round and the exact surrounding authority commit.
        if (comparisonRoundNo === roundNo && comparisonStateVersion === stateVersion) {
            this.host.pendingRoundActivityResetKey = '';
            return false;
        }
        return true;
    }

public clearTableCards(): void {
        this.host.currentPlayArrow?.hide();
        // Cleanup is unconditional. The capability only controls whether retained
        // hands may be created/restored; it must never protect nodes left by the
        // previous round while the next round is in COMPETE_DEALER or PLAYING.
        if (!this.host.view) return;
        for (let slot = 0; slot < 4; slot += 1) {
            const path = `Players/Seat_${slot}/Card/Table_Cards`;
            const table = this.host.view.find(path);
            this.host.cards.clear(table);
            this.host.view.visible(path, false);
        }
    }

public async appendTableCards(
        packet: Record<string, unknown>,
        expectedLease: PdkRoundPresentationLease,
        ownsReconciliation: () => boolean,
    ): Promise<void> {
        if (!this.host.view || !this.host.runtime.arrangementEnabled()) return;
        if (!this.host.roundPresentation.isCurrent(expectedLease) || !ownsReconciliation()) return;
        const dataSeat = Number(packet.pos ?? packet.opPos ?? -1);
        const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        const values = Array.isArray(packet.cardList) ? packet.cardList.map(Number) : [];
        if (!entry || values.length === 0) return;
        const path = `Players/Seat_${entry.physicalSlot}/Card/Table_Cards`;
        const parent = this.host.view.find(path);
        if (!parent) return;
        this.host.view.visible(path, true);
        const outerLayout = parent.getComponent(Layout) ?? parent.addComponent(Layout);
        outerLayout.enabled = false;

        // Table_Cards lays out complete plays, not individual cards. Its authored
        // Spacing X is the gap between hands; cards inside one hand continue to
        // use the sibling Out_Card spacing.
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        if (!operationId) return;
        const nodeName = `Play_${operationId}`;
        // Authority pushes, reconnect recovery and the local presentation task can
        // all converge on the same committed operation. Creating the group before
        // the first awaited card load makes this check an atomic idempotency gate.
        const existingHand = parent.getChildByName(nodeName);
        if (existingHand) {
            setPdkRetainedPlayIndex(existingHand, Number(packet.playIndex ?? 0));
            // Authority recovery and the live Out_Card -> Table_Cards transfer
            // can converge on the same operation. The hand container is the
            // idempotency key, but an existing container is not proof that its
            // post-flight PlayCount step already ran. Reconcile the complete
            // hand instead of returning with a permanently missing ordinal.
            this.host.retainedPlayedCardFlow?.addStoppedPlayCount(
                existingHand,
                this.host.view.find(PdkRoomNodePath.playCountTemplate),
                Number(packet.playIndex ?? 0),
            );
            layoutPdkRetainedHands(parent);
            return;
        }
        const hand = new Node(nodeName);
        hand.parent = parent;
        setPdkRetainedPlayIndex(hand, Number(packet.playIndex ?? 0));
        hand.addComponent(UITransform).setContentSize(0, 0);
        for (const value of values) {
            const card = await this.host.cards.create(hand, value);
            if (!this.host.roundPresentation.isCurrent(expectedLease) || !ownsReconciliation()
                || !parent.isValid || !hand.isValid) {
                if (card.isValid) card.destroy();
                if (hand.isValid) hand.destroy();
                return;
            }
        }
        const retainedCards = hand.children.filter((child) => !child.name.startsWith('PlayCount'));
        const cardSpacing = parent.parent?.getChildByName('Out_Card')?.getComponent(Layout)?.spacingX ?? 0;
        layoutPdkRetainedHand(hand, retainedCards, cardSpacing);
        this.host.retainedPlayedCardFlow?.addStoppedPlayCount(
            hand,
            this.host.view.find(PdkRoomNodePath.playCountTemplate),
            Number(packet.playIndex ?? 0),
        );
        layoutPdkRetainedHands(parent);
    }

public async restoreTableCards(
        packet: Record<string, unknown>,
        expectedLease: PdkRoundPresentationLease,
        ownsReconciliation: () => boolean = () => true,
    ): Promise<void> {
        if (!this.host.view || !this.host.runtime.arrangementEnabled()) return;
        if (!this.host.roundPresentation.isCurrent(expectedLease) || !ownsReconciliation()) return;
        const authorityVersion = Number(packet.stateVersion
            ?? this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const currentAuthorityVersion = (): number => Number(
            this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1,
        );
        const ownsCurrentAuthority = (): boolean => ownsReconciliation()
            && this.host.roundPresentation.isCurrent(expectedLease)
            && authorityVersion === currentAuthorityVersion();
        // RoomSet exposes a mutable projection. Freeze the reconnect ledger at
        // method entry: live commits may append to the original array while card
        // assets are awaiting, and must never be consumed by this history loop.
        const operations = Array.isArray(packet.tableOperations) ? [...packet.tableOperations] : [];
        // A retained table is reconstructed exclusively from the ordered
        // authoritative operation ledger. playedCardList is a per-seat flattened
        // compatibility field: using it here loses hand boundaries and lets the
        // newest operation be drawn a second time on the next authority refresh.
        // Do not clear and rebuild here: authority pushes can overlap while card
        // assets load. Operation-id reconciliation preserves already committed
        // groups and appends only the missing hands in server order.
        let playIndex = 0;
        for (const value of operations) {
            if (!ownsCurrentAuthority() || !this.host.view) return;
            const operation = this.host.record(value);
            if (!operation || String(operation.action).toLowerCase() !== 'play') continue;
            const cards = Array.isArray(operation.cards) ? operation.cards.map(Number) : [];
            if (cards.length === 0) continue;
            playIndex += 1;
            const actionKey = this.host.authorityActionKey(operation);
            // RoomSet snapshots are mutable runtime projections. While an older
            // live retained presentation is awaiting completion, the same object can
            // already contain the next committed play. That live play belongs to
            // presentPublicOperation (Hand_Cards -> Out_Card -> Table_Cards), so
            // history recovery must not manufacture it directly in Table_Cards.
            if (this.host.tableActionPresentations.has(actionKey)) {
                this.host.traceOutCards('liangshan-history-skip-live-presentation', {
                    operationId: String(operation.operationId ?? ''),
                    dataSeat: Number(operation.seat ?? operation.pos ?? operation.opPos ?? -1),
                });
                continue;
            }
            await this.appendTableCards({
                pos: Number(operation.seat ?? operation.pos ?? operation.opPos ?? -1),
                cardList: cards,
                operationId: String(operation.operationId ?? ''),
                playIndex,
            }, expectedLease, ownsReconciliation);
            // Reconnect history is complete after append. Seed the live ledger
            // gate so the next authority commit presents only genuinely new
            // operations through Out_Card instead of replaying restored hands.
            this.host.tableActionIds.add(actionKey);
        }
        if (!ownsCurrentAuthority() || !this.host.view) return;
        // Reconnect is a complete ledger projection. Remove groups that are not
        // present in the authoritative snapshot so old trick/round nodes cannot
        // survive an in-place refresh and appear beside the current hand.
        const authoritativeHandNames = new Set(operations
            .map((value) => this.host.record(value))
            .filter((operation) => operation && String(operation.action).toLowerCase() === 'play')
            .map((operation) => `Play_${String(operation?.operationId ?? '')}`));
        for (let slot = 0; slot < 4; slot += 1) {
            const path = `Players/Seat_${slot}/Card/Table_Cards`;
            const table = this.host.view.find(path);
            if (!table) continue;
            for (const hand of [...table.children]) {
                if (!hand.name.startsWith('Play_') || authoritativeHandNames.has(hand.name)) continue;
                hand.removeFromParent();
                hand.destroy();
            }
            this.host.view.visible(path, table.children.length > 0);
        }
        // Pass operations do not take ownership of the arrow. On reconnect the
        // ledger can end in one or more passes, so locate the last actual play
        // instead of assuming the final ledger entry contains cards.
        const latest = [...operations].reverse()
            .map((value) => this.host.record(value))
            .find((operation) => operation && String(operation.action).toLowerCase() === 'play');
        if (latest) {
            const dataSeat = Number(latest.seat ?? latest.pos ?? latest.opPos ?? -1);
            const slot = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
                .find((entry) => entry.dataSeat === dataSeat)?.physicalSlot;
            const operationId = String(latest.operationId ?? '');
            const hand = slot === undefined || !operationId ? null
                : this.host.view.find(`Players/Seat_${slot}/Card/Table_Cards/Play_${operationId}`);
            if (hand) this.showCurrentPlayArrow(hand, latest, true);
        }
    }

public showCurrentPlayArrow(target: Node, packet: Record<string, unknown>, claimLatest: boolean): void {
        const operationId = String(packet.operationId ?? packet.actionId ?? '');
        const playIndex = Number(packet.playIndex ?? 0);
        if (!operationId) return;
        if (claimLatest) {
            if (Number.isSafeInteger(playIndex) && playIndex > 0) {
                if (playIndex < this.host.currentPlayArrowIndex) return;
                this.host.currentPlayArrowIndex = playIndex;
            }
            this.host.currentPlayArrowOperationId = operationId;
        } else if (operationId !== this.host.currentPlayArrowOperationId) {
            return;
        }
        void this.host.currentPlayArrow?.showOver(target)
            .catch((error: unknown) => this.host.reportPresentationError(error, 'CURRENT_PLAY_ARROW', packet));
    }

public async clearActionSlot(parent: Node | null): Promise<void> {
        if (!parent || parent.children.length === 0) return;
        // Authority reconciliation can replace a seat's action in the same frame.
        // Fading the old cards exposed the empty parent and produced a flash.
        for (const child of parent.children) Tween.stopAllByTarget(child);
        this.host.cards.clear(parent);
    }

public setOutCardVisible(path: string, visible: boolean): void {
        const outCard = this.host.view?.find(path);
        if (!outCard) return;
        outCard.active = visible;
    }

public clearOutCardPlayCount(parent: Node | null): void {
        if (!parent) return;
        for (const card of parent.children) {
            for (const child of [...card.children]) {
                if (child.name === 'PlayCount' || child.name.startsWith('PlayCount_')) child.destroy();
            }
        }
    }

public endRoundPresentation(reason: string): Promise<void> {
        const identity = this.host.roundPresentation.currentIdentity();
        this.host.roundPresentation.end();
        console.info('[CommonRoomRoundPresentation]', {
            stage: 'END', reason, roomId: this.host.roomId(),
            roundNo: identity?.roundNo ?? 0,
            shuffleSequence: identity?.shuffleSequence ?? -1,
            stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            operationId: String(this.host.record(
                this.host.runtime.getRoomSet().GetRoomSetInfo()?.operationDeadline,
            )?.operationId ?? ''),
        });
        return this.clearRoundPresentationNodes();
    }

public clearRoundPresentationNodes(): Promise<void> {
        this.host.lastDealAnimationKey = '';
        const drain = this.host.retainedPlayedCardFlow?.cancelPendingForRoundBoundary()
            ?? Promise.resolve();
        this.clearPublicCards();
        this.host.animations?.clear();
        if (this.host.flyingOverlay?.isValid) this.host.flyingOverlay.destroy();
        this.host.flyingOverlay = null;
        this.host.ownCardFlightActive = false;
        this.host.ownCardFlight = Promise.resolve();
        this.host.latestPublicCardLanding = Promise.resolve();
        this.clearOwnLandingCards();
        this.clearTableCards();
        this.host.tableActionIds.clear();
        this.host.tableActionPresentations.clear();
        this.host.animatedOperationIds.clear();
        this.host.authorityActionsInitialized = false;
        this.host.remainingCards.clear();
        this.host.logic.ClearCardData();
        this.host.operations?.hide();
        this.host.hideClocks();
        this.host.clearDragSelection();
        this.host.resetPromptCycle();
        this.host.autoPassInFlight = false;
        this.host.autoHintTurnKey = '';
        this.host.playInFlight = false;
        this.host.keepOperationsVisibleDuringPlay = false;
        this.host.hintRequestedDuringPlay = false;
        this.host.playRequestScope = null;
        this.host.selectionAuthorityKey = '';
        return drain.catch((error: unknown) => {
            this.host.reportPresentationError(error, 'ROUND_PRESENTATION_DRAIN', {
                ...this.host.roundPresentation.currentIdentity(),
            });
        });
    }

public clearHandVisuals(reason: string): void {
        const current = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const diagnostic = {
            roomId: this.host.roomId(),
            stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            operationId: String(this.host.record(current.operationDeadline)?.operationId ?? ''),
            roundNo: Number(current.roundNo ?? current.setID ?? this.host.runtime.getRoom().GetRoomProperty('setID') ?? 0),
            phase: String(current.authorityPhase ?? ''),
            reason,
            authoritativeHandCount: Number(this.host.logic.GetHandCard()?.length ?? 0),
            visualHandCount: this.host.cardNodes.filter((card: Node) => card.isValid && card.active).length,
        };
        console.info('[CommonRoomHandClear]', diagnostic);
        const host = globalThis as typeof globalThis & { __PDK_LAST_HAND_CLEAR__?: unknown };
        host.__PDK_LAST_HAND_CLEAR__ = diagnostic;
        this.host.handRenderGeneration += 1;
        const parent = this.host.view?.find('Players/Seat_0/Card/Hand_Cards');
        this.host.cards.stopAll(true);
        if (parent) this.host.cards.clear(parent);
        this.host.cardNodes.length = 0;
        this.host.cardValues.length = 0;
        this.host.clearDragSelection();
        this.host.syncHandTouchArea();
    }

public clearCompletedRound(): void {
        this.host.completedRoundVisualsCleared = true;
        void this.endRoundPresentation('CONTINUE');
        this.clearHandVisuals('CONTINUE');
        this.host.competeDealerPhase = false;
        this.host.renderCompeteDealerControls();
        void this.host.renderHeads().catch((error: unknown) => this.host.report(error, '玩家状态刷新失败'));
        this.host.refresh();
    }

public applyAuthoritativeTurnBoundary(setInfo: Record<string, unknown>): void {
        const roomId = this.host.roomId();
        const stateVersion = Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const trickId = Number(setInfo.trickId ?? -1);
        const deadline = this.host.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        const selectionKey = `${roomId}:${trickId}:${turnSeat}:${operationId}`;
        const comparison = this.host.authorityComparison(setInfo);
        const trickReset = comparison.cards.length === 0 || comparison.type <= 0;
        if (selectionKey !== this.host.selectionAuthorityKey) {
            this.host.selectionAuthorityKey = selectionKey;
            this.host.logic.ChangeSelectCard([]);
            this.host.clearDragSelection();
            this.host.resetPromptCycle();
            // The user may preselect while another seat is acting. The following
            // hand reconciliation synchronizes Layout immediately, so an animated
            // deselect would be stopped halfway and its raised Y cached as the new
            // base. Reset synchronously before the new automatic hint is applied.
            this.host.cards.clearSelectionImmediately(this.host.cardNodes);
        }
        this.host.autoPassInFlight = false;
        if (trickReset) {
            this.host.logic.ClearCardData();
        }
        const submitted = this.host.playRequestScope;
        if (submitted && (submitted.roomId !== roomId || stateVersion > submitted.stateVersion
            || trickId !== submitted.trickId || operationId !== submitted.operationId)) {
            this.host.playInFlight = false;
            this.host.playRequestScope = null;
        }
        console.info('[CommonRoomTurnState]', {
            roomId, stateVersion, trickId, operationId,
            turnSeat,
            trickReset, tableOperationCount: Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations.length : 0,
            targetCards: [...(this.host.logic.lastCardList ?? [])].map(Number),
            selectedCards: [...(this.host.logic.GetSelectCard() ?? [])].map(Number),
            hintCount: this.host.hintCache.length,
            playInFlight: this.host.playInFlight,
        });
    }

public reconcileAuthorityPublicCards(packet: Record<string, unknown>): Promise<void> {
        const projectionGeneration = ++this.host.publicProjectionGeneration;
        const comparison = this.host.record(packet.comparisonState) ?? {};
        const seatPlays = Array.isArray(packet.seatPlayStates) ? packet.seatPlayStates : [];
        const trickId = Number(comparison.trickId ?? packet.trickId ?? -1);
        if (trickId >= 0) this.host.renderedTrickId = trickId;
        // Hint, Play and table presentation must share this one physical-card
        // comparison projection. Re-reading the upstream numeric enum here can
        // turn a visible JJ pair into a type-2 single target and make every
        // same-shape response disappear.
        const { cards: cardList, type: opType } = this.host.authorityComparison(packet);
        const dataSeat = Number(comparison.leadSeat ?? -1);
        const trickReset = cardList.length === 0 || opType <= 0 || dataSeat < 0;
        this.host.tracePublicProjection('RECONCILE', {
            operationId: String(comparison.operationId ?? ''),
            trickId,
            dataSeat,
            activeOpPos: this.host.activeOpPos,
            cardValues: cardList,
            opType,
            trickReset,
            projectionGeneration,
        });
        console.info('[PdkTableTransition]', {
            roomId: this.host.roomId(),
            playerId: this.host.runtime.getPlayerId(),
            operationId: String(comparison.operationId ?? this.host.record(packet.operationDeadline)?.operationId ?? ''),
            stateVersion: Number(comparison.stateVersion ?? this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            trickId,
            turnSeat: Number(packet.opPos ?? -1),
            leadSeat: dataSeat,
            cardCount: cardList.length,
            transition: trickReset ? 'TRICK_END' : this.host.runtime.arrangementEnabled() ? 'HISTORY_APPEND' : 'LAST_REPLACE',
        });
        if (trickReset) this.host.logic.ClearCardData();
        else this.host.logic.SetCardData(opType, cardList);
        this.host.resetPromptCycle();
        this.host.authorityActionsInitialized = true;
        if (!this.host.runtime.arrangementEnabled()) {
            if (trickReset) {
                // Authority may skip every responder and open the next trick in
                // the same snapshot. comparisonState is then empty, but its
                // ordered ledger still contains the winning lead. Project that
                // committed play first and start the two-second hold only after
                // all cards (including the local flight) have actually landed.
                const operations = Array.isArray(packet.tableOperations) ? packet.tableOperations : [];
                const latestPlay = [...operations].reverse().map((value) => this.host.record(value)).find((operation) =>
                    operation && String(operation.action).toLowerCase() === 'play'
                    && Array.isArray(operation.cards) && operation.cards.length > 0);
                const turnSeat = Number(packet.opPos ?? -1);
                const winningSeat = Number(latestPlay?.seat ?? latestPlay?.pos ?? latestPlay?.opPos ?? -1);
                if (latestPlay && winningSeat === turnSeat) {
                    const winningOperationId = String(latestPlay.operationId ?? '');
                    if (winningOperationId
                        && this.host.publicSeatOperationIds.get(winningSeat) === winningOperationId) {
                        this.clearCompletedTrickAfterHold(winningSeat);
                        return Promise.resolve();
                    }
                    const landing = this.rememberLatestPublicCardLanding(this.renderPublicOperation({
                        pos: winningSeat,
                        cardList: latestPlay.cards,
                        operationId: winningOperationId,
                        playIndex: Number(latestPlay.playIndex ?? 0),
                    }, projectionGeneration));
                    return landing.then(() => this.clearCompletedTrickAfterHold(winningSeat))
                        .catch((error: unknown) => this.host.report(error, '胜出牌停留显示失败'));
                }
                this.clearLatestPublicCards();
            } else {
                // An answered play remains on its author's seat while another
                // player decides whether to respond. Once the turn returns to
                // that author, their older play no longer belongs in the live
                // Out_Card slot; the current comparison still belongs to the
                // other seat. A completed, unbeatable trick uses the separate
                // two-second hold above.
                const turnSeat = Number(packet.opPos ?? -1);
                if (turnSeat >= 0 && turnSeat !== dataSeat
                    && this.host.publicSeatOperationIds.has(turnSeat)) {
                    this.clearPublicCardsForSeat(turnSeat, 'ANSWERED_PLAY_TURN_RETURNED');
                }
                // Each seat owns one live Out_Card slot for the current trick.
                // A response replaces only that same seat's previous slot; plays
                // from the other seats remain until their turn or trick clear.
                return this.rememberLatestPublicCardLanding(this.renderPublicOperation({
                    pos: dataSeat,
                    cardList,
                    operationId: String(comparison.operationId ?? ''),
                    playIndex: Number(comparison.playIndex ?? 0),
                }, projectionGeneration)).catch((error: unknown) => this.host.report(error, '桌面牌恢复失败'));
            }
            return Promise.resolve();
        }
        return this.restoreSeatPlayStates(seatPlays, projectionGeneration)
            .then(async () => {
                if (trickReset || projectionGeneration !== this.host.publicProjectionGeneration) return;
                // When an unbeatable play immediately returns ownership to its
                // author, the seat projection is intentionally skipped until its
                // two-second hold finishes. The comparison hand still owns the
                // exact visible group during that interval.
                const rendered = this.host.renderedActionIds.get(dataSeat);
                const matching = seatPlays.map((value) => this.host.record(value)).find((play) =>
                    Boolean(play) && Number(play?.seat) === dataSeat && Array.isArray(play?.cards)
                    && play?.cards.map(Number).join(',') === cardList.join(','));
                if (!matching || rendered !== this.host.authorityActionKey(matching)) {
                    await this.renderPublicOperation({
                        pos: dataSeat,
                        cardList,
                        operationId: String(matching?.operationId ?? ''),
                        playIndex: Number(matching?.playIndex ?? 0),
                    }, projectionGeneration);
                }
            })
            .catch((error: unknown) => this.host.report(error, '桌面牌恢复失败'));
    }

public async restoreSeatPlayStates(raw: unknown[], projectionGeneration: number): Promise<void> {
        if (!this.host.view) return;
        const lease = this.host.roundPresentation.lease();
        const incomingSeats = new Set<number>();
        // The server contract already contains exactly one complete play per seat.
        // Keep a defensive map so malformed duplicates cannot create two groups.
        const latestBySeat = new Map<number, unknown>();
        for (const value of raw) {
            const action = this.host.record(value);
            const seat = Number(action?.seat ?? -1);
            if (action && seat >= 0) latestBySeat.set(seat, value);
        }
        for (const value of latestBySeat.values()) {
            if (projectionGeneration !== this.host.publicProjectionGeneration) return;
            const action = this.host.record(value);
            if (!action) continue;
            const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
                .find((item) => item.dataSeat === Number(action.seat));
            if (!entry) continue;
            incomingSeats.add(entry.dataSeat);
            const operationId = String(action.operationId ?? '');
            const actionKey = this.host.authorityActionKey(action);
            if (entry.dataSeat === this.host.activeOpPos) {
                // lastActions may retain this seat's previous hand after its next
                // turn starts. Operation ownership wins over stale history.
                continue;
            }
            if (this.host.renderedActionIds.get(entry.dataSeat) === actionKey) continue;
            const seatRevision = this.claimPublicSeatRender(entry.dataSeat);
            // Do not publish renderedActionIds until the guarded presentation
            // has actually landed; a canceled restore must never suppress its successor.
            const animate = this.host.authorityActionsInitialized && !this.host.seenOperationIds.has(actionKey);
            this.host.seenOperationIds.add(actionKey);
            const path = `Players/Seat_${entry.physicalSlot}/Card/Out_Card`;
            await this.waitForPublicCardHold(entry.dataSeat);
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, lease, projectionGeneration,
            )) return;
            await this.clearActionSlot(this.host.view.find(path));
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, lease, projectionGeneration,
            )) return;
            this.host.view.visible(`Players/Seat_${entry.physicalSlot}/Tip/Pass`, false);
            const values = Array.isArray(action.cards) ? action.cards.map(Number) : [];
            if (animate) {
                const actionType = String(action.action) === 'pass' ? 1
                    : this.host.gameAudioOperationType(action.opCardType ?? action.opType ?? action.cardType ?? action.type);
                this.host.playGameOperation(entry.dataSeat, actionType, values);
                this.playOperationAnimationOnce(operationId || actionKey, actionType, entry.physicalSlot);
                if (actionType !== 1) void this.host.roomAudio?.play('chupai');
                const remaining = this.host.remainingCards.get(entry.dataSeat);
                if (operationId && remaining !== undefined && remaining > 0 && remaining <= 2
                    && !this.host.warnedOperationIds.has(operationId)) {
                    this.host.warnedOperationIds.add(operationId);
                    void this.host.roomAudio?.play('baojing', 250);
                }
            }
            if (String(action.action) === 'pass') {
                this.host.publicCardShownAt.delete(entry.dataSeat);
                this.host.view.visible(`Players/Seat_${entry.physicalSlot}/Tip/Pass`, true);
                this.host.renderedActionIds.set(entry.dataSeat, actionKey);
                continue;
            }
            const parent = this.host.view.find(path);
            // A remote play is one moving presentation too. Do not build the
            // destination copy underneath the flight or a large play appears twice.
            if (animate && entry.dataSeat !== this.host.clientSeat() && values.length > 0) {
                this.setOutCardVisible(path, false);
                await this.flyRemoteCards(entry.physicalSlot, values);
                if (!this.isPublicSeatRenderCurrent(
                    entry.dataSeat, seatRevision, lease, projectionGeneration,
                )) return;
            }
            this.setOutCardVisible(path, values.length > 0);
            if (parent) for (const value of values) {
                const card = await this.host.cards.create(parent, value);
                if (!parent.isValid || !this.isPublicSeatRenderCurrent(
                    entry.dataSeat, seatRevision, lease, projectionGeneration,
                )) {
                    if (card.isValid) card.destroy();
                    return;
                }
            }
            this.updateActionCardLayout(parent, {
                dataSeat: entry.dataSeat,
                physicalSlot: entry.physicalSlot,
                operationId,
                cardValues: values,
            });
            this.clearOutCardPlayCount(parent);
            if (!this.isPublicSeatRenderCurrent(
                entry.dataSeat, seatRevision, lease, projectionGeneration,
            )) return;
            this.host.renderedActionIds.set(entry.dataSeat, actionKey);
            if (values.length > 0) {
                this.markPublicCardsShown(entry.dataSeat);
            }
        }
        if (this.host.authorityActionsInitialized) {
            for (const [seat] of [...this.host.renderedActionIds]) {
                if (incomingSeats.has(seat)) continue;
                // Missing history does not own visual cleanup. The seat keeps its
                // last hand until Authority gives that same seat the next turn.
                this.host.renderedActionIds.delete(seat);
            }
        }
        this.host.authorityActionsInitialized = true;
    }

public updateActionCardLayout(parent: Node | null, context?: {
        dataSeat: number;
        physicalSlot: number;
        operationId: string;
        cardValues: readonly number[];
    }): void {
        // Newly created and reparented cards all start at the prefab origin. Force
        // the authored Out_Card Layout in the same frame so a multi-card play does
        // not appear as only its topmost/last card on another client.
        const layout = parent?.getComponent(Layout);
        if (layout?.enabled) layout.updateLayout();
        if (!parent) return;
        const cardNodes = parent.children.filter((child) => child.name !== 'PlayCount');
        if (cardNodes.length <= 1) return;
        // updateLayout() is not a reliable synchronous boundary for nodes that
        // were inactive during remote flight. Apply the authored horizontal
        // geometry explicitly so the authoritative array is visible this frame.
        const parentTransform = parent.getComponent(UITransform);
        const firstTransform = cardNodes[0]?.getComponent(UITransform);
        const cardWidth = Math.max(firstTransform?.contentSize.width ?? 0, OUT_CARD_FALLBACK_WIDTH);
        const cardHeight = firstTransform?.contentSize.height ?? 0;
        const step = cardWidth + (layout?.spacingX ?? 0);
        // updateLayout() above can appear correct for the current frame, but an
        // enabled Layout runs again during the engine's following layout pass and
        // overwrites these authoritative positions. That delayed rewrite is why a
        // complete compound play briefly looks right after refresh and later
        // collapses to its topmost attachment card. Out_Card is populated only by
        // this controller, so freeze its automatic component before publishing the
        // explicit geometry below; every subsequent play is arranged here again.
        if (layout) layout.enabled = false;
        if (parentTransform && cardWidth > 0) {
            const totalWidth = cardWidth + (cardNodes.length - 1) * Math.abs(step);
            parentTransform.setContentSize(totalWidth, Math.max(parentTransform.contentSize.height, cardHeight));
            const rightToLeft = Number(layout?.horizontalDirection ?? 0) === 1;
            // Out_Card's authored node position is the visual centre of a play.
            // Its UITransform anchor describes the container bounds; it must not
            // shift child coordinates. Using `-anchorX * totalWidth` pushed every
            // card of right-anchored remote seats far to the left, leaving only
            // the final attachment inside the viewport. Centre the complete hand
            // around the authored seat position for every physical slot.
            const firstCenter = -((cardNodes.length - 1) * step) / 2;
            cardNodes.forEach((card, childIndex) => {
                const index = rightToLeft ? cardNodes.length - 1 - childIndex : childIndex;
                card.setPosition(firstCenter + index * step, card.position.y, card.position.z);
            });
        }
        const layoutSnapshot = (stage: string): void => {
            // Reconnect can replace this complete Out_Card group before the
            // diagnostic's next-frame/100ms callbacks run. Never dereference a
            // destroyed Cocos proxy retained by the old closure.
            if (!parent.isValid) return;
            const liveCards = cardNodes.filter((card) => card?.isValid && card.parent === parent);
            this.host.traceOutCards(stage, {
                dataSeat: context?.dataSeat ?? -1,
                physicalSlot: context?.physicalSlot ?? -1,
                operationId: context?.operationId ?? '',
                cardValues: [...(context?.cardValues ?? [])],
                layoutEnabled: layout?.isValid ? layout.enabled : null,
                parentActive: parent.activeInHierarchy,
                parentWidth: parentTransform?.isValid ? parentTransform.contentSize.width : null,
                childCount: liveCards.length,
                childPositions: liveCards.map((card) => ({
                    name: card.name,
                    active: card.activeInHierarchy,
                    x: card.position.x,
                    y: card.position.y,
                })),
            });
        };
        layoutSnapshot('layout-now');
        globalThis.setTimeout(() => {
            if (parent.isValid) layoutSnapshot('layout-next-frame');
        }, 0);
        globalThis.setTimeout(() => {
            if (parent.isValid) layoutSnapshot('layout-after-100ms');
        }, 100);
        const currentCards = cardNodes.filter((card) => card?.isValid && card.parent === parent);
        const distinctX = new Set(currentCards.map((card) => Math.round(card.position.x * 100) / 100));
        if (distinctX.size > 1) return;
        console.error('[CommonRoomOutCardLayout]', {
            roomId: this.host.roomId(),
            stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
            operationId: context?.operationId ?? '',
            dataSeat: context?.dataSeat ?? -1,
            physicalSlot: context?.physicalSlot ?? -1,
            cardValues: [...(context?.cardValues ?? [])],
            cardCount: currentCards.length,
            parentActive: parent.activeInHierarchy,
            layoutEnabled: Boolean(layout?.enabled),
            positions: currentCards.map((card) => ({ x: card.position.x, y: card.position.y })),
            reason: 'authoritative out-card nodes remained overlapped after layout',
        });
    }

public async flyRemoteCards(physicalSlot: number, values: readonly number[]): Promise<void> {
        const root = this.flyingCardOverlay();
        const source = this.host.view?.find(`Players/Seat_${physicalSlot}/Head`);
        const target = this.host.view?.find(`Players/Seat_${physicalSlot}/Card/Out_Card`);
        const rootTransform = root?.getComponent(UITransform);
        const sourceTransform = source?.getComponent(UITransform);
        const targetTransform = target?.getComponent(UITransform);
        if (!root || !rootTransform || !sourceTransform || !targetTransform) return;
        const start = rootTransform.convertToNodeSpaceAR(sourceTransform.convertToWorldSpaceAR(Vec3.ZERO));
        const end = rootTransform.convertToNodeSpaceAR(targetTransform.convertToWorldSpaceAR(Vec3.ZERO));
        const nodes = await Promise.all(values.map((value) => this.host.cards.create(root, value)));
        await Promise.all(nodes.map((card, index) => new Promise<void>((resolve) => {
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                if (card.isValid) card.destroy();
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, 350);
            card.setPosition(start);
            const spread = (index - (nodes.length - 1) / 2) * 18;
            tween(card).to(0.19, {
                position: new Vec3(end.x + spread, end.y, end.z),
                scale: new Vec3(0.48, 0.48, 1),
            }, { easing: 'quadOut' }).call(finish).start();
        })));
    }

public playOperationAnimationOnce(operationId: string, opType: number, physicalSlot: number): void {
        if (!operationId || opType <= 1 || this.host.animatedOperationIds.has(operationId)) return;
        this.host.animatedOperationIds.add(operationId);
        const animation = this.host.animations?.playOperation(opType, physicalSlot, {
            roomId: this.host.roomId(),
            playerId: this.host.runtime.getPlayerId(),
            operationId,
            stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
        })
            .catch((error: unknown) => this.host.report(error, '牌型动画加载失败'));
        if (animation) this.host.trackPresentation(animation);
    }

public buildCanonicalHandCompactionPlan(
        cards: readonly Node[],
        starts: ReadonlyMap<Node, Vec3>,
    ): Map<Node, Vec3> {
        const targets = new Map<Node, Vec3>();
        const parent = this.host.view?.find('Players/Seat_0/Card/Hand_Cards');
        const layout = parent?.getComponent(Layout);
        if (!parent || !layout) {
            for (const card of cards) {
                const start = starts.get(card);
                if (start) targets.set(card, this.host.cards.canonicalLayoutBase(card, start));
            }
            return targets;
        }
        // Layout is the sole authority for horizontal hand slots. Recalculate it
        // after the played nodes have been detached, capture the canonical slots,
        // then restore the visual starts so the compaction can animate normally.
        layout.enabled = true;
        layout.updateLayout();
        for (const card of cards) {
            if (!card.isValid) continue;
            targets.set(card, this.host.cards.canonicalLayoutBase(card, card.position));
        }
        layout.enabled = false;
        for (const card of cards) {
            const start = starts.get(card);
            if (card.isValid && start) card.setPosition(start);
        }
        return targets;
    }

public compactVisibleHand(targets: ReadonlyMap<Node, Vec3>): Promise<void> {
        const visible = this.host.cardNodes.filter((card: Node) => card.isValid && card.active);
        return Promise.all(visible.map((card: Node) => {
            const target = targets.get(card);
            if (!target) return Promise.resolve();
            return this.host.cards.moveBase(card, target, HAND_COMPACT_DURATION_SECONDS);
        })).then(() => undefined);
    }

public markPublicCardsShown(dataSeat: number): void {
        const timer = this.host.publicCardClearTimers.get(dataSeat);
        if (timer) globalThis.clearTimeout(timer);
        this.host.publicCardClearTimers.delete(dataSeat);
        this.host.publicCardShownAt.set(dataSeat, Date.now());
    }

public claimPublicSeatRender(dataSeat: number): number {
        const revision = (this.host.publicSeatRenderRevisions.get(dataSeat) ?? 0) + 1;
        this.host.publicSeatRenderRevisions.set(dataSeat, revision);
        return revision;
    }

public isPublicSeatRenderCurrent(
        dataSeat: number,
        seatRevision: number,
        lease: PdkRoundPresentationLease,
        expectedProjectionGeneration?: number,
    ): boolean {
        const hasView = Boolean(this.host.view);
        const roundCurrent = this.host.roundPresentation.isCurrent(lease);
        const revisionCurrent = this.host.publicSeatRenderRevisions.get(dataSeat) === seatRevision;
        const projectionCurrent = expectedProjectionGeneration === undefined
            || expectedProjectionGeneration === this.host.publicProjectionGeneration;
        const current = hasView && roundCurrent && revisionCurrent && projectionCurrent;
        if (!current) {
            this.host.tracePublicProjection('RENDER_CANCELLED', {
                dataSeat,
                hasView,
                roundCurrent,
                revisionCurrent,
                projectionCurrent,
                seatRevision,
                currentSeatRevision: this.host.publicSeatRenderRevisions.get(dataSeat) ?? null,
                expectedProjectionGeneration: expectedProjectionGeneration ?? null,
                currentProjectionGeneration: this.host.publicProjectionGeneration,
                leaseRevision: lease.revision,
                currentLeaseRevision: this.host.roundPresentation.lease().revision,
            });
        }
        return current;
    }

public waitForPublicCardHold(dataSeat: number): Promise<void> {
        const shownAt = this.host.publicCardShownAt.get(dataSeat);
        if (shownAt === undefined) return Promise.resolve();
        const remaining = COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt);
        if (remaining <= 0) return Promise.resolve();
        return new Promise((resolve) => globalThis.setTimeout(resolve, remaining));
    }

public clearPublicCardsForTurn(dataSeat: number): void {
        if (!Number.isInteger(dataSeat) || dataSeat < 0 || !this.host.view) return;
        const existingTimer = this.host.publicCardClearTimers.get(dataSeat);
        if (existingTimer) globalThis.clearTimeout(existingTimer);
        const shownAt = this.host.publicCardShownAt.get(dataSeat);
        const remaining = shownAt === undefined ? 0 : COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt);
        if (remaining <= 0) {
            this.clearPublicCardsForSeat(dataSeat, 'NEXT_TURN_HOLD_ELAPSED');
            return;
        }
        const timer = globalThis.setTimeout(() => {
            this.host.publicCardClearTimers.delete(dataSeat);
            this.clearPublicCardsForSeat(dataSeat, 'NEXT_TURN_HOLD_TIMER');
        }, remaining) as unknown as number;
        this.host.publicCardClearTimers.set(dataSeat, timer);
    }

public clearCompletedTrickAfterHold(winningSeat: number): void {
        if (!Number.isInteger(winningSeat) || winningSeat < 0 || !this.host.view) return;
        const existingTimer = this.host.publicCardClearTimers.get(winningSeat);
        if (existingTimer) globalThis.clearTimeout(existingTimer);
        const shownAt = this.host.publicCardShownAt.get(winningSeat);
        const remaining = shownAt === undefined ? COMPLETED_TRICK_HOLD_MS
            : Math.max(0, COMPLETED_TRICK_HOLD_MS - (Date.now() - shownAt));
        const clearTrick = (): void => {
            this.host.publicCardClearTimers.delete(winningSeat);
            this.clearLatestPublicCards();
        };
        if (remaining <= 0) clearTrick();
        else this.host.publicCardClearTimers.set(winningSeat,
            globalThis.setTimeout(clearTrick, remaining) as unknown as number);
    }

public clearPublicCardsForSeat(dataSeat: number, reason = 'UNSPECIFIED'): void {
        this.claimPublicSeatRender(dataSeat);
        const timer = this.host.publicCardClearTimers.get(dataSeat);
        const operationId = this.host.publicSeatOperationIds.get(dataSeat) ?? '';
        if (timer) globalThis.clearTimeout(timer);
        this.host.publicCardClearTimers.delete(dataSeat);
        this.host.publicCardShownAt.delete(dataSeat);
        this.host.publicSeatOperationIds.delete(dataSeat);
        const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
            .find((item) => item.dataSeat === dataSeat);
        if (!entry || !this.host.view) return;
        const path = `Players/Seat_${entry.physicalSlot}/Card/Out_Card`;
        const parent = this.host.view.find(path);
        this.host.tracePublicProjection('CLEAR_SEAT', {
            dataSeat,
            physicalSlot: entry.physicalSlot,
            operationId,
            reason,
            childCount: parent?.children.filter((child: Node) => child.name !== 'PlayCount').length ?? 0,
        });
        this.host.cards.clear(parent);
        this.setOutCardVisible(path, false);
        this.host.view.visible(`Players/Seat_${entry.physicalSlot}/Tip/Pass`, false);
    }

public clearLatestPublicCards(): void {
        for (const entry of createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())) {
            this.clearPublicCardsForSeat(entry.dataSeat, 'TRICK_CLEAR');
        }
    }

public cancelPublicCardClearTimers(): void {
        for (const timer of this.host.publicCardClearTimers.values()) globalThis.clearTimeout(timer);
        this.host.publicCardClearTimers.clear();
    }

public prepareOwnFlightCards(sourceCards: readonly Node[]): Node[] {
        const root = this.flyingCardOverlay();
        const rootTransform = root?.getComponent(UITransform);
        if (!root || !rootTransform) return [];
        return sourceCards.flatMap((source) => {
            if (!source.isValid) return [];
            const sourceTransform = source.getComponent(UITransform);
            if (!sourceTransform) return [];
            const sourceWorldScale = source.worldScale.clone();
            const flying = instantiate(source);
            // The source may currently be raised/previewed. Animated copies must
            // contain only the card face, never the selection or disabled shadow.
            const presenter = flying.getComponent(Poker_Card_Presenter);
            presenter?.setPdkVisualState(false, false);
            flying.parent = root;
            flying.setWorldPosition(sourceTransform.convertToWorldSpaceAR(Vec3.ZERO));
            const rootScale = root.worldScale;
            flying.setScale(
                sourceWorldScale.x / (rootScale.x || 1),
                sourceWorldScale.y / (rootScale.y || 1),
                sourceWorldScale.z / (rootScale.z || 1),
            );
            flying.active = false;
            return [flying];
        });
    }

public async flyCardsToOwnAction(flyingCards: readonly Node[]): Promise<void> {
        const root = this.host.flyingOverlay;
        const target = this.host.view?.find('Players/Seat_0/Card/Out_Card');
        const rootTransform = root?.getComponent(UITransform);
        const targetTransform = target?.getComponent(UITransform);
        if (!root || !rootTransform || !target || !targetTransform) {
            for (const card of flyingCards) if (card.isValid) card.destroy();
            return;
        }
        const rootScale = root.worldScale;
        const targetWorldScale = target.worldScale;
        const targetScale = new Vec3(
            targetWorldScale.x / (rootScale.x || 1),
            targetWorldScale.y / (rootScale.y || 1),
            targetWorldScale.z / (rootScale.z || 1),
        );
        // Each clone flies directly to its final authored Out_Card position.
        // Interpolating every card from its hand slot to that exact point makes
        // the gaps close continuously during the flight. Using a temporary
        // fixed spread here would first squeeze the cards into a stack and then
        // expand them again when updateActionCardLayout() runs after landing.
        const layout = target.getComponent(Layout);
        const cardWidth = Math.max(
            flyingCards[0]?.getComponent(UITransform)?.contentSize.width ?? 0,
            OUT_CARD_FALLBACK_WIDTH,
        );
        const step = cardWidth + (layout?.spacingX ?? 0);
        const firstCenter = -((flyingCards.length - 1) * step) / 2;
        const rightToLeft = Number(layout?.horizontalDirection ?? 0) === 1;
        const destinations = flyingCards.map((_card, childIndex) => {
            const index = rightToLeft ? flyingCards.length - 1 - childIndex : childIndex;
            const targetWorld = targetTransform.convertToWorldSpaceAR(
                new Vec3(firstCenter + index * step, 0, 0),
            );
            return rootTransform.convertToNodeSpaceAR(targetWorld);
        });
        await Promise.all(flyingCards.map((flying, index) => new Promise<void>((resolve) => {
            if (!flying.isValid) { resolve(); return; }
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, OWN_CARD_FLIGHT_DURATION_SECONDS * 1000 + 250);
            flying.active = true;
            Tween.stopAllByTarget(flying);
            tween(flying).to(OWN_CARD_FLIGHT_DURATION_SECONDS, {
                position: destinations[index],
                scale: targetScale,
            }, { easing: 'quadOut' }).call(finish).start();
        })));
    }

public clearOwnLandingCards(): void {
        for (const card of this.host.ownLandingCards) {
            if (!card.isValid) continue;
            Tween.stopAllByTarget(card);
            card.removeFromParent();
            card.destroy();
        }
        this.host.ownLandingCards.length = 0;
    }

public flyingCardOverlay(): Node | null {
        const roomRoot = this.host.view?.root;
        if (!roomRoot) return null;
        if (this.host.flyingOverlay?.isValid) return this.host.flyingOverlay;
        const overlay = this.host.cards.createFlyingOverlay(roomRoot);
        this.host.flyingOverlay = overlay;
        return overlay;
    }

public hasUnretainedLatestAuthorityPlay(setInfo: Record<string, unknown>): boolean {
        if (!this.host.runtime.arrangementEnabled() || !this.host.view) return false;
        const operations = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        for (let index = operations.length - 1; index >= 0; index -= 1) {
            const action = this.host.record(operations[index]);
            if (!action) continue;
            const cards = Array.isArray(action.cardList) ? action.cardList.map(Number) : [];
            if (cards.length === 0) continue;
            const operationId = String(action.operationId ?? action.id ?? '');
            const dataSeat = Number(action.seat ?? action.pos ?? action.opPos ?? -1);
            if (!operationId || dataSeat < 0) return false;
            const entry = createSeatEntries(this.host.authoritativePlayerCount(), this.host.clientSeat())
                .find((item) => item.dataSeat === dataSeat);
            if (!entry) return false;
            const tableCards = this.host.view.find(`Players/Seat_${entry.physicalSlot}/Card/Table_Cards`);
            return !tableCards?.children.some((child: Node) => child.name === `Play_${operationId}`);
        }
        return false;
    }

public async advanceLatestAuthorityPlayToRetained(setInfo: Record<string, unknown>): Promise<void> {
        const startedAt = Date.now();
        while (this.hasUnretainedLatestAuthorityPlay(setInfo)) {
            // Only release a hold that already belongs to the preceding play.
            // Never arm a future release: doing so makes the automatic final
            // hand skip its own Out_Card hold and flash into Table_Cards.
            this.host.retainedPlayedCardFlow?.flushPendingHolds();
            await Promise.resolve();
            await this.host.retainedPlayedCardFlow?.waitForPendingTransfers();
            if (!this.hasUnretainedLatestAuthorityPlay(setInfo)) break;
            if (Date.now() - startedAt >= 3000) {
                this.host.traceOutCards('last-hand-preceding-transfer-timeout', {
                    waitedMs: Date.now() - startedAt,
                });
                break;
            }
            await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 16));
        }
        // Creating Play_<operationId> happens at transfer start. Drain once
        // more so the cards have stopped at Table_Cards before final-hand flight.
        await this.host.retainedPlayedCardFlow?.waitForPendingTransfers();
    }
}
