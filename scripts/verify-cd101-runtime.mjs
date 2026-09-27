import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const files = [
    'assets/Games/Mahjong/Common/Code/CDXZ/CD101GameRuntimeEntry.ts',
    'assets/Games/Mahjong/Common/Code/CDXZ/CD101RoomView.ts',
    'assets/Games/Mahjong/Common/Code/CDXZ/CD101SmallSettlementAdapter.ts',
    'assets/Games/Mahjong/Common/Code/CDXZ/CDXZBigSettlementAdapter.ts',
    'assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts',
].map(file => resolve(root, file));
const creatorDeclarations = [
    'temp/declarations/cc.d.ts',
    'temp/declarations/cc.env.d.ts',
].map(file => resolve(root, file)).filter(existsSync);
const compiler = [
    process.env.AOO_TYPESCRIPT_PATH,
    resolve(root, 'node_modules/typescript/lib/typescript.js'),
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js',
].filter(Boolean).find(existsSync);
if (!compiler) throw new Error('Creator 3.8.8 TypeScript compiler is unavailable');

const ts = require(compiler);
const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
// Creator generates these declarations under temp/, while the project tsconfig
// excludes temp/ from normal source discovery. Include the generated ambient
// modules explicitly so this standalone gate sees the same `cc` surface as the
// Creator editor instead of reporting cascading implicit-any errors.
const program = ts.createProgram([...parsed.fileNames, ...creatorDeclarations], parsed.options);
const selected = new Set(files);
const diagnostics = ts.getPreEmitDiagnostics(program).filter(item => item.file && selected.has(item.file.fileName));
if (diagnostics.length > 0) {
    for (const item of diagnostics) {
        const position = item.file.getLineAndCharacterOfPosition(item.start ?? 0);
        console.error(`${item.file.fileName}:${position.line + 1}:${position.character + 1} TS${item.code} ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`);
    }
    process.exit(1);
}

const runtime = readFileSync(files[0], 'utf8');
const entries = readFileSync(files[4], 'utf8');
const lobby = readFileSync(resolve(root, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
const meta = JSON.parse(readFileSync(resolve(root, 'assets/Games/Mahjong.meta'), 'utf8'));
const failures = [];
if (meta.userData?.isBundle !== true || meta.userData?.bundleName !== 'games-mahjong') failures.push('Mahjong bundle declaration is invalid');
if ((entries.match(/createCD101GameRuntimeEntry\(/g) ?? []).length !== 1) failures.push('CD101 must have one production registry entry');
for (const existing of ['createCD299GameRuntimeEntry(', 'createCN298GameRuntimeEntry(', 'createCN297GameRuntimeEntry(']) {
    if (!entries.includes(existing)) failures.push(`existing registry entry lost: ${existing}`);
}
if (!runtime.includes("const DISPATCH = 'mahjong.cdxzmj.dispatch'")) failures.push('CD101 authority dispatch route is missing');
if (!runtime.includes("canonicalGameCodes = Object.freeze(['CD101'])")
    || !runtime.includes('families = Object.freeze([] as string[])')) failures.push('CD101 exact-only registry isolation is missing');
if (runtime.includes('joinFirstFreeSeat') || !runtime.includes('this.options.accountId')) {
    failures.push('CD101 must match Gateway account identity without attempting a second seat join');
}
if (/CHZMJ|HzmjRuntime|hzmj\./.test(runtime)) failures.push('CD101 runtime depends on the legacy HZMJ protocol');
if (!runtime.includes('roundScoreDelta') || !runtime.includes('totalScore') || !runtime.includes('roomFinished')) {
    failures.push('authoritative small/big settlement fields are not projected');
}
if (!/gameType !== 628\s*&&\s*gameType !== 516/.test(lobby)) {
    failures.push('CD101 join-by-room-id must use the native authoritative Hall handoff');
}
for (const prefab of ['assets/Games/Mahjong/Common/Prefab/CD101SmallSettlement_JDZ2D.prefab',
    'assets/Games/Mahjong/Common/Prefab/BigSettlement_0.prefab']) {
    if (!existsSync(resolve(root, prefab)) || !existsSync(resolve(root, `${prefab}.meta`))) {
        failures.push(`CD101 settlement prefab or meta is missing: ${prefab}`);
    }
}
if (failures.length > 0) {
    failures.forEach(message => console.error(`[CD101RuntimeGate] ${message}`));
    process.exit(1);
}
console.log(`[CD101RuntimeGate] PASS (${files.length} TypeScript files, bundle/registry/join/protocol/settlement contracts)`);
