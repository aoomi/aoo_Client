import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.dirname(scriptDir);
const projectRoot = path.dirname(clientRoot);
const ledgerPath = path.join(clientRoot, 'docs', 'verification', '121-naming-inventory.json');
const reportPath = path.join(clientRoot, 'docs', 'verification', '121-naming-ledger.md');
const PRIVATE_BACKUP_SEGMENT = `${path.sep}Lobby${path.sep}Prefab${path.sep}uiGame-001`;
const EXCEPTION_OWNER = 'Aoo migration team';
const EXCEPTION_DEADLINE = '2026-12-31';

const SETTLEMENT_NAME = /^(?:Big|Small)SettleTpl(?:_[a-z0-9]+(?:_[a-z0-9]+)*)?_\d{2,3}$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL_CASE = /^[a-z][A-Za-z0-9]*$/;
const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const PLACEHOLDER_NODE = /^(?:New (?:Label|Sprite|Node)|btn\d+|node\d+)$/i;
const STATIC_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.wav', '.ogg', '.ttf', '.otf', '.json']);
const CODE_UTILITY_DIRS = new Set([
  'auth', 'bootstrap', 'common', 'config', 'core', 'logic', 'model', 'navigation',
  'network', 'observability', 'platform', 'regional', 'resources', 'role', 'state',
  'subgame', 'ui',
]);
const SKIP_DIRECTORY_NAMES = new Set([
  '.git', 'build', 'dist', 'library', 'node_modules', 'profiles', 'target', 'temp', 'work',
]);
const PDK_ANIMATION_FOLDER_KEYS = new Set([
  'Airplane', 'AnimationClips', 'Bomb', 'ConsecutivePairs', 'Dragon', 'FourWithSingle',
  'FourWithThree', 'FourWithTwo', 'Shutout', 'Straight', 'TripleWithSingle',
  'TripleWithTwo', 'WarningLight',
]);
const APPROVED_ASSET_DIRECTORY_NAMES = new Set([
  'LongCard_Cards', 'Mahjong_Cards', 'Poker_Cards', 'WordCard_Cards',
]);
const APPROVED_CREATOR_ASSET_NAMES = new Set([
  'create_Room', 'Poker_Card', 'PDK_CommonRoom',
]);
const APPROVED_STATIC_ASSET_NAMES = new Set([
  'Poker_0', 'Poker_1', 'Poker_Common',
]);
const APPROVED_TYPESCRIPT_FILE_NAMES = new Set([
  'Poker_Card_Factory', 'Poker_Card_Presenter',
]);
const APPROVED_PLACEHOLDER_NODES = new Set([
  'Client/assets/Login/Scenes/LoginScene.scene\u0000New Label',
]);

function toProjectPath(absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function isPrivateBackup(absolutePath) {
  return absolutePath.includes(PRIVATE_BACKUP_SEGMENT);
}

function isPascalCase(name) {
  return PASCAL_CASE.test(name) || SETTLEMENT_NAME.test(name);
}

function addViolation(items, scope, kind, absolutePath, detail = '') {
  items.push({
    scope,
    kind,
    path: toProjectPath(absolutePath),
    detail,
  });
}

function walk(root, visit) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (isPrivateBackup(absolutePath)) continue;
    if (entry.isDirectory() && SKIP_DIRECTORY_NAMES.has(entry.name)) continue;
    visit(absolutePath, entry);
    if (entry.isDirectory()) walk(absolutePath, visit);
  }
}

