import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(`../../assets/${p}`,import.meta.url),'utf8');

test('production gateway owns mail detail/read, notice and aggregate red dots',()=>{
  const source=read('Common/Code/Runtime/Social/SocialGateway.ts');
  for(const path of ['/api/v2/mail','/api/v2/notices','/api/v2/red-dots'])assert.match(source,new RegExp(path.replaceAll('/','\\/')));
  for(const action of ['mailDetail','readMail','notices','readNotices','redDots'])assert.match(source,new RegExp(action));
  assert.doesNotMatch(source,/CSystemNotice|SendPack/);
});

test('lobby consumes durable feeds, WSS invalidation and unified red-dot state',()=>{
  const screen=read('Lobby/Code/LobbyScreenController.ts');
  const controller=read('Modules/Activity/Social/Code/SocialController.ts');
  assert.match(screen,/client\.on\('social\.notice\.changed'/);
  for(const event of ['legacy-mails-updated','legacy-mail-detail','legacy-notices-updated','legacy-red-dots-updated'])assert.match(controller,new RegExp(event));
});
