import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const projectRoot = resolve(import.meta.dirname, '..');
const compilerCandidates = [
  process.env.AOO_TYPESCRIPT_PATH,
  resolve(projectRoot, 'node_modules/typescript/lib/typescript.js'),
  '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js',
].filter(Boolean);
const compilerPath = compilerCandidates.find(existsSync);

if (!compilerPath) {
  console.error('[UnresolvedIdentifierGate] TypeScript compiler not found. Set AOO_TYPESCRIPT_PATH to Cocos Creator 3.8.8 typescript.js.');
  process.exit(2);
}

const ts = require(compilerPath);
const configPath = resolve(projectRoot, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  process.exit(2);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
const program = ts.createProgram(parsed.fileNames, parsed.options);
// These diagnostics cover an unknown name, a likely misspelling, and an
// unresolved object-literal shorthand. The last one is the exact class of bug
// that previously aborted mount-room-runtime only after a player refreshed.
const unresolvedCodes = new Set([2304, 2552, 18004]);
const diagnostics = ts.getPreEmitDiagnostics(program)
  .filter(diagnostic => unresolvedCodes.has(diagnostic.code));

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start === undefined) {
      console.error(`[UnresolvedIdentifierGate] TS${diagnostic.code}: ${message}`);
      continue;
    }
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const file = diagnostic.file.fileName.replace(`${projectRoot}/`, '');
    console.error(`[UnresolvedIdentifierGate] ${file}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`);
  }
  process.exit(1);
}

console.log(`[UnresolvedIdentifierGate] PASS (${program.getSourceFiles().filter(file => file.fileName.startsWith(projectRoot)).length} project files checked)`);
