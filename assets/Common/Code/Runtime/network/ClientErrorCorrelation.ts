export interface ClientCorrelation {
    readonly traceId: string;
    readonly requestId: string;
    readonly msgId: string;
    readonly roomId?: string;
}

type Correlated = Error & { aooCorrelation?: ClientCorrelation };

/** Preserves the wire correlation IDs on async client failures. */
export class ClientErrorCorrelation {
    private static installed = false;

    public static enrich(reason: unknown, correlation: ClientCorrelation): Error {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        Object.defineProperty(error, 'aooCorrelation', {
            value: Object.freeze({ ...correlation }), configurable: true, enumerable: false,
        });
        return error;
    }

    public static installGlobalHandlers(): void {
        if (this.installed || typeof globalThis.addEventListener !== 'function') return;
        this.installed = true;
        globalThis.addEventListener('error', (event: Event) => {
            const value = event as ErrorEvent;
            this.report(value.error ?? new Error(value.message), 'window.error');
        });
        globalThis.addEventListener('unhandledrejection', (event: Event) => {
            this.report((event as PromiseRejectionEvent).reason, 'window.unhandledrejection');
        });
    }

    private static report(reason: unknown, source: string): void {
        const error = reason instanceof Error ? reason as Correlated : new Error(String(reason)) as Correlated;
        const correlation = error.aooCorrelation;
        console.error('[AooClientError]', {
            source, name: error.name, message: error.message,
            traceId: correlation?.traceId ?? 'unassigned',
            requestId: correlation?.requestId ?? 'unassigned',
            msgId: correlation?.msgId ?? 'unassigned', roomId: correlation?.roomId ?? 'unassigned',
        }, error);
    }
}
