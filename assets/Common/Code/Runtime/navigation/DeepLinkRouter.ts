export const DeepLinkAction = Object.freeze({
    OPEN_INSTALL: 'OPEN_INSTALL', OPEN_LOGIN: 'OPEN_LOGIN', REQUEST_UPDATE: 'REQUEST_UPDATE',
    CONFIRM_LEAVE_ROOM: 'CONFIRM_LEAVE_ROOM', JOIN_TARGET_ROOM: 'JOIN_TARGET_ROOM', REJECT_INVALID: 'REJECT_INVALID',
});

export interface DeepLinkContext {
    inviteVerified: boolean;
    installed: boolean;
    authenticated: boolean;
    versionCompatible: boolean;
    currentRoomId?: string;
    targetRoomId: string;
}

/** Pure deep-link state machine; admission is still revalidated by the server on JOIN_TARGET_ROOM. */
export class DeepLinkRouter {
    resolve(context: DeepLinkContext): Readonly<Record<string, string | boolean>> {
        if (!context?.inviteVerified) return { action: DeepLinkAction.REJECT_INVALID };
        if (!context.installed) return { action: DeepLinkAction.OPEN_INSTALL, resumeInvite: true };
        if (!context.authenticated) return { action: DeepLinkAction.OPEN_LOGIN, resumeInvite: true };
        if (!context.versionCompatible) return { action: DeepLinkAction.REQUEST_UPDATE, resumeInvite: true };
        if (context.currentRoomId && context.currentRoomId !== context.targetRoomId) {
            return { action: DeepLinkAction.CONFIRM_LEAVE_ROOM, resumeInvite: true };
        }
        return { action: DeepLinkAction.JOIN_TARGET_ROOM, serverAdmissionRequired: true };
    }
}
