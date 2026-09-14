import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
const root = path.resolve('assets');
const extensions = new Set(['.ts', '.js', '.json', '.scene', '.prefab']);
async function files(directory) { const out=[]; for (const entry of await readdir(directory,{withFileTypes:true})) { const full=path.join(directory,entry.name); if(entry.isDirectory()) out.push(...await files(full)); else if(extensions.has(path.extname(entry.name))) out.push(full); } return out; }
test('production runtime and serialized assets never reference retired legacy-data paths', async () => {
  const violations=[];
  for (const file of await files(root)) { const source=await readFile(file,'utf8'); if(/legacy-data\//.test(source)) violations.push(path.relative(root,file)); }
  assert.deepEqual(violations,[]);
});
