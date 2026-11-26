import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_LOCAL_PREVIEW_CONFIG,
    bootstrapScript,
    buildLauncherProcessSpec,
    isApprovedBootstrapRequest,
    parseLauncherArguments,
    resolveLocalPreviewConfig,
} from '../../tools/local-preview-login.mjs';

const tool = fileURLToPath(new URL('../../tools/local-preview-login.mjs', import.meta.url));

test('default local preview tuple is isolated and all runtime URLs share it', () => {
    const config = resolveLocalPreviewConfig();
    assert.deepEqual(
        Object.fromEntries(Object.keys(DEFAULT_LOCAL_PREVIEW_CONFIG).map((key) => [key, config[key]])),
        DEFAULT_LOCAL_PREVIEW_CONFIG,
    );
    assert.equal(config.pageOrigin, 'http://127.0.0.1:5173');
    assert.equal(config.apiOrigin, 'http://127.0.0.1:18760/');
    assert.equal(config.webSocketUrl, 'ws://127.0.0.1:18760/api/v2/gateway/ws');
    assert.equal(config.issuerUrl, 'http://127.0.0.1:18762/bootstrap.js');
    assert.equal(config.avatarBaseUrl, 'http://127.0.0.1:18765/');
    assert.equal(config.debugUrl, 'http://127.0.0.1:18766/');
});

test('explicit tuple drives request policy, runtime bootstrap and child process plan', () => {
    const args = ['--enable-local-preview', '--descriptor', '/private/preview/grant.json',
        '--bind-host', '127.0.0.1', '--page-port', '15173', '--api-port', '28760',
        '--issuer-port', '28762', '--avatar-port', '28765', '--debug-port', '28766', '--dry-run'];
    const command = parseLauncherArguments(args);
    const request = { method: 'GET', url: '/bootstrap.js', headers: {
        host: '127.0.0.1:28762', referer: 'http://127.0.0.1:15173/', origin: 'http://127.0.0.1:15173',
        'sec-fetch-dest': 'script', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site',
    } };
    assert.equal(isApprovedBootstrapRequest(request, command.config), true);
    assert.equal(isApprovedBootstrapRequest({ ...request, headers: { ...request.headers, host: '127.0.0.1:18662' } }, command.config), false);
    const script = bootstrapScript('ticket', 'device', command.config);
    assert.match(script, /http:\/\/127\.0\.0\.1:28760\//);
    assert.match(script, /http:\/\/127\.0\.0\.1:28765\//);
    assert.doesNotMatch(script, /localhost:18660|localhost:7456|127\.0\.0\.1:18662/);
    const spec = buildLauncherProcessSpec(command);
    assert.equal(spec.executable, process.execPath);
    assert.ok(spec.argv.includes('28762'));
    assert.equal(spec.env.AOO_LOCAL_PREVIEW_API_ORIGIN, command.config.apiOrigin);
    assert.equal(spec.env.AOO_LOCAL_PREVIEW_WS_URL, command.config.webSocketUrl);
    assert.equal(spec.env.AOO_LOCAL_PREVIEW_DEBUG_URL, command.config.debugUrl);
});

test('configuration rejects wildcard, reserved, duplicate, non-numeric and out-of-range values', () => {
    for (const bindHost of ['0.0.0.0', '::', '*', 'localhost', '192.168.1.2']) {
        assert.throws(() => resolveLocalPreviewConfig({ bindHost }), /BIND_HOST_MUST_BE_LOOPBACK/);
    }
    for (const pagePort of [7456, 7457, 7459, 7460, 7461, 7462, 5188, 18662]) {
        assert.throws(() => resolveLocalPreviewConfig({ pagePort }), /RESERVED/);
    }
    for (const pagePort of ['abc', 0, 1023, 65536, 1.5]) {
        assert.throws(() => resolveLocalPreviewConfig({ pagePort }), /INVALID/);
    }
    assert.throws(() => resolveLocalPreviewConfig({ pagePort: 18760 }), /PORT_CONFLICT/);
    assert.throws(() => resolveLocalPreviewConfig({ unexpected: true }), /CONFIG_UNKNOWN/);
});

test('dry-run exits without opening a listener or leaving a child process', async () => {
    const before = process._getActiveHandles().length;
    const run = spawnSync('/Users/aoo/.cache/node/v24.19.0/bin/node', [tool, '--enable-local-preview',
        '--descriptor', '/private/preview/grant.json', '--page-port', '15173', '--api-port', '28760',
        '--issuer-port', '28762', '--avatar-port', '28765', '--debug-port', '28766', '--dry-run'], {
        encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.signal, null);
    const report = JSON.parse(run.stdout);
    assert.equal(report.status, 'DRY_RUN');
    assert.equal(report.config.issuerPort, 28762);
    assert.equal(process._getActiveHandles().length, before);
});
