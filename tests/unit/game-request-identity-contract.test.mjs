import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('all canonical poker runtimes share refresh-safe request identity',()=>{
  const identity=read('assets/Common/Code/Runtime/network/GameRequestIdentity.ts');
  assert.match(identity,/randomUUID/); assert.match(identity,/\+\+this\.sequence/);
  for(const file of [
    'assets/Games/Poker/CX/CD299/Code/CD299Protocol.ts',
    'assets/Games/Poker/NN/Common/Code/CN298Protocol.ts',
    'assets/Games/Poker/ZJH/Common/Code/CN297Protocol.ts']){
    const source=read(file); assert.match(source,/GameRequestIdentity/); assert.match(source,/this\.requests\.next\(\)/);
  }
});
