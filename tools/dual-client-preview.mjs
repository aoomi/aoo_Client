import http from 'node:http';
import net from 'node:net';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 7460;
const DEFAULT_PREVIEW_PORT = 7456;
const DEFAULT_CLIENT_COUNT = 2;
const MAX_CLIENT_COUNT = 4;
// 7457 is reserved by the XQP Creator preview. Keep Aoo test origins stable so
// browser storage stays isolated without competing with the other project.
// Creator 7456 is only the mutable snapshot source. Every browser gets an
// isolated, immutable origin managed by PreviewSnapshotSupervisor.
const DEFAULT_CLIENT_PORTS = [7458, 7459, 5188, 7461];
const maintenanceFile = resolve('work/fw003-dashboard-maintenance.txt');
const maintenanceMessage = existsSync(maintenanceFile) ? readFileSync(maintenanceFile, 'utf8').trim() : '';

function parsePort(value, option) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${option} 必须是 1-65535 的整数`);
  }
  return port;
}

function parseClientCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 2 || count > MAX_CLIENT_COUNT) {
    throw new Error(`--clients 必须是 2-${MAX_CLIENT_COUNT} 的整数`);
  }
  return count;
}

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    previewPort: DEFAULT_PREVIEW_PORT,
    clientCount: DEFAULT_CLIENT_COUNT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--host') options.host = argv[++index];
    else if (argument === '--port') options.port = parsePort(argv[++index], '--port');
    else if (argument === '--preview-port') options.previewPort = parsePort(argv[++index], '--preview-port');
    else if (argument === '--clients') options.clientCount = parseClientCount(argv[++index]);
    else throw new Error(`未知参数: ${argument}`);
  }
  if (!options.host) throw new Error('--host 不能为空');
  return options;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPage(clientPorts, hostname) {
  const clientCount = clientPorts.length;
  const clients = Array.from({ length: clientCount }, (_, index) => ({
    name: `客户端 ${String.fromCharCode(65 + index)}`,
    // 使用当前浏览器访问面板的主机；每个端口仍是独立来源，隔离登录存储。
    url: `http://${hostname}:${clientPorts[index]}/`,
  }));
  const panes = clients.map((client, index) => `
    <section class="client-pane">
      <header>
        <strong>${escapeHtml(client.name)}</strong>
        <span>${escapeHtml(client.url)}</span>
        <button type="button" data-frame="client-${index}">重新加载</button>
      </header>
      ${maintenanceMessage ? `<div class="maintenance"><strong>维护中</strong><span>${escapeHtml(maintenanceMessage)}</span></div>` : `<div class="device-viewport"><iframe
        id="client-${index}"
        title="${escapeHtml(client.name)}"
        data-src="${escapeHtml(client.url)}?autoReload=false"
        scrolling="no"
        allow="autoplay; clipboard-read; clipboard-write; fullscreen"
      ></iframe></div>`}
    </section>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aoo ${clientCount} 客户端预览</title>
  <style>
    :root {
      --pane-width: 922px;
      --iphone-landscape-width: 852px;
      --iphone-landscape-height: 393px;
      --creator-toolbar-height: 50px;
      --iphone-preview-scale: 1.0821596244;
      --scaled-device-height: 480px;
      --header-height: 34px;
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { min-width: 100%; min-height: 100%; margin: 0; background: #101216; }
    body { overflow: auto; }
    main { display: grid; grid-template-columns: repeat(2, var(--pane-width)); grid-auto-rows: calc(var(--header-height) + var(--scaled-device-height)); width: max-content; margin: 0 auto; gap: 2px; }
    .client-pane { display: grid; grid-template-rows: var(--header-height) var(--scaled-device-height); width: var(--pane-width); height: calc(var(--header-height) + var(--scaled-device-height)); background: #171a20; }
    header { display: flex; align-items: center; gap: 10px; padding: 0 10px; color: #dce3ee; background: #242933; border-bottom: 1px solid #343b48; }
    header strong { white-space: nowrap; }
    header span { min-width: 0; overflow: hidden; color: #9aa7b8; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
    header button { margin-left: auto; padding: 4px 9px; color: #e6edf7; background: #343c49; border: 1px solid #4a5668; border-radius: 5px; cursor: pointer; }
    header button:hover { background: #414b5b; }
    .device-viewport { width: var(--pane-width); height: var(--scaled-device-height); overflow: hidden; background: #111; }
    iframe { width: var(--iphone-landscape-width); height: calc(var(--creator-toolbar-height) + var(--iphone-landscape-height)); border: 0; background: #111; transform: scale(var(--iphone-preview-scale)); transform-origin: top left; }
    .maintenance { display: grid; place-content: center; gap: 10px; padding: 24px; color: #dce3ee; background: #11151b; text-align: center; }
    .maintenance strong { color: #f0c674; font-size: 22px; }
    .maintenance span { color: #9aa7b8; font-size: 14px; }
  </style>
</head>
<body>
  <main>${panes}
  </main>
  <script>
    const frames = [...document.querySelectorAll('iframe[data-src]')];
    const publishedBuilds = new Map();
    const reloadFrame = (frame, buildId = '') => {
      if (!frame?.dataset.src) return;
      const build = buildId ? '&build=' + encodeURIComponent(buildId) : '';
      frame.src = frame.dataset.src + build + '&reload=' + Date.now();
    };
    // Four Cocos engines booting in the same Chrome tab can saturate that tab's
    // module loader and turn otherwise healthy 200 responses into SystemJS
    // load failures. Keep all panes visible, but stagger only their cold start.
    frames.forEach((frame, index) => {
      window.setTimeout(() => { frame.src = frame.dataset.src; }, index * 2000);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-frame]');
      if (!button) return;
      const frame = document.getElementById(button.dataset.frame);
      reloadFrame(frame);
    });
    const pollPublishedBuilds = async () => {
      try {
        const response = await fetch('/snapshot-health', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        for (const client of payload.clients ?? []) {
          if (!client.ok || !client.buildId) continue;
          const previous = publishedBuilds.get(client.port);
          publishedBuilds.set(client.port, client.buildId);
          if (!previous || previous === client.buildId) continue;
          const frame = frames[client.index];
          if (frame) reloadFrame(frame, client.buildId);
        }
      } catch {
        // A transient health failure must not disrupt a running game. The next
        // poll compares against the last successfully observed build.
      }
    };
    void pollPublishedBuilds();
    window.setInterval(pollPublishedBuilds, 2000);
  </script>
</body>
</html>`;
}

