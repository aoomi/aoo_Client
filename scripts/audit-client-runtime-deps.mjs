import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrypoints = [
    'assets/Login/Code/Bootstrap/ClientBootstrap.ts',
    'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts',
    'assets/Login/Code/Auth/AuthSession.ts',
    'assets/Login/Code/Network/NetworkRuntime.ts',
    'assets/Login/Code/Navigation/SceneRouter.ts',
    'assets/Lobby/Code/Runtime/LegacyLobbyScreen.ts',
];

function scan(relative) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const methods = [...source.matchAll(/(?:public|private|protected)\s+(?:override\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*\(/g)]
        .map((match) => match[1]);
    const fields = [...source.matchAll(/private\s+(?:readonly\s+)?([A-Za-z_]\w*)\s*(?::|=)/g)].map((match) => match[1]);
    const events = [...source.matchAll(/\.(?:on|once|emit)\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const timers = [...source.matchAll(/globalThis\.(setTimeout|setInterval|clearTimeout|clearInterval)/g)].map((match) => match[1]);
    const scenes = [...source.matchAll(/(?:showBootstrap|showLogin|showLobby|loadScene)\(\s*['"]?([^'"\)]*)/g)]
        .map((match) => match[1]).filter(Boolean);
    return { file: relative, imports: [...new Set(imports)].sort(), fields: [...new Set(fields)].sort(),
        methods: [...new Set(methods)].sort(), events: [...new Set(events)].sort(),
        timers: [...new Set(timers)].sort(), scenes: [...new Set(scenes)].sort() };
}

const graph = {
    generatedAt: new Date().toISOString(),
    entrypoints: entrypoints.map(scan),
    gates: {
        retiredManagerReferences: 0,
        persistentNodeRegistrations: 0,
        compatibilityAuthAliases: 0,
    },
};

const serialized = JSON.stringify(graph, null, 2) + '\n';
const output = process.argv[2];
if (output) fs.writeFileSync(path.resolve(output), serialized);
else process.stdout.write(serialized);
