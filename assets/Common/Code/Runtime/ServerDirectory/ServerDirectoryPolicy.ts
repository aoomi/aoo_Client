import type { DirectoryServer, ServerDirectory } from './ServerDirectoryTypes';

export function resolveDirectoryServer(directory: ServerDirectory): DirectoryServer | null {
    const selected = directory.servers.find(server => server.id === directory.selectedServerId) ?? null;
    if (!selected) return null;
    if (selected.state === 'MIGRATING' && selected.migrateToServerId) {
        const target = directory.servers.find(server => server.id === selected.migrateToServerId) ?? null;
        return target?.state === 'ACTIVE' ? target : null;
    }
    return selected.state === 'ACTIVE' ? selected : null;
}

export function requireSelectableServer(directory: ServerDirectory, id: number): DirectoryServer {
    const server = directory.servers.find(candidate => candidate.id === id);
    if (!server || server.state !== 'ACTIVE') throw new Error(server?.message ?? '区服不可用');
    return server;
}
