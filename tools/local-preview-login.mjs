import http from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PAGE_ORIGIN = 'http://localhost:7456';
export const API_ORIGIN = 'http://localhost:18660/';
export const ISSUER_HOST = '127.0.0.1';
export const ISSUER_PORT = 18662;
export const TTL_SECONDS = 300;
export const MAX_USES = 2;

export function isApprovedBootstrapRequest(request) {
    if (request.method !== 'GET' || request.url !== '/bootstrap.js'
        || request.headers.host !== `${ISSUER_HOST}:${ISSUER_PORT}`
        || request.headers['sec-fetch-dest'] !== 'script'
        || request.headers['sec-fetch-mode'] !== 'no-cors'
        || request.headers['sec-fetch-site'] !== 'cross-site') return false;
    try {
        const referer = new URL(request.headers.referer ?? '');
        return referer.origin === PAGE_ORIGIN && referer.pathname === '/'
            && !referer.username && !referer.password
            && (!request.headers.origin || request.headers.origin === PAGE_ORIGIN);
    } catch { return false; }
}

export function publicGrant(ticket, deviceId, nowMs, generationId) {
    return {
        generationId, namespace: 'aoo-local-preview', purpose: 'version.check', origin: PAGE_ORIGIN,
        deviceId, issuedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + TTL_SECONDS * 1000).toISOString(),
        maxUses: MAX_USES, tokenSha256: createHash('sha256').update(ticket, 'utf8').digest('hex'), revoked: false,
    };
}

export function bootstrapScript(ticket, deviceId) {
    // This response is generated in memory and never written to a file or browser storage.
    const config = JSON.stringify({ environment: 'test', apiBaseUrl: API_ORIGIN, deviceId, bootstrapToken: ticket });
    return `globalThis.__aoo_RUNTIME_CONFIG__=Object.freeze(${config});globalThis.__aoo_LOCAL_PREVIEW_BOOTSTRAP_READY__=true;`;
}

async function assertPrivateTarget(descriptorPath) {
    if (!path.isAbsolute(descriptorPath)) throw new Error('DESCRIPTOR_ABSOLUTE_PATH_REQUIRED');
    const parent = await lstat(path.dirname(descriptorPath));
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700
        || parent.uid !== process.getuid()) throw new Error('DESCRIPTOR_PRIVATE_DIRECTORY_REQUIRED');
    try {
        const target = await lstat(descriptorPath);
        if (!target.isFile() || target.isSymbolicLink() || (target.mode & 0o777) !== 0o600
            || target.uid !== process.getuid()) throw new Error('DESCRIPTOR_PRIVATE_FILE_REQUIRED');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function publishGrant(descriptorPath, grant) {
    await assertPrivateTarget(descriptorPath);
    const temporary = `${descriptorPath}.${randomUUID()}.tmp`;
    let handle;
    try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(JSON.stringify(grant));
        await handle.sync();
        await handle.close(); handle = undefined;
        await rename(temporary, descriptorPath);
        const directory = await open(path.dirname(descriptorPath), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
    } finally {
        await handle?.close();
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
}

export async function startLauncher({ descriptorPath }) {
    await assertPrivateTarget(descriptorPath);
    const deviceId = `preview-${randomUUID()}`;
    const leasePath = `${descriptorPath}.launcher.lock`;
    const lease = await open(leasePath, 'wx', 0o600);
    const leaseIdentity = await lease.stat();
    await lease.writeFile(JSON.stringify({ pid: process.pid, namespace: 'aoo-local-preview' }));
    await lease.sync();
    let grant;
    let shuttingDown = false;
    let queue = Promise.resolve();
    const server = http.createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store, max-age=0');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        if (shuttingDown || !isApprovedBootstrapRequest(request)) {
            response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('LOCAL_PREVIEW_REQUEST_REJECTED'); return;
        }
        queue = queue.then(async () => {
            if (shuttingDown || response.destroyed) return;
            if (grant) await publishGrant(descriptorPath, { ...grant, revoked: true });
            const ticket = randomBytes(32).toString('base64url');
            grant = publicGrant(ticket, deviceId, Date.now(), randomUUID());
            await publishGrant(descriptorPath, grant);
            if (shuttingDown || response.destroyed) return;
            response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            response.end(bootstrapScript(ticket, deviceId));
        }).catch(() => {
            // Never include exception text or credentials in responses/logs.
            if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('LOCAL_PREVIEW_BOOTSTRAP_UNAVAILABLE');
        });
    });
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(ISSUER_PORT, ISSUER_HOST, resolve); });
    } catch (error) {
        await lease.close();
        await unlink(leasePath);
        throw error;
    }
    const stop = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        await queue;
        try {
            if (grant) { await publishGrant(descriptorPath, { ...grant, revoked: true }); grant = undefined; }
        } finally {
            await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
            await lease.close();
            const currentLease = await lstat(leasePath);
            if (currentLease.ino !== leaseIdentity.ino || currentLease.dev !== leaseIdentity.dev) throw new Error('LAUNCHER_LOCK_CUSTODY_CHANGED');
            await unlink(leasePath);
        }
    };
    return { stop, entryURL: `${PAGE_ORIGIN}/?aooPreviewBootstrap=1` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.length !== 3 || args[0] !== '--enable-local-preview' || args[1] !== '--descriptor') {
        console.error('Usage: node tools/local-preview-login.mjs --enable-local-preview --descriptor /approved/private/grant.json');
        process.exitCode = 2;
    } else {
        try {
            const launcher = await startLauncher({ descriptorPath: args[2] });
            console.log(`本机预览入口：${launcher.entryURL}`);
            console.log('刷新入口获取新启动票据；票据五分钟内最多两次，仅用于版本检查。退出启动器即撤销。');
            let stopping = false;
            const shutdown = async () => {
                if (stopping) return; stopping = true;
                try { await launcher.stop(); } catch { process.exitCode = 1; console.error('LOCAL_PREVIEW_REVOKE_FAILED'); }
            };
            process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
        } catch { console.error('LOCAL_PREVIEW_LAUNCHER_START_FAILED'); process.exitCode = 1; }
    }
}
