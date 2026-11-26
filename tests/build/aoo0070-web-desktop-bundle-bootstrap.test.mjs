import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const clientRoot = new URL('../../', import.meta.url);

async function productionBootstrap(platform) {
    const url = new URL(`build-templates/${platform}/bundle-script-bootstrap.js`, clientRoot);
    return { source: await readFile(url, 'utf8'), filename: url.pathname };
}

async function harness(platform, bundles, { httpStatus = 200 } = {}) {
    const appended = [];
    const requests = [];
    const logs = [];
    const { source, filename } = await productionBootstrap(platform);
    const window = {};
    const context = vm.createContext({
        window,
        Promise,
        Error,
        JSON,
        encodeURIComponent,
        fetch: async (url, options) => {
            requests.push({ url, options });
            return {
                ok: httpStatus >= 200 && httpStatus < 300,
                status: httpStatus,
                json: async () => ({ assets: { projectBundles: bundles } }),
            };
        },
        document: {
            createElement: (tag) => ({ tag }),
            head: { appendChild: (script) => appended.push(script) },
        },
        console: { info: (...args) => logs.push(args), error: () => {} },
    });
    vm.runInContext(source, context, { filename });
    assert.equal(typeof window.aooRegisterProjectBundleScripts, 'function');
    return { appended, logs, requests, window };
}

async function waitForScripts(appended, count) {
    for (let attempt = 0; attempt < 20 && appended.length !== count; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(appended.length, count);
}

test('desktop and mobile execute their tracked project-bundle registration boundary', async () => {
    const desktop = await harness('web-desktop', ['internal', 'main', 'lobby east']);
    let desktopComplete = false;
    const desktopRun = desktop.window.aooRegisterProjectBundleScripts().then(() => { desktopComplete = true; });
    await waitForScripts(desktop.appended, 2);
    assert.equal(desktop.requests.length, 1);
    assert.equal(desktop.requests[0].url, 'src/settings.json');
    assert.equal(desktop.requests[0].options.cache, 'no-store');
    assert.deepEqual(desktop.appended.map((script) => script.src), [
        'assets/main/index.js',
        'assets/lobby%20east/index.js',
    ]);
    desktop.appended[0].onload();
    await Promise.resolve();
    assert.equal(desktopComplete, false, 'Promise.all must wait for every production script registration');
    desktop.appended[1].onload();
    await desktopRun;
    assert.deepEqual(Array.from(desktop.window.__aooProjectBundles), ['main', 'lobby east']);

    const mobile = await harness('web-mobile', ['internal', 'main', 'lobby east']);
    const mobileRun = mobile.window.aooRegisterProjectBundleScripts();
    await waitForScripts(mobile.appended, 1);
    assert.equal(mobile.requests.length, 1);
    assert.equal(mobile.requests[0].url, 'src/settings.json');
    assert.equal(mobile.requests[0].options.cache, 'no-store');
    assert.deepEqual(mobile.appended.map((script) => script.src), ['assets/lobby%20east/index.js']);
    mobile.appended[0].onload();
    await mobileRun;
    assert.equal(mobile.window.__aooProjectBundles, undefined);
});

test('production registration rejects HTTP and script failures', async () => {
    const httpFailure = await harness('web-desktop', ['main'], { httpStatus: 503 });
    await assert.rejects(
        httpFailure.window.aooRegisterProjectBundleScripts(),
        /settings request failed: 503/,
    );
    assert.equal(httpFailure.appended.length, 0);

    const scriptFailure = await harness('web-desktop', ['main']);
    const run = scriptFailure.window.aooRegisterProjectBundleScripts();
    await waitForScripts(scriptFailure.appended, 1);
    scriptFailure.appended[0].onerror();
    await assert.rejects(run, /failed to register assets\/main\/index\.js/);
});