function printHelp() {
  process.stdout.write(`Aoo 多客户端同窗口预览\n\n`);
  process.stdout.write(`用法: node tools/dual-client-preview.mjs [选项]\n\n`);
  process.stdout.write(`  --host <host>           工具监听地址，默认 ${DEFAULT_HOST}\n`);
  process.stdout.write(`  --port <port>           工具端口，默认 ${DEFAULT_PORT}\n`);
  process.stdout.write(`  --preview-port <port>   Creator Preview 端口，默认 ${DEFAULT_PREVIEW_PORT}\n`);
  process.stdout.write(`  --clients <count>       客户端数量 2-${MAX_CLIENT_COUNT}，默认 ${DEFAULT_CLIENT_COUNT}\n`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const usesManagedAooPorts = options.previewPort === DEFAULT_PREVIEW_PORT;
const clientPorts = usesManagedAooPorts
  ? DEFAULT_CLIENT_PORTS.slice(0, options.clientCount)
  : Array.from({ length: options.clientCount }, (_, index) => options.previewPort + index);
if (clientPorts.some((port) => port === options.port)) {
  throw new Error('四客户端代理端口与工具端口冲突，请通过 --port 指定其他工具端口');
}

function createPreviewProxy(listenPort) {
  const proxy = http.createServer((request, response) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: options.previewPort,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: `127.0.0.1:${options.previewPort}` },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', (error) => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Creator Preview 代理失败: ${error.message}`);
    });
    request.pipe(upstream);
  });

  proxy.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(options.previewPort, '127.0.0.1', () => {
      const headers = [];
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index];
        const value = name.toLowerCase() === 'host'
          ? `127.0.0.1:${options.previewPort}`
          : request.rawHeaders[index + 1];
        headers.push(`${name}: ${value}`);
      }
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
  });

  proxy.listen(listenPort, options.host);
  return proxy;
}

function readSnapshotHealth(port, index) {
  return new Promise((done) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/__aoo/health' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const health = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          done({ index, port, ok: response.statusCode === 200 && health.ok === true, buildId: health.buildId ?? null });
        } catch {
          done({ index, port, ok: false, buildId: null });
        }
      });
    });
    request.setTimeout(1500, () => request.destroy());
    request.on('error', () => done({ index, port, ok: false, buildId: null }));
  });
}

// Default Aoo proxy ports are persistent LaunchAgents. Custom preview ports
// remain self-contained and are owned by this process.
const proxyServers = usesManagedAooPorts ? [] : clientPorts.slice(1).map(createPreviewProxy);
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, previewPort: options.previewPort, clientCount: options.clientCount, clientPorts }));
    return;
  }
  if (url.pathname === '/snapshot-health') {
    const clients = await Promise.all(clientPorts.map(readSnapshotHealth));
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: clients.every((client) => client.ok), clients }));
    return;
  }
  if (url.pathname !== '/') {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(renderPage(clientPorts, url.hostname));
});

server.listen(options.port, options.host, () => {
  process.stdout.write(`Aoo ${options.clientCount} 客户端预览: http://${options.host}:${options.port}/\n`);
  for (let index = 0; index < options.clientCount; index += 1) {
    const name = String.fromCharCode(65 + index);
    process.stdout.write(`客户端 ${name}: http://127.0.0.1:${clientPorts[index]}/\n`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const proxy of proxyServers) proxy.close();
    server.close(() => process.exit(0));
  });
}
