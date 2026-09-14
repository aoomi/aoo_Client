export const HZMJ_OPERATION = Object.freeze({
    HU: 1, PENG: 2, GANG: 3, JIE_GANG: 4, AN_GANG: 5, CHI: 6,
    OUT: 7, PASS: 8, QIANG_GANG_HU: 9, BU_HUA: 10, SQ_PASS: 16,
});

const operationByName = new Map<string, number>([
    ['OpType_Hu', 1], ['OpType_Peng', 2], ['OpType_Gang', 3], ['OpType_JieGang', 4],
    ['OpType_AnGang', 5], ['OpType_Chi', 6], ['OpType_Out', 7], ['OpType_Pass', 8],
    ['OpType_QiangGangHu', 9], ['OpType_BuHua', 10], ['OpType_SQPass', 16],
]);

export function normalizeHzmjOperation(value: unknown): number {
    if (typeof value === 'string' && operationByName.has(value)) {
        return operationByName.get(value) ?? 0;
    }
    const operation = Number(value);
    return Number.isSafeInteger(operation) && operation > 0 ? operation : 0;
}

export function operationsForPosition(round: any, clientPos: number): number[] {
    if (!round || typeof round !== 'object' || !Number.isSafeInteger(clientPos) || clientPos < 0) return [];
    const positions = Array.isArray(round.opPosList) ? round.opPosList : [];
    const allowed = new Set<number>();
    for (const candidate of positions) {
        if (!candidate || typeof candidate !== 'object') continue;
        const target = Number(candidate.waitOpPos ?? candidate.pos ?? candidate.posID);
        if (target !== clientPos) continue;
        const operations = Array.isArray(candidate.opList) ? candidate.opList : [candidate.opType];
        for (const value of operations) {
            const operation = normalizeHzmjOperation(value);
            if (operation) allowed.add(operation);
        }
    }
    return [...allowed];
}

export function passOperation(operations: readonly number[]): number {
    return operations.includes(HZMJ_OPERATION.SQ_PASS)
        ? HZMJ_OPERATION.SQ_PASS
        : operations.includes(HZMJ_OPERATION.PASS) ? HZMJ_OPERATION.PASS : 0;
}
