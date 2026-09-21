import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';

const root = resolve(process.env.AOO_STATIC_BUILD_ROOT ?? 'work/fw004-static-build-final4/web-mobile');
const logRoot = resolve(process.env.AOO_STATIC_LOG_ROOT ?? 'work/fw003-static-runtime/logs');
const slots = (process.env.AOO_STATIC_SLOTS ?? 'A:7458,B:7459,C:5188,D:7461').split(',').map((pair) => {
  const [name, rawPort] = pair.split(':');
  return { name, port: Number(rawPort) };
});
const children = new Map();
const restarts = new Map();
let stopping = false;

await mkdir(logRoot, { recursive: true });

function log(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), module: 'StaticBuildSupervisor', event, root, ...detail })}\n`);
}

function portIsFree(port) {
  return new Promise((done) => {
    const probe = net.createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => done(true)));
  });
}

async function start(slot) {
  if (!(await portIsFree(slot.port))) {
    log('port-occupied', { slot: slot.name, port: slot.port, action: 'not-terminated' });
    return;
  }
  const output = createWriteStream(join(logRoot, `${slot.name}-${slot.port}.log`), { flags: 'a' });
  const child = spawn(process.execPath, ['scripts/static-build-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, AOO_STATIC_BUILD_ROOT: root, AOO_STATIC_SLOT: slot.name, AOO_STATIC_PORT: String(slot.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.set(slot.name, child);
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  log('slot-started', { slot: slot.name, port: slot.port, pid: child.pid });
  child.once('exit', (code, signal) => {
    children.delete(slot.name);
    output.end();
    if (stopping) return;
    const now = Date.now();
    const recent = (restarts.get(slot.name) ?? []).filter((time) => now - time < 300000);
    recent.push(now);
    restarts.set(slot.name, recent);
    if (recent.length > 3) {
      log('slot-restart-suppressed', { slot: slot.name, port: slot.port, code, signal, attemptsInFiveMinutes: recent.length });
      return;
    }
    setTimeout(() => start(slot), recent.length * 2000).unref();
  });
}

for (const slot of slots) await start(slot);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  for (const child of children.values()) child.kill('SIGTERM');
  const deadline = setTimeout(() => process.exit(0), 3000);
  deadline.unref();
  if (children.size === 0) process.exit(0);
});
