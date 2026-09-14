import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = fileURLToPath(new URL('../../assets/', import.meta.url));

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

const all = await files(assets);
const serialized = all.filter(path => ['.prefab', '.scene'].includes(extname(path)));
const sources = all.filter(path => extname(path) === '.ts');
const metas = all.filter(path => extname(path) === '.meta');
const failures = [];

const authority = fileURLToPath(new URL('../../assets/Common/Code/UI/', import.meta.url));
const required = [
  'UnifiedScroll', 'VirtualList', 'Pagination', 'GuardedButton', 'PopupStack', 'OverlayCenter',
  'RedDot', 'TabSelection', 'UnifiedInput', 'CountdownLabel', 'AvatarView', 'CurrencyBar',
  'RequestState', 'AssetLoader', 'SoundCenter', 'SettingsStore', 'ChatCenter', 'BackKeyRouter',
  'SafeAreaAdapter', 'NodePool', 'UiEventBus', 'ScopedUiController',
];
const uiText = (await Promise.all((await files(authority)).filter(path => path.endsWith('.ts')).map(path => readFile(path, 'utf8')))).join('\n');
for (const name of required) {
  const definitions = [...uiText.matchAll(new RegExp(`(?:class|interface)\\s+${name}\\b`, 'g'))].length;
  if (definitions !== 1) failures.push(`authority ${name} has ${definitions} definitions`);
}

for (const path of sources) {
  const text = await readFile(path, 'utf8');
  const rel = relative(root, path);
  if (/LoopScrollView2?|cc\.v2\.|_N\$bounceDuration/.test(text)) failures.push(`${rel}: Creator 2.x scroll implementation/reference`);
  if (!path.startsWith(authority)) {
    for (const name of required) if (new RegExp(`(?:class|interface)\\s+${name}\\b`).test(text)) failures.push(`${rel}: duplicates ${name}`);
  }
}

let scrollCount = 0;
for (const path of serialized) {
  const text = await readFile(path, 'utf8');
  const rel = relative(root, path);
  scrollCount += [...text.matchAll(/"__type__"\s*:\s*"cc\.ScrollView"/g)].length;
  if (/"_bounceDuration"\s*:\s*(?!0\.23\b)[\d.]+/.test(text)) failures.push(`${rel}: noncanonical ScrollView bounceDuration`);
  if (/"_elastic"\s*:\s*false/.test(text)) failures.push(`${rel}: noncanonical ScrollView elastic policy`);
}
assert.ok(scrollCount > 0, 'scan did not find serialized ScrollViews');

const uuids = new Map();
for (const path of metas) {
  const text = await readFile(path, 'utf8');
  const uuid = /"uuid"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  if (!uuid) continue;
  const previous = uuids.get(uuid);
  if (previous) failures.push(`duplicate meta UUID ${uuid}: ${relative(root, previous)}, ${relative(root, path)}`);
  uuids.set(uuid, path);
}

for (const path of (await files(authority)).filter(path => path.endsWith('.ts'))) {
  if (!metas.includes(`${path}.meta`)) failures.push(`${relative(root, path)}: missing meta`);
}

assert.deepEqual(failures, [], failures.join('\n'));
console.log(`common component gate passed: ${required.length} authorities, ${scrollCount} native ScrollViews, ${uuids.size} UUIDs`);
