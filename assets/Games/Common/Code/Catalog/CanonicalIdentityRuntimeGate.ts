import {
    assertCanonicalManifest,
    projectCanonicalIdentity,
    requireCanonicalRuntimeMetadata,
    type CanonicalIdentityProjection,
    type CanonicalRuntimeMetadataBinding,
} from './CanonicalRuntimeMetadataBindings';

/**
 * Single client admission boundary for the identity-contract projection.
 * Every server descriptor/provider/lobby/gateway/client consumer receives the
 * same immutable binding. Missing contract fields deliberately reject before a
 * room entry or a handoff can reach a gameplay runtime.
 */
export function requireCanonicalIdentityProjection(
    manifestSha256: string,
    releaseEdition: string,
    identity: Readonly<Pick<CanonicalRuntimeMetadataBinding,
        'gameId' | 'gameCode' | 'family' | 'playVersion' | 'regionCode'>>,
): CanonicalIdentityProjection {
    assertCanonicalManifest(manifestSha256, releaseEdition);
    return projectCanonicalIdentity(requireCanonicalRuntimeMetadata(
        identity.gameId, identity.gameCode, identity.family,
        identity.playVersion, identity.regionCode,
    ));
}

