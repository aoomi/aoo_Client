import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scenePath = new URL('../../assets/Login/Scenes/BootStrap.scene', import.meta.url);
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

test('Bootstrap is a native editable 1280x720 scene with the required states', () => {
  const nodes = scene.filter((item) => item.__type__ === 'cc.Node');
  const names = new Set(nodes.map((item) => item._name));
  for (const name of ['Canvas', 'Camera', 'Background', 'Logo', 'ProgressTrack', 'ProgressFill', 'ProgressPercent', 'BootstrapStatus', 'VersionLabel', 'HealthText', 'ErrorPanel', 'ErrorMessage', 'Btn_Retry']) {
    assert.ok(names.has(name), `missing native node ${name}`);
  }
  const canvas = scene.find((item) => item.__type__ === 'cc.UITransform' && scene[item.node.__id__]?._name === 'Canvas');
  assert.deepEqual(canvas._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 });
  assert.equal(scene.filter((item) => item.__type__ === '7386d+/6hBPO43r+g1sdJ8A').length, 1);
});

test('Bootstrap contains only Login bootstrap visual resources', () => {
  const text = JSON.stringify(scene);
  assert.doesNotMatch(text, /assets\/(Lobby|Club|Games)/);
  const sprites = scene.filter((item) => item.__type__ === 'cc.Sprite' && item._spriteFrame);
  assert.equal(sprites.length, 4);
  for (const sprite of sprites) assert.match(sprite._spriteFrame.__uuid__, /^(0411f627-545e-4a0c-8c28-0bb2c07c8e4a|d9dd46e6-0d6d-43ff-a2cb-9edf6573c16f)@/);
});

test('Bootstrap runtime hands off to the unique LoginScene after real checks', () => {
  const source = fs.readFileSync(new URL('../../assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts', import.meta.url), 'utf8');
  assert.match(source, /routeResult !== 'LOGIN_REQUIRED'/);
  assert.match(source, /sceneName === 'BootStrap'/);
  assert.doesNotMatch(source, /loadBootstrapBundle\(\s*'common-prefab'/);
  assert.match(source, /login-bundle:skipped/);
  assert.match(source, /assetManager\.loadBundle\(bundleName/);
  assert.doesNotMatch(source, /common-atlas|common-(?:longcard|mahjong|poker|wordcard)[_-]cards/);
  assert.match(source, /director\.preloadScene\('LoginScene'/);
  assert.match(source, /director\.loadScene\('LoginScene'/);
  assert.match(source, /withTimeout\([\s\S]*10_000/);
  assert.match(source, /withTimeout\([\s\S]*12_000/);
  assert.match(source, /withTimeout\([\s\S]*15_000/);
  assert.match(source, /total > 0 \? Math\.min\(1, completed \/ total\) : 0/);
  assert.match(source, /bootstrapBlocked/);
  assert.match(source, /Math\.max\(this\.bootstrapProgress, safeProgress\)/);
  assert.doesNotMatch(source, /mock|skipVersion|bypass/i);
  assert.match(source, /setBootstrapStatus\('版本与服务器检查完成', 0\.35\)/);
});

test('canonical WebSocket validation is stable in Creator loose web builds', () => {
  const source = fs.readFileSync(new URL('../../assets/Common/Code/Runtime/network/GatewayEntryPolicy.ts', import.meta.url), 'utf8');
  assert.match(source, /Array\.from\(url\.searchParams\.keys\(\)\)/);
  assert.doesNotMatch(source, /\[\.\.\.url\.searchParams\.keys\(\)\]/);
});
