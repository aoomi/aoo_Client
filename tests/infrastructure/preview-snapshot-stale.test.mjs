import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { return await fetch(`http://127.0.0.1:${port}/__aoo/health`).then((response) => response.json()); }
    catch { await new Promise((done) => setTimeout(done, 50)); }
  }
  throw new Error('preview proxy did not become ready');
}

test('stale snapshot is fail-closed and expired build URLs are rejected', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'aoo-preview-stale-'));
  const buildId = 'aaaaaaaaaaaaaaaaaaaa';
  const snapshot = join(root, 'snapshots', buildId);
  await mkdir(join(snapshot, 'objects'), { recursive: true });
  const body = Buffer.from('<!doctype html><title>current</title>');
  const object = 'root-object';
  await writeFile(join(snapshot, 'objects', object), body);
  await writeFile(join(snapshot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1, buildId, sourceSignature: 'source-a',
    entries: [{ key: '/', object, status: 200, bytes: body.length, contentType: 'text/html; charset=utf-8' }], bytes: body.length,
  })}\n`);
  await mkdir(join(root, 'slots', 'A'), { recursive: true });
  await symlink(snapshot, join(root, 'slots', 'A', 'current'));
  await writeFile(join(root, 'stale.json'), `${JSON.stringify({ status: 'STALE', reason: 'test' })}\n`);
  const port = 17000 + Math.floor(Math.random() * 500);
  const worker = spawn(process.execPath, ['scripts/lan-preview-proxy.mjs'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, AOO_PREVIEW_SLOT: 'A', AOO_LAN_PREVIEW_PORT: String(port), AOO_PREVIEW_SNAPSHOT_ROOT: root,
      AOO_PREVIEW_API_URL: 'http://127.0.0.1:1/', AOO_PREVIEW_HALL_WS_URL: 'ws://127.0.0.1:1/', AOO_PREVIEW_GAME_WS_URL: 'ws://127.0.0.1:1/' },
    stdio: 'ignore',
  });
  context.after(async () => { worker.kill('SIGTERM'); await rm(root, { recursive: true, force: true }); });

  const staleHealth = await waitForHealth(port);
  assert.equal(staleHealth.ok, false);
  assert.equal(staleHealth.status, 'STALE');
  const staleResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(staleResponse.status, 503);
  assert.equal((await staleResponse.json()).code, 'PREVIEW_SNAPSHOT_STALE');

  await rm(join(root, 'stale.json'), { force: true });
  const expiredResponse = await fetch(`http://127.0.0.1:${port}/__aoo/build/bbbbbbbbbbbbbbbbbbbb/r3/`);
  assert.equal(expiredResponse.status, 410);
  assert.equal((await expiredResponse.json()).code, 'PREVIEW_BUILD_EXPIRED');
});
