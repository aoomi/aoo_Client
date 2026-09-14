import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const scope = option('--scope') ?? (args[0]?.startsWith('--') ? '' : args[0]) ?? '';
const explicitSource = option('--source');
const explicitTarget = option('--target');
const sourceRoot = explicitSource ? path.resolve(explicitSource) : path.resolve(projectRoot,
  scope === 'njpdk' ? '../client-unified/assets/resources'
    : scope === 'scjymj' ? '../../QH_JYTF_client/Client_scjymj/assets/resources'
      : scope === 'hzmj' ? '../../情怀1.0前端/客户端 (1)/Client_hzmj/assets/resources'
      : '../client/assets/resources');
const sourceInternalRoot = path.resolve(projectRoot, '../client/temp/internal');
const targetRoot = explicitTarget ? path.resolve(explicitTarget) : path.join(projectRoot, 'assets/resources/legacy-ui',
  scope === 'scjymj' ? 'scjymj-source' : scope === 'hzmj' ? 'hzmj-source' : 'assets');
const cachePath = path.join(projectRoot, 'work/stage-native-prefab-uuid-map.json');
const reportPath = path.join(projectRoot, `logs/native-asset-${scope || 'full'}-migration.json`);
const internalRuntimeExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ttf', '.fnt']);

function walk(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const allFiles = walk(sourceRoot);
const sourceFiles = allFiles.filter((file) => {
  if (file.endsWith('.meta') || file.endsWith('.prefab') || file.endsWith('.fire') || file.endsWith('.scene')) return false;
  const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
  if (explicitSource && (relative.startsWith('script/') || relative.startsWith('scripts/'))) return false;
  if (explicitSource && /\.[cm]?[jt]sx?$/i.test(relative)) return false;
  if (explicitSource && /(^|\/)(project|version)\.manifest$/i.test(relative)) return false;
  if (explicitSource && /\.(php|sh|bat|command)$/i.test(relative)) return false;
  if (scope === 'njpdk' && !relative.startsWith('njpdk/')) return false;
  return !relative.startsWith('scene/');
});
// Never ship Creator 2 scene/effect/model internals in a Creator 3 bundle.
// Native 3.8 scenes live under assets/scenes; only their referenced UI assets
// are staged below.
if (!scope) {
  fs.rmSync(path.join(targetRoot, 'scene'), { recursive: true, force: true });
  fs.rmSync(path.join(targetRoot, 'internal'), { recursive: true, force: true });
}
const records = [];
let internalCopied = 0;
const uuidMap = scope && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
function collectUuids(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.uuid === 'string') uuidMap[value.uuid] = value.uuid;
  for (const child of Object.values(value)) collectUuids(child);
}

