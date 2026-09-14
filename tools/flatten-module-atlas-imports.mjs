import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const modulesRoot = path.resolve(import.meta.dirname, '../assets/Modules');
const clientRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(clientRoot, 'work/module-atlas-localization.json');

function walk(directory, output = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target, output);
        else output.push(target);
    }
    return output;
}

function shortHash(value) {
    return crypto.createHash('sha1').update(value).digest('hex').slice(0, 9);
}

let moved = 0;
for (const moduleEntry of fs.readdirSync(modulesRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const atlasRoot = path.join(modulesRoot, moduleEntry.name, 'Atlas');
    const importedRoot = path.join(atlasRoot, 'Imported');
    if (!fs.existsSync(importedRoot)) continue;

    const assets = walk(importedRoot).filter(file => !file.endsWith('.meta'));
    for (const source of assets) {
        const relative = path.relative(importedRoot, source);
        const extension = path.extname(source);
        const basename = path.basename(source, extension);
        let destination = path.join(atlasRoot, `${basename}${extension}`);
        if (fs.existsSync(destination)) {
            destination = path.join(atlasRoot, `${shortHash(relative)}-${basename}${extension}`);
        }
        if (fs.existsSync(destination)) {
            throw new Error(`目标图片冲突，拒绝覆盖: ${destination}`);
        }
        fs.renameSync(source, destination);
        fs.renameSync(`${source}.meta`, `${destination}.meta`);
        moved += 1;
    }

    for (const directory of walk(importedRoot).filter(file => file.endsWith('.meta'))) {
        if (fs.existsSync(directory)) fs.unlinkSync(directory);
    }
    fs.rmSync(importedRoot, { recursive: true });
    if (fs.existsSync(`${importedRoot}.meta`)) fs.unlinkSync(`${importedRoot}.meta`);
}

if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.assets = fs.readdirSync(modulesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => {
            const atlasRoot = path.join(modulesRoot, entry.name, 'Atlas');
            if (!fs.existsSync(atlasRoot)) return [];
            return walk(atlasRoot)
                .filter(file => !file.endsWith('.meta'))
                .map(file => ({ module: entry.name, destination: path.relative(clientRoot, file) }));
        });
    manifest.generatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({ moved }, null, 2));
