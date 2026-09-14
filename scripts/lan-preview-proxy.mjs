import http from 'node:http';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';

const listenPort = Number(process.env.AOO_LAN_PREVIEW_PORT ?? 7457);
const creatorHost = process.env.AOO_CREATOR_PREVIEW_HOST ?? '127.0.0.1';
const creatorPort = Number(process.env.AOO_CREATOR_PREVIEW_PORT ?? 7456);

const server = http.createServer((request, response) => {
    const startedAt = Date.now();
    const sourceIp = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
    // 查询参数可能含会话信息，诊断日志只记录资源路径。
    const requestPath = new URL(request.url ?? '/', 'http://preview.invalid').pathname;
    const headers = { ...request.headers, host: `${creatorHost}:${creatorPort}` };
    delete headers['if-none-match'];
    delete headers['if-modified-since'];
    const upstream = http.request({
        hostname: creatorHost,
        port: creatorPort,
        method: request.method,
        path: request.url,
        headers,
    }, (incoming) => {
        const outgoingHeaders = { ...incoming.headers };
        delete outgoingHeaders.etag;
        delete outgoingHeaders['last-modified'];
        outgoingHeaders['cache-control'] = 'no-store, no-cache, must-revalidate, max-age=0';
        outgoingHeaders.pragma = 'no-cache';
        outgoingHeaders.expires = '0';
        response.writeHead(incoming.statusCode ?? 502, outgoingHeaders);
        const hash = createHash('sha256');
        let bytes = 0;
        const audit = new Transform({
            transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                hash.update(chunk);
                callback(null, chunk);
            },
        });
        audit.on('finish', () => {
            console.log(JSON.stringify({
                time: new Date().toISOString(), sourceIp, method: request.method,
                path: requestPath, status: incoming.statusCode ?? 502,
                bytes, sha256: hash.digest('hex'), upstream: `${creatorHost}:${creatorPort}`,
                durationMs: Date.now() - startedAt,
            }));
        });
        incoming.pipe(audit).pipe(response);
    });
    upstream.on('error', (error) => {
        console.error(JSON.stringify({
            time: new Date().toISOString(), sourceIp, method: request.method,
            path: requestPath, status: 502, upstream: `${creatorHost}:${creatorPort}`,
            durationMs: Date.now() - startedAt, error: error.message,
        }));
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        response.end(`Creator Preview 暂不可用：${error.message}`);
    });
    request.pipe(upstream);
});

server.listen(listenPort, '0.0.0.0', () => {
    console.log(`Aoo LAN Preview proxy listening on 0.0.0.0:${listenPort} -> ${creatorHost}:${creatorPort}`);
});
