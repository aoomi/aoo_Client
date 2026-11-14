import { director, find, Node } from 'cc';
import type { LegacySubgameTicket } from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import {
    assertLegacyCompatibilityTicket,
    isLegacyCompatibilityTicket,
} from './PdkCompatibilityAdmission';

// Keep the shell adapter as the only node-mutating compatibility module while
// sharing its ticket gate with the coordinator's admission path.
export { assertLegacyCompatibilityTicket, isLegacyCompatibilityTicket } from './PdkCompatibilityAdmission';

/** Only old prefab identity cleanup is allowed here; no Common capability is owned. */
export function markLegacyGameplayRoomRoot(
    node: Node,
    ticket: LegacySubgameTicket | null | undefined,
): void {
    assertLegacyCompatibilityTicket(ticket);
    if (!node?.isValid) return;
    if (node.name === 'CommonRoom' || node.name === 'PDK_CommonRoom') node.name = 'PDK_CommonRoom';
}

/** Remove an incomplete legacy shell only after the compatibility ticket gate. */
export function cleanLegacyCommonRoomShell(ticket: LegacySubgameTicket | null | undefined): void {
    assertLegacyCompatibilityTicket(ticket);
    const scene = director.getScene();
    const canvas = scene?.getChildByPath('Canvas') ?? find('Canvas');
    const stale = canvas?.children.find(child => child.isValid
        && child.name === 'CommonRoom' && !child.getChildByName('SeatHost'));
    if (!stale) return;
    stale.destroy();
}
