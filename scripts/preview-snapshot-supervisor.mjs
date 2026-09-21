import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { join, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.env.AOO_PREVIEW_SNAPSHOT_ROOT ?? join(process.cwd(), 'work/preview-snapshots'));
const upstream = new URL(process.env.AOO_CREATOR_PREVIEW_URL ?? 'http://127.0.0.1:7456/');
const slots = (process.env.AOO_PREVIEW_SLOTS ?? 'A:7458,B:7459,C:5188,D:7461').split(',').map((pair) => {
  const [name, port] = pair.split(':');
  return { name, port: Number(port) };
});
const children = new Map();
const restartHistory = new Map();
let stopping = false;
let captureRunning = false;
let observedSignature;
let stableObservations = 0;

await mkdir(join(root, 'logs'), { recursive: true });

function log(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), module: 'PreviewSnapshotSupervisor', event, ...detail })}\n`);
}

function portIsFree(port) {
  return new Promise((done) => {
    const probe = net.createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => done(true)));
  });
}

async function startSlot(slot) {
  if (!(await portIsFree(slot.port))) {
    log('port-occupied', { slot: slot.name, port: slot.port, action: 'not-terminated' });
    return;
  }
  const logStream = createWriteStream(join(root, 'logs', `${slot.name}-${slot.port}.log`), { flags: 'a' });
  const child = spawn(process.execPath, ['scripts/lan-preview-proxy.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, AOO_PREVIEW_SLOT: slot.name, AOO_LAN_PREVIEW_PORT: String(slot.port), AOO_PREVIEW_SNAPSHOT_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(slot.name, child);
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  log('slot-started', { slot: slot.name, port: slot.port, pid: child.pid });
  child.once('exit', (code, signal) => {
    children.delete(slot.name);
    logStream.end();
    if (stopping) return;
    const now = Date.now();
    const history = (restartHistory.get(slot.name) ?? []).filter((time) => now - time < 300000);
    history.push(now);
    restartHistory.set(slot.name, history);
    if (history.length > 3) {
      log('slot-restart-suppressed', { slot: slot.name, port: slot.port, code, signal, attemptsInFiveMinutes: history.length });
      return;
    }
    setTimeout(() => startSlot(slot), history.length * 2000).unref();
  });
}

function fetchText(path) {
  return new Promise((done, reject) => {
    const request = http.get(new URL(path, upstream), (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => response.statusCode === 200 ? done(Buffer.concat(chunks).toString('utf8')) : reject(new Error(`HTTP ${response.statusCode} ${path}`)));
    });
    request.setTimeout(3000, () => request.destroy(new Error(`timeout ${path}`)));
    request.on('error', reject);
  });
}

async function signature() {
  const values = await Promise.all([
    fetchText('/scripting/x/import-map.json'),
    fetchText('/scripting/import-map-global'),
    fetchText('/settings.js?scene=current_scene'),
  ]);
  return createHash('sha256').update(values.join('\n---aoo-generation---\n')).digest('hex');
}

async function runCapture(reason) {
  if (captureRunning) return;
  captureRunning = true;
  log('capture-started', { reason });
  const child = spawn(process.execPath, ['scripts/preview-snapshot-manager.mjs', 'capture'], {
    cwd: process.cwd(), env: { ...process.env, AOO_PREVIEW_SNAPSHOT_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const code = await new Promise((done) => child.once('exit', done));
  captureRunning = false;
  return code === 0;
}

async function watch() {
  try {
    const next = await signature();
    if (next === observedSignature) stableObservations += 1;
    else { observedSignature = next; stableObservations = 1; }
    let current;
    try { current = JSON.parse(await readFile(join(root, 'source-signature.json'), 'utf8')).signature; } catch { /* first healthy capture */ }
    if (stableObservations >= 2 && next !== current && !captureRunning) {
      const succeeded = await runCapture(current ? 'creator-generation-changed' : 'initial-snapshot');
      if (succeeded && existsSync(join(root, 'last-success.json'))) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(root, 'source-signature.json'), `${JSON.stringify({ signature: next, updatedAt: new Date().toISOString() })}\n`);
      }
    }
  } catch (error) {
    log('upstream-unavailable', { upstream: upstream.toString(), error: error.message, retainedPreviousSnapshot: true });
  }
}

for (const slot of slots) await startSlot(slot);
await watch();
const timer = setInterval(watch, 5000);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  clearInterval(timer);
  for (const child of children.values()) child.kill('SIGTERM');
  const deadline = setTimeout(() => process.exit(0), 3000);
  deadline.unref();
  if (children.size === 0) process.exit(0);
});
