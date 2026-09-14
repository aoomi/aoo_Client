import type { ServerDirectory } from '../ServerDirectory/ServerDirectoryTypes';

export interface BootstrapFeatureFlag { readonly key: string; readonly enabled: boolean; readonly value: string | null; }
export interface BootstrapMaintenance { readonly message: string; readonly loginBlocked: boolean; }
export interface BootstrapRelease { readonly version: string; readonly downloadUrl: string; }
export interface BootstrapManifest { readonly version: string; readonly signature: string; readonly assets: readonly { path: string; sizeBytes: number; sha256: string }[]; }
export interface BootstrapDecision {
    readonly status: 'CURRENT' | 'UPDATE_AVAILABLE' | 'FORCE_UPDATE' | 'MAINTENANCE';
    readonly forceUpdate: boolean;
    readonly release: BootstrapRelease | null;
    readonly manifest: BootstrapManifest | null;
    readonly maintenance: BootstrapMaintenance | null;
    readonly featureFlags: readonly BootstrapFeatureFlag[];
    readonly directory: ServerDirectory;
}
