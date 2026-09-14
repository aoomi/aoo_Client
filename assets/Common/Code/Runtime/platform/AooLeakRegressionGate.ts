export interface AooLeakSample { heapBytes: number; directBytes: number; textureCount: number; listenerCount: number; }
export interface AooLeakBudget extends AooLeakSample { warmupCycles: number; measuredCycles: number; }
/** Fixed-cycle client leak gate. Sample after every complete open/close scene cycle. */
export class AooLeakRegressionGate {
    public static assertStable(samples: readonly AooLeakSample[], budget: AooLeakBudget): void {
        const measured = samples.slice(budget.warmupCycles);
        if (measured.length !== budget.measuredCycles || measured.length < 2) throw new Error('Leak regression gate received an incomplete fixed-cycle sample set');
        const first = measured[0]; const last = measured[measured.length - 1];
        const growth: AooLeakSample = { heapBytes: last.heapBytes - first.heapBytes, directBytes: last.directBytes - first.directBytes, textureCount: last.textureCount - first.textureCount, listenerCount: last.listenerCount - first.listenerCount };
        const failures = (Object.keys(growth) as Array<keyof AooLeakSample>).filter((key) => growth[key] > budget[key]);
        if (failures.length > 0) throw new Error(`Leak regression budget exceeded: ${failures.join(',')}`);
    }
}
