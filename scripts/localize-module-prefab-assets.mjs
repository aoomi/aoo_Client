#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = new URL('../', import.meta.url).pathname;

const jobs = [
    {
        prefab: 'assets/Modules/Navigation/Prefab/ModalTopBar.prefab',
        atlas: 'assets/Modules/Navigation/Atlas',
        sources: [
            'assets/Common/Atlas/c759a13c3-btn_zs02.png',
            'assets/Common/Atlas/img_zs.png',
            'assets/Common/Atlas/img_+.png',
            'assets/Common/Atlas/cbec1f192-icon_qk.png',
            'assets/Common/Atlas/img_qk.png',
            'assets/Common/Atlas/img_ld.png',
            'assets/Common/Atlas/img_dou.png',
            'assets/Common/Atlas/img_bjl_tb.png',
            'assets/Common/Atlas/ca176e6ae-btn_fh.png',
            'assets/Common/Atlas/img_txk02.png',
            'assets/Common/Atlas/c7c0f9341-morentouxiang.png',
            'assets/Common/Atlas/img_bjl_shang.png',
        ],
        systemFonts: ['c4bc232f-5254-42ab-86f3-6f8eba14c44f'],
    },
    {
        prefab: 'assets/Modules/Store/Prefab/Store.prefab',
        atlas: 'assets/Modules/Store/Atlas',
        sources: [
            'assets/Common/Atlas/default_scrollbar_vertical.png',
            'assets/Common/Atlas/default_scrollbar_vertical_bg.png',
        ],
        systemFonts: ['df416b28-b1a8-437d-bb1f-421f8cf2fd25'],
    },
];

function replaceMetaUuids(value, mapping) {
    if (Array.isArray(value)) return value.map((item) => replaceMetaUuids(item, mapping));
    if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) value[key] = replaceMetaUuids(item, mapping);
        return value;
    }
    if (typeof value !== 'string') return value;
    const match = value.match(/^([0-9a-f-]{36})(@.+)?$/i);
    if (!match) return value;
    if (!mapping.has(match[1])) mapping.set(match[1], randomUUID());
    return mapping.get(match[1]) + (match[2] ?? '');
}

function replacePrefabRefs(value, mapping, systemFonts) {
    if (Array.isArray(value)) return value.map((item) => replacePrefabRefs(item, mapping, systemFonts));
    if (value && typeof value === 'object') {
        if (typeof value.__uuid__ === 'string' && systemFonts.has(value.__uuid__.split('@')[0])) return null;
        for (const [key, item] of Object.entries(value)) value[key] = replacePrefabRefs(item, mapping, systemFonts);
        return value;
    }
    if (typeof value !== 'string') return value;
    const match = value.match(/^([0-9a-f-]{36})(@.+)?$/i);
    return match && mapping.has(match[1]) ? mapping.get(match[1]) + (match[2] ?? '') : value;
}

for (const job of jobs) {
    const mapping = new Map();
    const atlas = join(root, job.atlas);
    await mkdir(atlas, { recursive: true });
    for (const source of job.sources) {
        const sourcePath = join(root, source);
        const targetPath = join(atlas, basename(sourcePath));
        let previousSpriteUuids = [];
        try {
            const previous = JSON.parse(await readFile(`${targetPath}.meta`, 'utf8'));
            previousSpriteUuids = Object.values(previous.subMetas ?? {})
                .filter((item) => item && typeof item === 'object' && (item.importer === '*' || Number.isFinite(item.rawWidth)))
                .map((item) => item.uuid)
                .filter(Boolean);
        } catch {}
        const meta = JSON.parse(await readFile(`${sourcePath}.meta`, 'utf8'));
        const sourceSpriteUuids = Object.values(meta.subMetas ?? {})
            .filter((item) => item && typeof item === 'object' && (item.importer === '*' || Number.isFinite(item.rawWidth)))
            .map((item) => item.uuid)
            .filter(Boolean);
        replaceMetaUuids(meta, mapping);
        for (const uuid of sourceSpriteUuids) mapping.set(uuid, `${meta.uuid}@f9941`);
        for (const uuid of previousSpriteUuids) mapping.set(uuid, `${meta.uuid}@f9941`);
        await copyFile(sourcePath, targetPath);
        await writeFile(`${targetPath}.meta`, `${JSON.stringify(meta, null, 2)}\n`);
    }
    const prefabPath = join(root, job.prefab);
    const prefab = JSON.parse(await readFile(prefabPath, 'utf8'));
    replacePrefabRefs(prefab, mapping, new Set(job.systemFonts));
    await writeFile(prefabPath, `${JSON.stringify(prefab, null, 2)}\n`);
    console.log(`${job.prefab}: localized ${job.sources.length} assets`);
}
