#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(process.cwd());
const assetRoot = resolve(projectRoot, 'assets');
const ledgerPath = resolve(projectRoot, '../Server/work/prefab-flattening/prefab-migration-ledger.tsv');
const dynamicReferencePath = resolve(projectRoot, '../Server/work/prefab-flattening/prefab-old-dynamic-path-references.tsv');
const excludedRoot = resolve(assetRoot, 'Lobby/Prefab/uiGame');
const roots = [
  resolve(assetRoot, 'Club/Prefab'),
  resolve(assetRoot, 'Games/Common/Prefab'),
  resolve(assetRoot, 'Games/Mahjong/Packs/Pack01/Prefab'),
  resolve(assetRoot, 'Games/Poker/Packs/Pack01/Prefab'),
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile() && entry.name.endsWith('.prefab')) files.push(absolute);
  }
  return files;
}

function pascalPart(value) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join('');
}

function uuidOf(prefab) {
  const meta = `${prefab}.meta`;
  if (!existsSync(meta)) return '';
  return JSON.parse(readFileSync(meta, 'utf8')).uuid ?? '';
}

function textFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'library' || entry.name === 'temp' || entry.name === 'build' || entry.name === 'node_modules') continue;
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) textFiles(absolute, files);
    else if (entry.isFile() && /\.(?:prefab|scene|ts|js|mjs|json|yaml|yml)$/i.test(entry.name)) files.push(absolute);
  }
  return files;
}

const searchableContent = textFiles(projectRoot).map((file) => ({
  file,
  content: readFileSync(file, 'utf8'),
}));

function countReferences(uuid) {
  if (!uuid) return 0;
  return searchableContent.reduce((total, item) => total + (item.content.match(new RegExp(uuid, 'g'))?.length ?? 0), 0);
}

const rows = [];
const namesByRoot = new Map();
for (const root of roots) {
  for (const source of walk(root)) {
    const nested = relative(root, source);
    if (!nested.includes(sep)) continue;
    const relativeNoExtension = nested.slice(0, -'.prefab'.length);
    const targetName = `${relativeNoExtension.split(sep).map(pascalPart).join('')}.prefab`;
    const target = resolve(root, targetName);
    const nameKey = `${root}\u0000${targetName}`;
    namesByRoot.set(nameKey, (namesByRoot.get(nameKey) ?? 0) + 1);
    rows.push({ root, source, target, targetName, uuid: uuidOf(source) });
  }
}

const conflicts = rows.filter((row) => namesByRoot.get(`${row.root}\u0000${row.targetName}`) > 1 || existsSync(row.target));
const header = 'module\toriginalPath\ttargetPath\tuuid\treferenceCount\tconflict\n';
const body = rows
  .sort((a, b) => a.source.localeCompare(b.source))
  .map((row) => [
    relative(assetRoot, row.root),
    relative(projectRoot, row.source),
    relative(projectRoot, row.target),
    row.uuid,
    countReferences(row.uuid),
    conflicts.includes(row) ? 'YES' : '',
  ].join('\t'))
  .join('\n');

function removeEmptyDirectories(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = resolve(dir, entry.name);
    removeEmptyDirectories(child);
    const childEntries = readdirSync(child).filter((name) => name !== '.DS_Store' && !name.endsWith('.meta'));
    if (childEntries.length === 0) {
      rmdirSync(child);
      if (existsSync(`${child}.meta`)) unlinkSync(`${child}.meta`);
    }
  }
}

function removeOrphanDirectoryMetas(dir, removed = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) removeOrphanDirectoryMetas(absolute, removed);
    else if (entry.isFile() && entry.name.endsWith('.meta')) {
      const assetPath = absolute.slice(0, -'.meta'.length);
      if (!existsSync(assetPath)) {
        unlinkSync(absolute);
        removed.push(absolute);
      }
    }
  }
  return removed;
}

