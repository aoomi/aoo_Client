export type DirectoryServerState = 'ACTIVE' | 'MAINTENANCE' | 'MIGRATING';

export interface DirectoryServer {
    readonly id: number;
    readonly code: string;
    readonly name: string;
    readonly region: string;
    readonly endpoint: string;
    readonly state: DirectoryServerState;
    readonly weight: number;
    readonly migrateToServerId: number | null;
    readonly message: string | null;
}

export interface ServerDirectory {
    readonly revision: number;
    readonly servers: readonly DirectoryServer[];
    readonly selectedServerId: number | null;
}
