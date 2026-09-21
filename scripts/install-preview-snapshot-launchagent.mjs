import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const uid = process.getuid();
const agents = join(homedir(), 'Library/LaunchAgents');
const backup = join(process.cwd(), 'work/preview-snapshots/launchagent-backup');
const supervisorLabel = 'com.aoo.bcg.preview-snapshot-supervisor';
const dashboardLabel = 'com.aoo.bcg.four-client-preview-7460';
const retiredLabels = [
  'com.aoo.bcg.lan-preview-proxy-7458',
  'com.aoo.bcg.lan-preview-proxy-7459',
  'com.aoo.bcg.lan-preview-proxy-5188',
];

function xmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function launchctl(...args) {
  return spawnSync('launchctl', args, { encoding: 'utf8' });
}

await mkdir(agents, { recursive: true });
await mkdir(backup, { recursive: true });
for (const label of [...retiredLabels, dashboardLabel, supervisorLabel]) {
  const path = join(agents, `${label}.plist`);
  if (existsSync(path)) await copyFile(path, join(backup, `${label}.plist`));
  launchctl('bootout', `gui/${uid}/${label}`);
}

const supervisorPath = join(agents, `${supervisorLabel}.plist`);
const supervisorPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${supervisorLabel}</string>
<key>ProgramArguments</key><array><string>${xmlEscape(process.execPath)}</string><string>${xmlEscape(resolve('scripts/static-build-supervisor.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xmlEscape(process.cwd())}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>/tmp/aoo-preview-snapshot-supervisor.log</string>
<key>StandardErrorPath</key><string>/tmp/aoo-preview-snapshot-supervisor.log</string>
</dict></plist>\n`;
await writeFile(supervisorPath, supervisorPlist);

const dashboardPath = join(agents, `${dashboardLabel}.plist`);
let dashboardPlist = await readFile(join(backup, `${dashboardLabel}.plist`), 'utf8');
dashboardPlist = dashboardPlist.replace(/<key>KeepAlive<\/key>\s*<true\/>/, '<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>')
  .replace('</dict>\n</plist>', '<key>ThrottleInterval</key><integer>30</integer>\n</dict>\n</plist>');
await writeFile(dashboardPath, dashboardPlist);

for (const label of retiredLabels) {
  const path = join(agents, `${label}.plist`);
  if (existsSync(path)) await import('node:fs/promises').then(({ rm }) => rm(path));
}

for (const path of [supervisorPath, dashboardPath]) {
  const result = launchctl('bootstrap', `gui/${uid}`, path);
  if (result.status !== 0) throw new Error(`launchctl bootstrap failed for ${path}: ${result.stderr || result.stdout}`);
}
for (const label of [supervisorLabel, dashboardLabel]) launchctl('kickstart', `gui/${uid}/${label}`);
process.stdout.write(`${JSON.stringify({ installed: supervisorLabel, dashboard: dashboardLabel, retiredLabels, backup })}\n`);