if (process.argv.includes('--plan')) {
  const outputDirectory = dirname(ledgerPath);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(ledgerPath, `${header}${body}\n`);
  console.log(JSON.stringify({ ledgerPath, moves: rows.length, conflicts: conflicts.length, excludedRoot: relative(assetRoot, excludedRoot) }));
} else if (process.argv.includes('--apply')) {
  if (conflicts.length > 0) throw new Error(`Refusing move because ${conflicts.length} target names conflict`);
  for (const row of rows) {
    if (!existsSync(row.source) || !existsSync(`${row.source}.meta`)) throw new Error(`Missing prefab or meta: ${row.source}`);
    renameSync(row.source, row.target);
    renameSync(`${row.source}.meta`, `${row.target}.meta`);
  }
  for (const root of roots) removeEmptyDirectories(root);
  console.log(JSON.stringify({ moved: rows.length, excludedRoot: relative(assetRoot, excludedRoot) }));
} else if (process.argv.includes('--verify')) {
  const ledgerRows = readFileSync(ledgerPath, 'utf8').trim().split('\n').slice(1).map((line) => {
    const [module, originalPath, targetPath, uuid] = line.split('\t');
    return { module, originalPath, targetPath, uuid };
  });
  const nested = roots.flatMap((root) => walk(root).filter((file) => relative(root, file).includes(sep)));
  const uuidErrors = ledgerRows.filter((row) => !existsSync(resolve(projectRoot, row.targetPath)) || uuidOf(resolve(projectRoot, row.targetPath)) !== row.uuid);
  const dynamicSources = textFiles(projectRoot).filter((file) => !file.includes(`${sep}work${sep}`) && !file.includes(`${sep}docs${sep}`) && !file.includes(`${sep}development${sep}`) && file !== resolve(projectRoot, 'scripts/flatten-prefab-directories.mjs'));
  const dynamicHits = [];
  for (const file of dynamicSources) {
    const content = readFileSync(file, 'utf8');
    for (const row of ledgerRows) {
      const original = row.originalPath.replace(/^assets\//, '');
      const target = row.targetPath.replace(/^assets\//, '');
      const originalNoExtension = original.slice(0, -'.prefab'.length);
      const rootRelative = original.slice(original.indexOf('/Prefab/') + '/Prefab/'.length);
      const rootRelativeNoExtension = rootRelative.slice(0, -'.prefab'.length);
      for (const candidate of [original, originalNoExtension, rootRelative, rootRelativeNoExtension]) {
        if (candidate && content.includes(candidate)) dynamicHits.push({ file: relative(projectRoot, file), oldPath: candidate, targetPath: target });
      }
    }
  }
  const dynamicHeader = 'file\toldPath\ttargetPath\n';
  writeFileSync(dynamicReferencePath, dynamicHeader + dynamicHits.map((hit) => `${hit.file}\t${hit.oldPath}\t${hit.targetPath}`).join('\n') + (dynamicHits.length ? '\n' : ''));
  console.log(JSON.stringify({ nestedPrefabs: nested.length, uuidErrors: uuidErrors.length, dynamicOldPathReferences: dynamicHits.length, dynamicReferencePath, excludedRoot: relative(assetRoot, excludedRoot) }));
} else if (process.argv.includes('--rewrite-path-map')) {
  const mapPath = resolve(assetRoot, 'Common/Config/NativeMaps/prefab-path-map.json');
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const ledgerRows = readFileSync(ledgerPath, 'utf8').trim().split('\n').slice(1).map((line) => {
    const [, originalPath, targetPath] = line.split('\t');
    return { originalPath, targetPath };
  });
  const rewritten = {};
  for (const [key, value] of Object.entries(map)) {
    let nextKey = key;
    for (const row of ledgerRows) {
      const original = row.originalPath.replace(/^assets\//, '');
      const rootRelative = original.slice(original.indexOf('/Prefab/') + '/Prefab/'.length);
      if (!nextKey.endsWith(rootRelative)) continue;
      const targetFile = row.targetPath.slice(row.targetPath.lastIndexOf('/') + 1);
      nextKey = `${nextKey.slice(0, nextKey.length - rootRelative.length)}${targetFile}`;
      break;
    }
    if (Object.hasOwn(rewritten, nextKey)) throw new Error(`Prefab path map collision: ${nextKey}`);
    rewritten[nextKey] = value;
  }
  writeFileSync(mapPath, `${JSON.stringify(rewritten, null, 2)}\n`);
  console.log(JSON.stringify({ rewrittenEntries: Object.keys(rewritten).length, mapPath }));
} else if (process.argv.includes('--cleanup')) {
  const removedMetas = roots.flatMap((root) => removeOrphanDirectoryMetas(root));
  for (const root of roots) removeEmptyDirectories(root);
  const removedAfterDirectoryCleanup = roots.flatMap((root) => removeOrphanDirectoryMetas(root));
  const staleLobbyRoot = resolve(assetRoot, 'Lobby/Prefab/uiGame-001');
  if (existsSync(staleLobbyRoot)) {
    removeOrphanDirectoryMetas(staleLobbyRoot);
    removeEmptyDirectories(staleLobbyRoot);
    removeOrphanDirectoryMetas(resolve(assetRoot, 'Lobby/Prefab'));
  }
  if (existsSync(staleLobbyRoot) && readdirSync(staleLobbyRoot).length === 0) rmdirSync(staleLobbyRoot);
  console.log(JSON.stringify({ removedOrphanDirectoryMetas: removedMetas.length + removedAfterDirectoryCleanup.length, removedStaleLobbyShell: !existsSync(staleLobbyRoot) }));
} else {
  console.log('Run with --plan, --apply, --verify, --rewrite-path-map, or --cleanup.');
}
