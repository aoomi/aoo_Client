/** 亲友圈与联盟业务的唯一展示词汇；协议兼容键仍使用既有字段名。 */
export const ClubBusinessTerms = Object.freeze({
    Alliance: '联盟',
    AllianceOwner: '盟主',
    ClubOwner: '圈主',
    Ally: '盟友',
    AllianceManager: '联盟管理',
    ClubManager: '圈管理',
    Partner: '合伙人',
    Captain: '队长',
    Member: '成员',
});

/** 与线上 unionPostType 数值协议保持一致。 */
export enum AllianceRole {
    Member = 0,
    Ally = 1,
    AllianceManager = 2,
    AllianceOwner = 3,
}

const LegacyTermAliases: Readonly<Record<string, string>> = Object.freeze({
    赛事: ClubBusinessTerms.Alliance,
    赛事管理员: ClubBusinessTerms.AllianceManager,
    圈管理: ClubBusinessTerms.ClubManager,
    推广员: ClubBusinessTerms.Captain,
    玩家: ClubBusinessTerms.Member,
});

/** 仅用于读取旧检索词；新展示和新写入必须使用 ClubBusinessTerms。 */
export function NormalizeClubBusinessTerm(value: string): string {
    return LegacyTermAliases[value] ?? value;
}

export function AllianceRoleName(value: number): string {
    switch (value) {
        case AllianceRole.AllianceOwner: return ClubBusinessTerms.AllianceOwner;
        case AllianceRole.AllianceManager: return ClubBusinessTerms.AllianceManager;
        case AllianceRole.Ally: return ClubBusinessTerms.Ally;
        default: return ClubBusinessTerms.Member;
    }
}
