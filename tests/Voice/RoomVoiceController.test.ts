import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controller=readFileSync(new URL('../../assets/Common/Code/Runtime/Voice/RoomVoiceController.ts',import.meta.url),'utf8');
const media=readFileSync(new URL('../../assets/Common/Code/Runtime/Voice/VoiceMediaClient.ts',import.meta.url),'utf8');

test('room voice command sends only the READY asset identity',()=>{const request=/protocol\.request\('room\.voice',\{([^}]+)\}/s.exec(controller)?.[1]??'';assert.match(request,/assetId:ready\.assetId/);assert.doesNotMatch(request,/duration|mime|url|mediaId/i);});
test('playback rejects direct URLs and requires an authorized media descriptor',()=>{assert.match(controller,/\^media:\(\[1-9\]/);assert.match(controller,/media\.describe\(assetId\)/);assert.match(controller,/ready\.state!=='READY'/);assert.match(media,/\/api\/v2\/media\/assets\/\$\{this\.assetId\(assetId\)\}/);assert.doesNotMatch(media,/objectStorage|presigned|directUrl/);});
test('upload includes measured duration but playback duration comes from authority',()=>{assert.match(media,/durationMillis:voice\.durationMillis/);assert.match(controller,/ready\.durationMillis/);assert.doesNotMatch(controller,/v\.durationMillis/);});
