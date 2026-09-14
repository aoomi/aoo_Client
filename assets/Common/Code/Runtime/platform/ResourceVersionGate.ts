export interface RuntimeVersions {
    readonly client: string;
    readonly resources: string;
    readonly protocol: string;
    readonly gameplay: string;
}

export interface ResourceEntry {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
    readonly dependencies: readonly string[];
}

export interface ResourceManifest {
    readonly version: string;
    readonly compatible: RuntimeVersions;
    readonly signature: string;
    readonly entries: readonly ResourceEntry[];
}

export type ManifestVerifier = (canonicalPayload: string, signature: string) => Promise<boolean>;

export class ResourceVersionGate {
    public constructor(private readonly verifySignature: ManifestVerifier) {}

    public async validate(manifest: ResourceManifest, runtime: RuntimeVersions): Promise<void> {
        if (!manifest.signature) throw new Error('unsigned resource manifest');
        if (!this.sameVersions(manifest.compatible, runtime)) throw new Error('incompatible resource version set');
        const paths = new Set<string>();
        for (const entry of manifest.entries) {
            if (!entry.path || paths.has(entry.path)) throw new Error(`duplicate resource path: ${entry.path}`);
            if (!/^[a-f0-9]{64}$/i.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0) {
                throw new Error(`invalid resource entry: ${entry.path}`);
            }
            paths.add(entry.path);
        }
        for (const entry of manifest.entries) {
            for (const dependency of entry.dependencies) {
                if (!paths.has(dependency)) throw new Error(`missing dependency ${dependency} for ${entry.path}`);
            }
        }
        const canonical = JSON.stringify({ version: manifest.version, compatible: manifest.compatible, entries: manifest.entries });
        if (!await this.verifySignature(canonical, manifest.signature)) throw new Error('resource manifest signature rejected');
    }

    private sameVersions(left: RuntimeVersions, right: RuntimeVersions): boolean {
        return left.client === right.client && left.resources === right.resources
            && left.protocol === right.protocol && left.gameplay === right.gameplay;
    }
}

/** Keeps the active set unchanged until every staged asset has been verified. */
export class AtomicResourceSet<T extends object> {
    private active?: Readonly<T>;
    private staged?: Readonly<T>;

    public stage(value: T): void { this.staged = Object.freeze({ ...value }); }
    public commit(): void {
        if (!this.staged) throw new Error('no staged resource set');
        this.active = this.staged;
        this.staged = undefined;
    }
    public rollback(): void { this.staged = undefined; }
    public current(): Readonly<T> | undefined { return this.active; }
}
