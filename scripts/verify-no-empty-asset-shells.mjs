import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve('assets');
const emptyShells = [];
const orphanMetas = [];
const allowedEmptyDirectories = new Set([
  // 四个牌类图集目录是用户在 Creator 中维护的独立 Bundle 边界；某牌类尚未
  // 导入美术时允许为空，门禁不得因此删除目录或其 Bundle UUID。
  'Common/Atlas/LongCard_Cards',
  'Common/Atlas/Mahjong_Cards',
  'Common/Atlas/WordCard_Cards',
  // Published empty bundle boundaries retain Creator UUIDs until their native
  // prefabs are imported; unlike arbitrary shells these are release contracts.
  'Common/Prefab/LongCard',
  'Common/Prefab/Mahjong',
  'Common/Prefab/WordCard',
  'Games/LongCard/Common/Prefab',
]);
const userManagedDirectoryRoots = [
  'Games/Poker/CX',
  'Games/Poker/DDZ',
  'Games/Poker/GD',
  'Games/Poker/NN',
  'Games/Poker/PDK',
  'Games/Poker/SG',
  'Games/Poker/SJ',
  'Games/Poker/ZJH',
];

function isUserApprovedPrefabException(relativeDirectory) {
  return relativeDirectory === 'Lobby/Prefab/uiGame' || relativeDirectory.startsWith('Lobby/Prefab/uiGame/');
}

function isUserManagedDirectory(relativeDirectory) {
  return userManagedDirectoryRoots.some((rootDirectory) => relativeDirectory === rootDirectory
    || relativeDirectory.startsWith(`${rootDirectory}/`));
}

function walk(directory) {
  const relativeDirectory = relative(root, directory);
  if (isUserManagedDirectory(relativeDirectory)) return;
  const entries = readdirSync(directory, { withFileTypes: true });
  const meaningful = entries.filter((entry) => entry.name !== '.DS_Store');
  if (relativeDirectory && meaningful.length === 0 && !allowedEmptyDirectories.has(relativeDirectory) && !isUserApprovedPrefabException(relativeDirectory)) {
    emptyShells.push(relativeDirectory);
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (relative(root, path) === 'Lobby/Prefab/uiGame-001') continue;
      walk(path);
      continue;
    }
    if (!entry.name.endsWith('.meta')) continue;
    const target = path.slice(0, -'.meta'.length);
    try {
      statSync(target);
    } catch {
      orphanMetas.push(relative(root, path));
    }
  }
}

walk(root);

if (emptyShells.length || orphanMetas.length) {
  if (emptyShells.length) console.error(`empty asset directories:\n${emptyShells.sort().join('\n')}`);
  if (orphanMetas.length) console.error(`orphan Creator meta files:\n${orphanMetas.sort().join('\n')}`);
  process.exit(1);
}

console.log('asset empty-shell and orphan-meta gate passed');
