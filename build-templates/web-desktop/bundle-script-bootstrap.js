(function () {
  'use strict';

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('[BundleScriptBootstrap] failed to register ' + url));
      };
      document.head.appendChild(script);
    });
  }

  async function registerProjectBundleScripts() {
    var response = await fetch('src/settings.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('[BundleScriptBootstrap] settings request failed: ' + response.status);
    }
    var settings = await response.json();
    var bundles = settings.assets && Array.isArray(settings.assets.projectBundles)
      ? settings.assets.projectBundles
      : [];
    var registrations = bundles.filter(function (bundle) {
      return bundle !== 'internal';
    });
    // Keep Creator's mandatory main preload while extending the preload set.
    // Registering scripts only makes SystemJS modules discoverable; loading the
    // bundle config is what installs its scene table and executes its root.
    var preloads = registrations.slice();
    await Promise.all(registrations.map(function (bundle) {
      return loadScript('assets/' + encodeURIComponent(bundle) + '/index.js');
    }));
    window.__aooProjectBundles = preloads.slice();
    console.info('[BundleScriptBootstrap]', JSON.stringify({
      phase: 'registered', bundleCount: registrations.length, bundles: registrations,
    }));
  }

  window.aooRegisterProjectBundleScripts = registerProjectBundleScripts;
})();
