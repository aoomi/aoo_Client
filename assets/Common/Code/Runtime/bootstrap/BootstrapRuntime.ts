import { sys } from 'cc';
import { resolveRuntimeEndpoints } from '../config/RuntimeEndpoints';
import { requireCanonicalWebSocketUrl } from '../network/GatewayEntryPolicy';
import { legacyHotUpdateService } from '../platform/LegacyHotUpdateService';
import { BootstrapGateway } from './BootstrapGateway';
import type { BootstrapDecision } from './BootstrapTypes';
import type { DirectoryServer } from '../ServerDirectory/ServerDirectoryTypes';
import { requireSelectableServer, resolveDirectoryServer } from '../ServerDirectory/ServerDirectoryPolicy';

const SERVER_KEY = 'aoo:selected-server';

export class BootstrapRuntime {
    private decision: BootstrapDecision | null = null;

    public async initialize(): Promise<BootstrapDecision> {
        const preferred = Number(sys.localStorage.getItem(SERVER_KEY));
        const decision = await new BootstrapGateway(resolveRuntimeEndpoints()).resolve(Number.isSafeInteger(preferred) && preferred > 0 ? preferred : null);
        this.decision = decision;
        const selected = this.selectedServer();
        if (!selected) throw new Error('权威服务器目录没有可登录区服');
        requireCanonicalWebSocketUrl(selected.endpoint);
        sys.localStorage.setItem(SERVER_KEY, String(selected.id));
        if (decision.release?.downloadUrl && decision.manifest) {
            const manifestUrl = new URL('project.manifest', decision.release.downloadUrl.replace(/\/?$/, '/')).toString();
            if (legacyHotUpdateService.configure(manifestUrl)) legacyHotUpdateService.check();
        }
        return decision;
    }

    public isEnabled(key: string): boolean { return this.require().featureFlags.find(flag => flag.key === key)?.enabled ?? false; }
    public selectedServer(): DirectoryServer | null {
        return resolveDirectoryServer(this.require().directory);
    }
    public selectServer(id: number): void {
        requireSelectableServer(this.require().directory, id);
        sys.localStorage.setItem(SERVER_KEY, String(id));
        this.decision = { ...this.require(), directory: { ...this.require().directory, selectedServerId: id } };
    }
    public current(): BootstrapDecision { return this.require(); }
    private require(): BootstrapDecision { if (!this.decision) throw new Error('启动版本与目录尚未完成'); return this.decision; }
}

export const bootstrapRuntime = new BootstrapRuntime();
