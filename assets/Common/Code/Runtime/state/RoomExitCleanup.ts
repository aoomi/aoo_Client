export const REQUIRED_ROOM_EXIT_CLEANUPS = Object.freeze([
    'closeConnectionScope', 'clearRoomStore', 'clearSceneBuffer',
    'clearOperationCandidates', 'cancelTimers', 'clearChatTargets', 'clearSeatMapping',
]);

export type RoomExitResources = Record<(typeof REQUIRED_ROOM_EXIT_CLEANUPS)[number], () => void>;

/** Client-side counterpart of the server exit barrier. All cleanup callbacks run even if one fails. */
export function cleanupRoomClient(resources: RoomExitResources): void {
    const missing = REQUIRED_ROOM_EXIT_CLEANUPS.filter(name => typeof resources?.[name] !== 'function');
    if (missing.length) throw new Error(`missing room exit cleanup: ${missing.join(',')}`);
    const failures: Array<{ name: string; failure: unknown }> = [];
    for (const name of REQUIRED_ROOM_EXIT_CLEANUPS) {
        try { resources[name](); } catch (failure) { failures.push({ name, failure }); }
    }
    if (failures.length) {
        const error = new Error(`room exit cleanup failed: ${failures.map(item => item.name).join(',')}`) as Error & { failures?: typeof failures };
        error.failures = failures;
        throw error;
    }
}