function normalizedUuid(value) {
  if (!explicitSource && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '')) return value;
  const namespace = explicitSource ? `subgame:${scope}:` : '';
  const hex = crypto.createHash('sha256').update(`creator-3.8:${namespace}${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const stable = hex.join('');
  return `${stable.slice(0, 8)}-${stable.slice(8, 12)}-${stable.slice(12, 16)}-${stable.slice(16, 20)}-${stable.slice(20)}`;
}

function normalizeMetaUuids(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeMetaUuids);
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'uuid' || key === 'rawTextureUuid') && typeof child === 'string' && child) {
      const normalized = normalizedUuid(child);
      uuidMap[child] = normalized;
      result[key] = normalized;
    } else {
      result[key] = normalizeMetaUuids(child);
    }
  }
  return result;
}

function convertImageMeta(sourceMeta, source) {
  const legacyRootUuid = sourceMeta.uuid;
  const legacyFrames = Object.values(sourceMeta.subMetas ?? {})
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.uuid === 'string');
  const frame = legacyFrames.find((entry) =>
    Number.isFinite(entry.rawWidth) || Number.isFinite(entry.width));
  if (!legacyRootUuid || !frame) return null;
  const rootUuid = normalizedUuid(legacyRootUuid);

  const displayName = path.basename(source, path.extname(source));
  const width = frame.width ?? frame.rawWidth ?? 0;
  const height = frame.height ?? frame.rawHeight ?? 0;
  const rawWidth = frame.rawWidth ?? width;
  const rawHeight = frame.rawHeight ?? height;
  const textureUuid = `${rootUuid}@6c48a`;
  const spriteFrameUuid = `${rootUuid}@f9941`;
  for (const legacyFrame of legacyFrames) {
    uuidMap[legacyFrame.uuid] = spriteFrameUuid;
  }
  // Creator 2 prefabs are inconsistent here: Sprite/Button fields can point
  // either at the image root or its legacy subMeta. In Creator 3 both must
  // resolve to the generated SpriteFrame subresource.
  uuidMap[legacyRootUuid] = spriteFrameUuid;

  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid: rootUuid,
    files: [path.extname(source).toLowerCase(), '.json'],
    subMetas: {
      '6c48a': {
        importer: 'texture', uuid: textureUuid, displayName, id: '6c48a', name: 'texture',
        userData: {
          wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge',
          imageUuidOrDatabaseUri: rootUuid, isUuid: true, visible: false,
          minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0,
        },
        ver: '1.0.22', imported: true, files: ['.json'], subMetas: {},
      },
      f9941: {
        importer: 'sprite-frame', uuid: spriteFrameUuid, displayName, id: 'f9941', name: 'spriteFrame',
        userData: {
          trimThreshold: frame.trimThreshold ?? 1,
          rotated: frame.rotated ?? false,
          offsetX: frame.offsetX ?? 0, offsetY: frame.offsetY ?? 0,
          trimX: frame.trimX ?? 0, trimY: frame.trimY ?? 0,
          width, height, rawWidth, rawHeight,
          borderTop: frame.borderTop ?? 0, borderBottom: frame.borderBottom ?? 0,
          borderLeft: frame.borderLeft ?? 0, borderRight: frame.borderRight ?? 0,
          packable: true, pixelsToUnit: 100,
          pivotX: frame.pivotX ?? 0.5, pivotY: frame.pivotY ?? 0.5,
          meshType: 0, isUuid: true,
          imageUuidOrDatabaseUri: textureUuid, atlasUuid: '', trimType: frame.trimType ?? 'auto',
        },
        ver: '1.0.12', imported: true, files: ['.json'], subMetas: {},
      },
    },
    userData: {
      type: 'sprite-frame',
      fixAlphaTransparencyArtifacts: false,
      hasAlpha: !['.jpg', '.jpeg'].includes(path.extname(source).toLowerCase()),
      redirect: textureUuid,
    },
  };
}
function convertAtlasMeta(sourceMeta) {
  if (sourceMeta.importer !== 'sprite-atlas' || !sourceMeta.uuid) return null;
  const subMetas = Object.fromEntries(Object.entries(sourceMeta.subMetas ?? {}).map(([name, frame]) => [name, {
    ...frame,
    ver: '1.0.12',
    importer: 'sprite-frame',
    imported: true,
    files: ['.json'],
    userData: {
      trimType: frame.trimType ?? 'auto',
      trimThreshold: frame.trimThreshold ?? 1,
      rotated: frame.rotated ?? false,
      offsetX: frame.offsetX ?? 0,
      offsetY: frame.offsetY ?? 0,
      trimX: frame.trimX ?? 0,
      trimY: frame.trimY ?? 0,
      width: frame.width ?? frame.rawWidth ?? 0,
      height: frame.height ?? frame.rawHeight ?? 0,
      rawWidth: frame.rawWidth ?? frame.width ?? 0,
      rawHeight: frame.rawHeight ?? frame.height ?? 0,
      borderTop: frame.borderTop ?? 0,
      borderBottom: frame.borderBottom ?? 0,
      borderLeft: frame.borderLeft ?? 0,
      borderRight: frame.borderRight ?? 0,
      packable: false,
    },
    displayName: name.replace(/\.png$/i, ''),
    id: name,
    name,
    subMetas: frame.subMetas ?? {},
  }]));
  return {
    ver: '1.0.8',
    importer: 'sprite-atlas',
    imported: true,
    uuid: sourceMeta.uuid,
    files: ['.json'],
    subMetas,
    userData: {},
  };
}
for (const source of sourceFiles) {
  let relative = path.relative(sourceRoot, source);
  const extension = path.extname(relative);
  const stem = path.basename(relative, extension);
  const siblings = allFiles.filter((candidate) =>
    path.dirname(candidate) === path.dirname(source)
    && path.basename(candidate, path.extname(candidate)) === stem
    && candidate !== source
    && !candidate.endsWith('.meta'));
  if (siblings.length) {
    relative = path.join(path.dirname(relative), `${stem}_${extension.slice(1).toLowerCase()}${extension}`);
  }
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (extension.toLowerCase() === '.fnt' && siblings.length) {
    const bitmapName = `${stem}_png.png`;
    const contents = fs.readFileSync(target, 'utf8')
      .replace(/(page\s+id=\d+\s+file=")[^"]+("?)/g, `$1${bitmapName}$2`);
    fs.writeFileSync(target, contents);
  }
  const sourceMeta = `${source}.meta`;
  if (fs.existsSync(sourceMeta)) {
    try {
      const parsedMeta = JSON.parse(fs.readFileSync(sourceMeta, 'utf8'));
      const convertedMeta = /\.(png|jpg|jpeg|webp)$/i.test(source)
        ? convertImageMeta(parsedMeta, source)
        : path.extname(source).toLowerCase() === '.plist' ? convertAtlasMeta(parsedMeta) : null;
      if (convertedMeta) {
        const finalMeta = /\.(png|jpg|jpeg|webp)$/i.test(source) ? convertedMeta : normalizeMetaUuids(convertedMeta);
        fs.writeFileSync(`${target}.meta`, `${JSON.stringify(finalMeta, null, 2)}\n`);
      } else {
        const normalizedMeta = normalizeMetaUuids(parsedMeta);
        fs.writeFileSync(`${target}.meta`, `${JSON.stringify(normalizedMeta, null, 2)}\n`);
        collectUuids(normalizedMeta);
      }
    } catch {
      fs.copyFileSync(sourceMeta, `${target}.meta`);
    }
  }
  records.push({ source: path.relative(sourceRoot, source).replaceAll(path.sep, '/'), target: path.relative(projectRoot, target).replaceAll(path.sep, '/') });
}

if (scope === 'njpdk' || scope === 'scjymj' || scope === 'hzmj') {
  const scopedRoot = scope === 'njpdk' ? path.join(targetRoot, 'njpdk') : targetRoot;
  for (const file of walk(scopedRoot).filter((entry) => /\.(fire|scene)(\.meta)?$/i.test(entry))) {
    fs.rmSync(file, { force: true });
  }
}

if (!scope && fs.existsSync(sourceInternalRoot)) {
  const internalFiles = walk(sourceInternalRoot);
  for (const source of internalFiles.filter((file) => file.endsWith('.prefab'))) {
    const relative = path.relative(sourceInternalRoot, source);
    const target = path.join(targetRoot, 'internal', relative);
    if (fs.existsSync(target)) fs.rmSync(target);
    if (fs.existsSync(`${target}.meta`)) fs.rmSync(`${target}.meta`);
  }
  for (const source of internalFiles.filter((file) => !file.endsWith('.meta'))) {
    if (source.endsWith('.prefab')) continue;
    if (!internalRuntimeExtensions.has(path.extname(source).toLowerCase())) continue;
    const relative = path.relative(sourceInternalRoot, source);
    const target = path.join(targetRoot, 'internal', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    const sourceMeta = `${source}.meta`;
    if (fs.existsSync(sourceMeta)) {
      try {
        const parsedMeta = JSON.parse(fs.readFileSync(sourceMeta, 'utf8'));
        const convertedMeta = /\.(png|jpg|jpeg|webp)$/i.test(source)
          ? convertImageMeta(parsedMeta, source)
          : null;
        if (convertedMeta) fs.writeFileSync(`${target}.meta`, `${JSON.stringify(convertedMeta, null, 2)}\n`);
        else { fs.copyFileSync(sourceMeta, `${target}.meta`); collectUuids(parsedMeta); }
      } catch { fs.copyFileSync(sourceMeta, `${target}.meta`); }
    }
    internalCopied += 1;
  }
}

for (const meta of allFiles.filter((file) => file.endsWith('.prefab.meta') && (!scope || path.relative(sourceRoot, file).replaceAll(path.sep, '/').startsWith(`${scope}/`)))) {
  try { collectUuids(JSON.parse(fs.readFileSync(meta, 'utf8'))); } catch { /* reported by prefab UUID audit */ }
}
fs.mkdirSync(path.dirname(cachePath), { recursive: true });
fs.writeFileSync(cachePath, `${JSON.stringify(uuidMap)}\n`);
const report = {
  generatedAt: new Date().toISOString(),
  status: 'passed',
  source: `${path.relative(projectRoot, sourceRoot)} (Creator 2.2.2)`,
  copied: records.length,
  internalCopied,
  mappedUuids: Object.keys(uuidMap).length,
  records,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
