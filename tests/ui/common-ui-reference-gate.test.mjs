import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
});
const assets = walk(path.join(root, 'assets'));
const sources = assets.filter((file) => file.endsWith('.ts'));

assert.equal(assets.filter((file) => file.endsWith('.manifest.json')).length, 0,
    'Legacy UI manifest fallback assets are forbidden');
for (const retired of [
    'assets/Club/Prefab/default', 'assets/Common/Prefab/common',
]) assert.equal(fs.existsSync(path.join(root, retired)), false, `retired duplicate prefab root: ${retired}`);

const adapters = new Set([
    'assets/Common/Code/Runtime/ui/LegacyPrefabRenderer.ts',
    'assets/Common/Code/Runtime/ui/LegacyFormManager.ts',
]);
for (const file of sources) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    const source = fs.readFileSync(file, 'utf8');
    if (!relative.includes('/CompatibilityApp/')) {
        assert.doesNotMatch(source, /CompatibilityApp\/(?:ui\/|core\/(?:LegacyAudioService|LegacyChatService|LegacyLocalDataStore|Storage)|navigation\/Route|platform\/(?:LegacyDownloadService|LegacyRemoteImageService))/,
            `${relative} imports a retired public compatibility implementation`);
    }
    if (!relative.startsWith('assets/Common/Code/UI/') && !adapters.has(relative)) {
        assert.doesNotMatch(source, /\.addComponent\s*\(\s*(?:ScrollView|PageView)\s*\)/,
            `${relative} dynamically constructs a native scrolling component outside UnifiedScroll`);
        assert.doesNotMatch(source, /ScrollView\.EventType\.(?:SCROLL_TO_BOTTOM|SCROLL_ENDED)/,
            `${relative} binds scrolling outside ScrollEvents`);
    }
}

console.log('common UI reference gate passed: no manifests, duplicate prefab roots, or production legacy public UI references');
