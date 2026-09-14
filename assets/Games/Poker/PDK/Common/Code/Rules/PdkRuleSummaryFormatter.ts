export interface PdkRuleOption { readonly value: unknown; readonly label: string; readonly disabled?: boolean; readonly order?: number; }
export interface PdkRuleField { readonly key: string; readonly label?: string; readonly visible?: boolean; readonly disabled?: boolean; readonly order?: number; readonly options?: readonly PdkRuleOption[]; }

/** Formats only published, player-visible selections, in the create-room schema order. */
export function formatPdkRuleSummary(snapshot: unknown, schema: unknown): string {
    const values = record(snapshot);
    const fields = Array.isArray(schema) ? schema.filter(isField)
        .filter((field) => field.visible !== false && !field.disabled)
        .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0)) : [];
    const labels: string[] = [];
    for (const field of fields) {
        const selected = Array.isArray(values[field.key]) ? values[field.key] as unknown[] : [values[field.key]];
        const options = Array.isArray(field.options) ? [...field.options]
            .filter((option) => !option.disabled)
            .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0)) : [];
        for (const value of selected) {
            if (value === undefined || value === null || value === '' || value === false) continue;
            const option = options.find((candidate) => String(candidate.value) === String(value));
            const fallback = options.length > 0 ? '' : value === true
                ? String(field.label ?? '').trim()
                : field.label ? `${String(field.label).trim()}:${String(value).trim()}` : String(value).trim();
            const label = String(option?.label ?? fallback).trim();
            if (label && !labels.includes(label)) labels.push(label);
        }
    }
    if (labels.length > 0) return labels.join(' ');
    const recoverable = [numberLabel(values.playerCount, '人'), numberLabel(values.roundCount ?? values.setCount, '局')]
        .filter(Boolean);
    return recoverable.length > 0 ? recoverable.join(' ') : '玩法信息不完整';
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
}
function isField(value: unknown): value is PdkRuleField {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
        && typeof (value as Record<string, unknown>).key === 'string');
}
function numberLabel(value: unknown, suffix: string): string {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? `${number}${suffix}` : '';
}
