export const UNION_TOTAL_SCORE_MIN = 0;
export const UNION_TOTAL_SCORE_MAX = 999_999_999;
export const UNION_TOTAL_SCORE_ERROR = `联盟总分必须是0到${UNION_TOTAL_SCORE_MAX}的整数`;

export function parseUnionTotalScore(value: string): number | null {
    if (!/^\d+$/.test(value)) return null;
    const score = Number(value);
    return Number.isSafeInteger(score) && score >= UNION_TOTAL_SCORE_MIN && score <= UNION_TOTAL_SCORE_MAX ? score : null;
}
