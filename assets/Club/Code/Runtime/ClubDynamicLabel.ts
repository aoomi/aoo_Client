import { Label } from 'cc';

export interface ClubPlayerIdentity {
    pid?: number | string;
    displayId?: number | string;
}

/** pid is an internal account key; only displayId may be shown as the player's public ID. */
export function clubPlayerDisplayId(player: ClubPlayerIdentity | null | undefined, fallback: number | string = ''): string {
    return String(player?.displayId ?? player?.pid ?? fallback);
}

/** Dynamic identifiers must remain single-line and fully visible inside authored columns. */
export function setClubDynamicLabel(label: Label | null, semanticName: string, value: string): void {
    if (!label) return;
    label.string = value;
    if (/(?:^|_)(?:id|pid)(?:$|_)|promoterId|roomName|upname|lb_user/i.test(semanticName)
        || /(?:^|[（(])ID[:：]?\d/i.test(value)) {
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
    }
}
