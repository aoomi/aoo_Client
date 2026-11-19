import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import test from 'node:test';

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function readHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { return await fetch('http://127.0.0.1:7462/__aoo/health').then((response) => response.json()); }
    catch { await delay(100); }
  }
  throw new Error('temporary snapshot worker did not start');
}

test('static snapshot remains healthy while API/WS dependency recovers independently', async (context) => {
  const worker = spawn(process.execPath, ['scripts/lan-preview-proxy.mjs'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: {
      ...process.env, AOO_PREVIEW_SLOT: 'A', AOO_LAN_PREVIEW_PORT: '7462',
      AOO_PREVIEW_API_URL: 'http://127.0.0.1:16553/',
      AOO_PREVIEW_HALL_WS_URL: 'ws://127.0.0.1:16553/api/v2/gateway/ws',
      AOO_PREVIEW_GAME_WS_URL: 'ws://127.0.0.1:16553/api/v2/gateway/ws',
    }, stdio: 'ignore',
  });
  context.after(() => worker.kill('SIGTERM'));
  const interrupted = await readHealth();
  assert.equal(interrupted.staticResources.ok, true);
  assert.equal(interrupted.api.ok, false);
  assert.equal(interrupted.hallWs.ok, false);
  assert.equal(interrupted.gameWs.ok, false);
  const dependency = net.createServer((socket) => socket.end());
  await new Promise((done) => dependency.listen(16553, '127.0.0.1', done));
  context.after(() => dependency.close());
  const recovered = await readHealth();
  assert.equal(recovered.staticResources.ok, true);
  assert.equal(recovered.api.ok, true);
  assert.equal(recovered.hallWs.ok, true);
  assert.equal(recovered.gameWs.ok, true);
});
