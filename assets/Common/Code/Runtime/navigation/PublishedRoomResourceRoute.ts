const LEGACY_ROOM_BUNDLE_MAP = Object.freeze({
    'poker01-prefab': 'paodekuai-common',
    'pdk-common-room': 'paodekuai-common',
} as const);

/**
 * Resolves a resource route stored by an older immutable room publication.
 * New room publications must emit the canonical bundle directly; this map is
 * deliberately central so historical routes do not leak into game launchers.
 */
export function resolvePublishedRoomBundle(bundleName: string): string {
    const route = bundleName.trim();
    return LEGACY_ROOM_BUNDLE_MAP[route as keyof typeof LEGACY_ROOM_BUNDLE_MAP] ?? route;
}
