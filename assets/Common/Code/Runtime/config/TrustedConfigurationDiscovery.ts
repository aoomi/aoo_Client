/** Public configuration only. Startup must await discovery before constructing endpoint consumers.
 * Time is UTC epoch milliseconds; compatibility versions are canonical major.minor.patch integers.
 * Wire envelopes must be canonical JSON (also rejects duplicate JSON keys). No deployment defaults.
 */
export interface DiscoveryKey {
    keyId: string; issuer: string; purposes: string[]; notBefore: number; expiresAt: number;
    publicKey: JsonWebKey;
}
export interface DiscoveryState {
    revision: number; highestConfigVersion: number; trustVersion: number;
    keys: DiscoveryKey[]; revokedKeyIds: string[]; acceptedEnvelope?: string;
}
export interface DiscoverySource { url: string; failureDomain: string }
export interface DiscoveryReply { configuration?: string; trustUpdate?: string }
export interface DiscoveryDependencies {
    sources: DiscoverySource[]; anchors: DiscoveryKey[]; issuer: string; clientVersion: string;
    now: () => number; crypto: Crypto;
    transport: (source: DiscoverySource, signal: AbortSignal) => Promise<DiscoveryReply>;
    store: {
        read: () => Promise<DiscoveryState | undefined>;
        /** Durable atomic CAS of floor, cache and trust. Must reject stale revision. */
        compareAndSwap: (expectedRevision: number | undefined, next: DiscoveryState) => Promise<boolean>;
    };
    timeoutMs: number; maximumBytes: number;
}
interface Endpoint { url: string; priority: number }
interface Gateway { apiBaseUrl: string; webSocketUrl: string; priority: number }
interface Configuration {
    issuer: string; purpose: string; version: number; issuedAt: number; notBefore: number; expiresAt: number;
    minClientVersion: string; maxClientVersion: string; artifactVersion: string;
    gatewayEndpoints: Gateway[]; resourceEndpoints: Endpoint[]; standbySites: Endpoint[];
}
interface TrustUpdate {
    issuer: string; purpose: string; trustVersion: number; issuedAt: number; notBefore: number; expiresAt: number;
    keys: DiscoveryKey[]; revokedKeyIds: string[];
}
interface Envelope { schemaVersion: number; keyId: string; signature: string; payload: Record<string, unknown> }
export interface VerifiedDiscovery {
    runtimeConfig: { apiBaseUrl: string; resourceVersion: string; clientVersion: string };
    configuration: Configuration; provenance: 'remote' | 'verified-cache'; version: number;
}
const CONFIG = 'aoo-runtime-discovery';
const TRUST = 'aoo-discovery-trust';
function fail(): never { throw new Error('TRUSTED_DISCOVERY_REJECTED'); }
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    return value as Record<string, unknown>;
}
function exact(value: unknown, fields: string[]): Record<string, unknown> {
    const record = object(value);
    if (Object.keys(record).sort().join('|') !== [...fields].sort().join('|')) fail();
    return record;
}
function text(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim()) fail();
    return value;
}
function integer(value: unknown, minimum = 0): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail();
    return value;
}
function array(value: unknown): unknown[] {
    if (!Array.isArray(value) || value.length > 64) fail();
    return value;
}
export function canonicalDiscoveryJson(value: unknown): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail(); return JSON.stringify(value); }
    if (Array.isArray(value)) return '[' + value.map(canonicalDiscoveryJson).join(',') + ']';
    const record = object(value);
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalDiscoveryJson(record[key])).join(',') + '}';
}
function version(raw: unknown): number[] {
    const value = text(raw);
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) fail();
    return value.split('.').map(part => integer(Number(part)));
}
function compareVersions(left: string, right: string): number {
    const a = version(left), b = version(right);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
}
function publicUrl(raw: unknown, scheme = 'https:'): URL {
    const url = new URL(text(raw));
    const host = url.hostname.toLowerCase();
    // Discovery targets are DNS names. IP literals/internal names require a separately reviewed policy.
    if (url.protocol !== scheme || url.username || url.password || url.search || url.hash
        || !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost')
        || host.includes(':') || /^[\d.]+$/.test(host) || host.endsWith('.internal')) fail();
    if (url.toString() !== raw) fail();
    return url;
}
function timing(record: Record<string, unknown>, now: number): void {
    const issued = integer(record.issuedAt), start = integer(record.notBefore), end = integer(record.expiresAt);
    if (issued > start || start >= end || now < start || now >= end) fail();
}
function key(value: unknown): DiscoveryKey {
    const row = exact(value, ['keyId','issuer','purposes','notBefore','expiresAt','publicKey']);
    text(row.keyId); text(row.issuer);
    const purposes = array(row.purposes).map(text);
    if (!purposes.length || new Set(purposes).size !== purposes.length || purposes.some(p => p !== CONFIG && p !== TRUST)) fail();
    if (integer(row.notBefore) >= integer(row.expiresAt)) fail();
    const jwk = exact(row.publicKey, ['kty','crv','x','y']);
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !/^[A-Za-z0-9_-]{43}$/.test(text(jwk.x)) || !/^[A-Za-z0-9_-]{43}$/.test(text(jwk.y))) fail();
    return row as unknown as DiscoveryKey;
}
function keys(value: unknown): DiscoveryKey[] {
    const result = array(value).map(key);
    if (!result.length || new Set(result.map(k => k.keyId)).size !== result.length) fail();
    return result;
}
function ids(value: unknown): string[] {
    const result = array(value).map(text);
    if (new Set(result).size !== result.length) fail();
    return result;
}
async function verified(raw: string, purpose: string, state: DiscoveryState, deps: DiscoveryDependencies, now: number): Promise<Envelope> {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > deps.maximumBytes) fail();
    const parsed = JSON.parse(raw);
    if (canonicalDiscoveryJson(parsed) !== raw) fail();
    const envelope = exact(parsed, ['schemaVersion','keyId','signature','payload']) as unknown as Envelope;
    if (envelope.schemaVersion !== 1) fail();
    const signer = state.keys.find(k => k.keyId === text(envelope.keyId));
    const payload = object(envelope.payload);
    if (!signer || state.revokedKeyIds.includes(signer.keyId) || signer.issuer !== deps.issuer
        || payload.issuer !== deps.issuer || payload.purpose !== purpose || !signer.purposes.includes(purpose)
        || now < signer.notBefore || now >= signer.expiresAt) fail();
    timing(payload, now);
    const encoded = text(envelope.signature);
    if (!/^[A-Za-z0-9_-]{86}$/.test(encoded)) fail();
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/') + '=='), c => c.charCodeAt(0));
    if (bytes.length !== 64 || btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') !== encoded) fail();
    const imported = await deps.crypto.subtle.importKey('jwk', signer.publicKey, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
    const content = canonicalDiscoveryJson({schemaVersion:1,keyId:envelope.keyId,payload});
    if (!await deps.crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, imported, bytes, new TextEncoder().encode(content))) fail();
    return envelope;
}
function configuration(envelope: Envelope, deps: DiscoveryDependencies): Configuration {
    const row = exact(envelope.payload, ['issuer','purpose','version','issuedAt','notBefore','expiresAt','minClientVersion','maxClientVersion','artifactVersion','gatewayEndpoints','resourceEndpoints','standbySites']);
    integer(row.version,1); text(row.artifactVersion);
    const min = text(row.minClientVersion), max = text(row.maxClientVersion);
    if (compareVersions(min,max)>0 || compareVersions(deps.clientVersion,min)<0 || compareVersions(deps.clientVersion,max)>0) fail();
    const gateways = array(row.gatewayEndpoints);
    if (!gateways.length) fail();
    for (const item of gateways) {
        const g = exact(item,['apiBaseUrl','webSocketUrl','priority']); integer(g.priority);
        const api = publicUrl(g.apiBaseUrl), ws = publicUrl(g.webSocketUrl,'wss:');
        if (api.pathname !== '/' || ws.pathname !== '/api/v2/gateway/ws' || api.host !== ws.host) fail();
    }
    for (const list of [row.resourceEndpoints,row.standbySites]) for (const item of array(list)) {
        const endpoint = exact(item,['url','priority']); publicUrl(endpoint.url); integer(endpoint.priority);
    }
    return row as unknown as Configuration;
}
function signedContent(raw: string): string {
    const e = JSON.parse(raw) as Envelope;
    return canonicalDiscoveryJson({schemaVersion:e.schemaVersion,keyId:e.keyId,payload:e.payload});
}
async function fetchSource(source: DiscoverySource, deps: DiscoveryDependencies): Promise<DiscoveryReply> {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('DISCOVERY_TIMEOUT')); }, deps.timeoutMs); });
        const reply = await Promise.race([deps.transport(source,abort.signal),timeout]);
        const record = object(reply);
        if (!Object.keys(record).length || Object.keys(record).some(k => k !== 'configuration' && k !== 'trustUpdate')) fail();
        for (const value of Object.values(record)) if (typeof value !== 'string' || new TextEncoder().encode(value).length > deps.maximumBytes) fail();
        return reply;
    } finally { if (timer !== undefined) clearTimeout(timer); }
}
/** Returns verified public data only; caller owns the reviewed startup barrier and installation. */
export async function resolveVerifiedDiscovery(deps: DiscoveryDependencies): Promise<VerifiedDiscovery> {
    text(deps.issuer); version(deps.clientVersion);
    integer(deps.timeoutMs,1); integer(deps.maximumBytes,1);
    if (deps.timeoutMs > 30000 || deps.maximumBytes > 1048576) fail();
    const sources = array(deps.sources) as DiscoverySource[];
    for (const source of sources) { exact(source,['url','failureDomain']); publicUrl(source.url); text(source.failureDomain); }
    if (sources.length < 2 || new Set(sources.map(s => new URL(s.url).origin)).size !== sources.length
        || new Set(sources.map(s => s.failureDomain)).size !== sources.length) fail();
    const anchors = keys(deps.anchors); if (anchors.some(k => k.issuer !== deps.issuer)) fail();
    const stored = await deps.store.read();
    let expectedRevision = stored?.revision;
    let state: DiscoveryState = stored === undefined ? {revision:0,highestConfigVersion:0,trustVersion:0,keys:anchors,revokedKeyIds:[]} : JSON.parse(JSON.stringify(stored));
    exact(state, state.acceptedEnvelope === undefined ? ['revision','highestConfigVersion','trustVersion','keys','revokedKeyIds'] : ['revision','highestConfigVersion','trustVersion','keys','revokedKeyIds','acceptedEnvelope']);
    integer(state.revision); integer(state.highestConfigVersion); integer(state.trustVersion); keys(state.keys); ids(state.revokedKeyIds);
    if (state.keys.some(k => k.issuer !== deps.issuer)) fail();
    const now = integer(deps.now());
    const replies = await Promise.all(sources.map(s => fetchSource(s,deps).catch(() => undefined)));
    const updates: {raw:string; update:TrustUpdate}[] = [];
    for (const reply of replies) if (reply?.trustUpdate) {
        try {
            const env = await verified(reply.trustUpdate,TRUST,state,deps,now);
            const update = exact(env.payload,['issuer','purpose','trustVersion','issuedAt','notBefore','expiresAt','keys','revokedKeyIds']) as unknown as TrustUpdate;
            integer(update.trustVersion,1); keys(update.keys); ids(update.revokedKeyIds);
            if (update.trustVersion <= state.trustVersion || update.keys.some(k => k.issuer !== deps.issuer)) fail();
            updates.push({raw:reply.trustUpdate,update});
        } catch { /* Invalid source input has no state authority. */ }
    }
    updates.sort((a,b) => b.update.trustVersion-a.update.trustVersion);
    if (updates.length) {
        const selected = updates[0];
        if (updates.some(u => u.update.trustVersion === selected.update.trustVersion && signedContent(u.raw) !== signedContent(selected.raw))) fail();
        const revoked = new Set([...state.revokedKeyIds,...selected.update.revokedKeyIds]);
        for (const next of selected.update.keys) {
            const previous = state.keys.find(k => k.keyId === next.keyId);
            if (revoked.has(next.keyId) || (previous && canonicalDiscoveryJson(previous) !== canonicalDiscoveryJson(next))) fail();
        }
        // Authenticated trust changes survive configuration rejection. Preserve the existing
        // cache/floor; they must be reverified under the committed trust on every later read.
        await verified(selected.raw,TRUST,state,deps,integer(deps.now()));
        const trustState = {...state,revision:integer(state.revision+1),trustVersion:selected.update.trustVersion,
            keys:selected.update.keys,revokedKeyIds:[...revoked].sort()};
        if (!await deps.store.compareAndSwap(expectedRevision,trustState)) fail();
        state = trustState;
        expectedRevision = trustState.revision;
    }
    const candidates: {raw:string; config:Configuration}[] = [];
    for (const reply of replies) if (reply?.configuration) {
        try {
            const env = await verified(reply.configuration,CONFIG,state,deps,now); const config = configuration(env,deps);
            if (config.version < state.highestConfigVersion || (config.version === state.highestConfigVersion
                && (!state.acceptedEnvelope || signedContent(reply.configuration) !== signedContent(state.acceptedEnvelope)))) fail();
            candidates.push({raw:reply.configuration,config});
        } catch { /* Reject this source; fallback is separately reverified. */ }
    }
    candidates.sort((a,b) => b.config.version-a.config.version);
    let selected = candidates[0]; let provenance: VerifiedDiscovery['provenance'] = 'remote';
    if (selected && candidates.some(c => c.config.version === selected.config.version && signedContent(c.raw) !== signedContent(selected.raw))) fail();
    if (!selected) {
        if (!state.acceptedEnvelope) fail();
        const env = await verified(state.acceptedEnvelope,CONFIG,state,deps,now); const config = configuration(env,deps);
        if (config.version !== state.highestConfigVersion) fail();
        selected = {raw:state.acceptedEnvelope,config}; provenance = 'verified-cache';
    }
    // Sample again after asynchronous I/O/crypto; an expired candidate may never be installed.
    const finished = integer(deps.now());
    await verified(selected.raw,CONFIG,state,deps,finished);
    const next = {...state,revision:integer(state.revision+1),highestConfigVersion:selected.config.version,acceptedEnvelope:selected.raw};
    if (!await deps.store.compareAndSwap(expectedRevision,next)) fail();
    const gateway = [...selected.config.gatewayEndpoints].sort((a,b)=>a.priority-b.priority || a.apiBaseUrl.localeCompare(b.apiBaseUrl))[0];
    return {runtimeConfig:{apiBaseUrl:gateway.apiBaseUrl,resourceVersion:selected.config.artifactVersion,clientVersion:deps.clientVersion},configuration:selected.config,version:selected.config.version,provenance};
}