function inspectCreatorAssetNames(items) {
  const assetsRoot = path.join(clientRoot, 'assets');
  walk(assetsRoot, (absolutePath, entry) => {
    const relative = path.relative(assetsRoot, absolutePath).split(path.sep).join('/');
    if (entry.isDirectory()) {
      const inCode = relative.split('/').includes('Code');
      const validUtility = inCode && (CAMEL_CASE.test(entry.name) || CODE_UTILITY_DIRS.has(entry.name));
      const isStablePdkAnimationKey = path.dirname(relative) === 'Games/Poker/PDK/Common/Spine'
        && PDK_ANIMATION_FOLDER_KEYS.has(entry.name);
      if (!isPascalCase(entry.name) && !validUtility && !isStablePdkAnimationKey
        && !APPROVED_ASSET_DIRECTORY_NAMES.has(entry.name)) {
        addViolation(items, 'Client', 'asset-directory', absolutePath, 'Folder is not PascalCase or an approved code utility module.');
      }
      return;
    }
    if (entry.name.endsWith('.meta')) return;
    const extension = path.extname(entry.name);
    const lowerExtension = extension.toLowerCase();
    const baseName = entry.name.slice(0, entry.name.length - extension.length);
    if ((lowerExtension === '.prefab' || lowerExtension === '.scene') && !isPascalCase(baseName)
      && !APPROVED_CREATOR_ASSET_NAMES.has(baseName)) {
      addViolation(items, 'Client', 'creator-asset-name', absolutePath, 'Prefab/Scene name is not PascalCase or the approved settlement-template format.');
    }
    if (STATIC_EXTENSIONS.has(lowerExtension) && !SNAKE_CASE.test(baseName)
      && !APPROVED_STATIC_ASSET_NAMES.has(baseName)) {
      addViolation(items, 'Client', 'static-asset-name', absolutePath, 'Static resource name is not snake_case.');
    }
    if (lowerExtension === '.ts' && !(isPascalCase(baseName) || CAMEL_CASE.test(baseName))
      && !APPROVED_TYPESCRIPT_FILE_NAMES.has(baseName)) {
      addViolation(items, 'Client', 'typescript-file-name', absolutePath, 'TypeScript filename is not PascalCase/camelCase.');
    }
    if (lowerExtension === '.ts') {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const mainClass = source.match(/export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
      if (mainClass && mainClass[1] !== baseName) {
        addViolation(items, 'Client', 'typescript-export-name', absolutePath, `Main exported class ${mainClass[1]} does not match filename ${baseName}.`);
      }
    }
    if (lowerExtension === '.prefab' || lowerExtension === '.scene') {
      try {
        const serialized = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        const placeholderNames = [...new Set(serialized
          .map((value) => value && typeof value === 'object' ? value._name : undefined)
          .filter((name) => typeof name === 'string' && PLACEHOLDER_NODE.test(name)))];
        for (const nodeName of placeholderNames) {
          if (APPROVED_PLACEHOLDER_NODES.has(`${toProjectPath(absolutePath)}\u0000${nodeName}`)) continue;
          addViolation(items, 'Client', 'creator-placeholder-node', absolutePath, `Placeholder node name remains: ${nodeName}.`);
        }
      } catch {
        // Creator import/serialization gates own malformed JSON. Naming verification stays focused.
      }
    }
  });
}

function inspectServerNames(items) {
  const serverRoot = path.join(projectRoot, 'Server');
  walk(serverRoot, (absolutePath, entry) => {
    if (entry.isDirectory()) return;
    const extension = path.extname(entry.name);
    const baseName = entry.name.slice(0, entry.name.length - extension.length);
    if (extension === '.java' && !PASCAL_CASE.test(baseName)) {
      addViolation(items, 'Server', 'java-class-file', absolutePath, 'Java class filename is not PascalCase.');
    }
    if (extension === '.sql' && absolutePath.includes(`${path.sep}migrations${path.sep}`)
      && !/^V\d+(?:_\d+)*__[a-z0-9_]+$/.test(baseName)) {
      addViolation(items, 'Server', 'database-migration-name', absolutePath, 'Flyway migration filename does not match Vn__snake_case.sql.');
    }
  });
}

function inspectAdminNames(items) {
  const adminRoot = path.join(projectRoot, 'Admin');
  walk(adminRoot, (absolutePath, entry) => {
    if (entry.isDirectory()) return;
    const extension = path.extname(entry.name);
    const baseName = entry.name.slice(0, entry.name.length - extension.length);
    if (extension === '.vue' && !PASCAL_CASE.test(baseName)) {
      addViolation(items, 'Admin', 'vue-component-name', absolutePath, 'Vue component filename is not PascalCase.');
    }
    if ((extension === '.ts' || extension === '.tsx') && !(PASCAL_CASE.test(baseName) || CAMEL_CASE.test(baseName) || baseName.endsWith('.d'))) {
      addViolation(items, 'Admin', 'typescript-file-name', absolutePath, 'TypeScript filename is not PascalCase/camelCase.');
    }
  });
}

export function collectNamingViolations() {
  const items = [];
  inspectCreatorAssetNames(items);
  inspectServerNames(items);
  inspectAdminNames(items);
  return items.sort((left, right) => `${left.scope}:${left.kind}:${left.path}:${left.detail}`.localeCompare(`${right.scope}:${right.kind}:${right.path}:${right.detail}`));
}

function violationKey(item) {
  return `${item.scope}\u0000${item.kind}\u0000${item.path}\u0000${item.detail}`;
}

function summarize(items) {
  const summary = {};
  for (const item of items) {
    const key = `${item.scope}/${item.kind}`;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

function inventoryHash(items) {
  return crypto.createHash('sha256').update(items.map(violationKey).join('\n')).digest('hex');
}

function writeLedger(items) {
  const ledger = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      owner: EXCEPTION_OWNER,
      deadline: EXCEPTION_DEADLINE,
      rule: 'Exact-path migration baseline. New violations fail; resolved entries may disappear without replacement.',
      privateBackupExcluded: 'Client/assets/Lobby/Prefab/uiGame-001/**',
    },
    count: items.length,
    sha256: inventoryHash(items),
    summary: summarize(items),
    violations: items,
  };
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const rows = Object.entries(ledger.summary).map(([key, count]) => `| ${key} | ${count} |`).join('\n');
  const report = `# Aoo 全项目命名违规台账\n\n`
    + `- 生成时间：${ledger.generatedAt}\n`
    + `- 精确基线数量：${ledger.count}\n`
    + `- 清单哈希：\`${ledger.sha256}\`\n`
    + `- 负责人：${EXCEPTION_OWNER}\n`
    + `- 清理期限：${EXCEPTION_DEADLINE}\n`
    + `- 机器清单：[121-naming-inventory.json](./121-naming-inventory.json)\n`
    + `- 明确排除：用户私有备份 \`Client/assets/Lobby/Prefab/uiGame-001/**\`，不扫描、不计数、不改动。\n\n`
    + `## 规则\n\n`
    + `当前清单是逐文件、逐问题的迁移基线，不是通配目录豁免。新增任何命名偏差会立即失败；删除或改正旧条目允许通过。历史协议类、Creator 2.2.2 序列化资源和第三方 Admin 组件不得机械改名，必须分别通过协议版本迁移、Creator AssetDB 保 UUID 重命名和调用方迁移退出本清单。\n\n`
    + `## 分类统计\n\n| 分类 | 数量 |\n|---|---:|\n${rows}\n\n`
    + `## 验证命令\n\n\`node scripts/verify-naming-conventions.mjs\`\n`;
  fs.writeFileSync(reportPath, report);
  return ledger;
}

export function verifyNamingConventions() {
  if (!fs.existsSync(ledgerPath)) throw new Error(`Naming ledger is missing: ${ledgerPath}`);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (new Date(`${ledger.policy.deadline}T23:59:59Z`).getTime() < Date.now()) {
    throw new Error(`Naming migration ledger expired on ${ledger.policy.deadline}; unresolved entries must be migrated.`);
  }
  const accepted = new Set(ledger.violations.map(violationKey));
  const current = collectNamingViolations();
  const unexpected = current.filter((item) => !accepted.has(violationKey(item)));
  if (unexpected.length > 0) {
    throw new Error(`New naming violations (${unexpected.length}):\n${unexpected.slice(0, 30).map((item) => `${item.scope}/${item.kind}: ${item.path} (${item.detail})`).join('\n')}`);
  }
  return {
    baselineCount: ledger.count,
    currentCount: current.length,
    resolvedCount: ledger.count - current.length,
    unexpectedCount: unexpected.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write-ledger')) {
    const ledger = writeLedger(collectNamingViolations());
    console.log(`Naming ledger written: ${ledger.count} exact violations, sha256=${ledger.sha256}`);
  } else {
    const result = verifyNamingConventions();
    console.log(`Naming gate passed: current=${result.currentCount}, baseline=${result.baselineCount}, resolved=${result.resolvedCount}, unexpected=0`);
  }
}
