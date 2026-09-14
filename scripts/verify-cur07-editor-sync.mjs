#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const assetsRoot = path.join(root, 'assets');
const problems = [];
const warnings = new Set();
const counts = { scenes: 0, prefabs: 0, metas: 0, uuids: 0, fullUuidRefs: 0, dynamicPaths: 0 };
const uuidOwners = new Map();
const serialized = [];
const resourceRoots = [];

async function walk(dir) {
  if (path.basename(dir) === 'resources') resourceRoots.push(dir);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else await inspect(file);
  }
}

async function inspect(file) {
  const rel = path.relative(root, file);
  if (file.endsWith('.scene') || file.endsWith('.prefab')) {
    file.endsWith('.scene') ? counts.scenes++ : counts.prefabs++;
    serialized.push(file);
    try {
      JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      problems.push(`${rel}: serialized JSON cannot be parsed (${error.message})`);
    }
    try {
      await stat(`${file}.meta`);
    } catch {
      problems.push(`${rel}: missing sidecar .meta`);
    }
  }

  if (file.endsWith('.meta')) {
    counts.metas++;
    try {
      const meta = JSON.parse(await readFile(file, 'utf8'));
      if (typeof meta.uuid !== 'string' || !meta.uuid) {
        problems.push(`${rel}: missing uuid`);
      } else {
        const register = (value, owner) => {
          if (!value || typeof value !== 'object') return;
          if (typeof value.uuid === 'string' && value.uuid) {
            counts.uuids++;
            const previous = uuidOwners.get(value.uuid);
            if (previous && previous !== owner) problems.push(`${owner}: duplicate uuid ${value.uuid} (also ${previous})`);
            else uuidOwners.set(value.uuid, owner);
          }
          for (const child of Object.values(value)) register(child, owner);
        };
        register(meta, rel);
      }
    } catch (error) {
      problems.push(`${rel}: meta JSON cannot be parsed (${error.message})`);
    }
  }
}

await walk(assetsRoot);

for (const file of serialized) {
  const rel = path.relative(root, file);
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/"__uuid__"\s*:\s*"([0-9a-fA-F-]{36})"/g)) {
    counts.fullUuidRefs++;
    if (!uuidOwners.has(match[1])) warnings.add(`UUID ${match[1]} is not project-owned; Creator must resolve it as an engine/internal asset`);
  }
}

const sourceFiles = [];
async function collectSources(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectSources(file);
    else if (/\.(?:ts|js|mjs)$/.test(entry.name)) sourceFiles.push(file);
  }
}
await collectSources(assetsRoot);

for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\bresources\.(?:load|loadDir)\s*\(\s*['"]([^'"`]+)['"]/g)) {
    counts.dynamicPaths++;
    const requested = match[1].replace(/^resources\//, '');
    let found = false;
    for (const resourceRoot of resourceRoots) {
      const base = path.join(resourceRoot, requested);
      const candidates = [base, `${base}.prefab`, `${base}.scene`, `${base}.json`, `${base}.png`, `${base}.jpg`, `${base}.mp3`];
      for (const candidate of candidates) {
        try { await stat(candidate); found = true; break; } catch { /* try next extension */ }
      }
      if (found) break;
    }
    if (!found) problems.push(`${path.relative(root, file)}: unresolved literal resources path ${match[1]}`);
  }
}

console.log(JSON.stringify({ gate: 'CUR-07 editor sync static preflight', counts, problems, warnings: [...warnings] }, null, 2));
if (problems.length) process.exitCode = 1;
