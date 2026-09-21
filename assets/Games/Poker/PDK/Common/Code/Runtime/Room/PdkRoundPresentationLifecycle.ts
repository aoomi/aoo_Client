export interface PdkRoundPresentationIdentity {
    roomId: number;
    roundNo: number;
    shuffleSequence: number;
    dealIdentity: string;
}

export interface PdkRoundPresentationLease {
    readonly revision: number;
    readonly key: string;
}

export interface PdkRoundPresentationAcceptance {
    readonly accepted: boolean;
    readonly changed: boolean;
    readonly previousKey: string;
    readonly identity: PdkRoundPresentationIdentity;
    readonly lease: PdkRoundPresentationLease;
    readonly rejection: 'STALE_DEAL' | 'STALE_ROUND' | '';
}

/**
 * Single owner for the lifetime of every public card, retained hand, arrow and
 * play-count badge. Async presentation code receives an immutable lease; ending
 * or replacing the round invalidates every outstanding lease synchronously.
 */
export class PdkRoundPresentationLifecycle {
    private revision = 0;
    private identity: PdkRoundPresentationIdentity | null = null;
    private active = false;

    public accept(next: PdkRoundPresentationIdentity): PdkRoundPresentationAcceptance {
        const current = this.identity;
        const previousKey = current ? this.keyOf(current) : '';
        const nextKey = this.keyOf(next);
        if (current && next.shuffleSequence >= 0 && current.shuffleSequence >= 0
            && next.shuffleSequence < current.shuffleSequence) {
            return this.rejected(next, previousKey, 'STALE_DEAL');
        }
        const hasDealIdentity = next.shuffleSequence >= 0 || Boolean(next.dealIdentity);
        if (current && !hasDealIdentity && next.roundNo < current.roundNo) {
            return this.rejected(next, previousKey, 'STALE_ROUND');
        }
        const changed = Boolean(current) && nextKey !== previousKey;
        if (!current || changed) {
            this.revision += 1;
            this.identity = next;
            this.active = true;
        }
        return {
            accepted: true,
            changed,
            previousKey,
            identity: this.identity ?? next,
            lease: this.lease(),
            rejection: '',
        };
    }

    public end(): PdkRoundPresentationLease {
        this.revision += 1;
        this.active = false;
        return this.lease();
    }

    public lease(): PdkRoundPresentationLease {
        return Object.freeze({
            revision: this.revision,
            key: this.identity ? this.keyOf(this.identity) : '',
        });
    }

    public isCurrent(lease: PdkRoundPresentationLease): boolean {
        return this.active && lease.revision === this.revision
            && lease.key === (this.identity ? this.keyOf(this.identity) : '');
    }

    public currentIdentity(): PdkRoundPresentationIdentity | null {
        return this.identity ? { ...this.identity } : null;
    }

    private rejected(
        next: PdkRoundPresentationIdentity,
        previousKey: string,
        rejection: PdkRoundPresentationAcceptance['rejection'],
    ): PdkRoundPresentationAcceptance {
        return {
            accepted: false,
            changed: false,
            previousKey,
            identity: next,
            lease: this.lease(),
            rejection,
        };
    }

    private keyOf(identity: PdkRoundPresentationIdentity): string {
        const deal = identity.dealIdentity || (identity.shuffleSequence >= 0
            ? String(identity.shuffleSequence) : 'legacy');
        return `${identity.roomId}:${identity.roundNo}:${deal}`;
    }
}
