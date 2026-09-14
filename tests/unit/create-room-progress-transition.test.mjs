import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(
  clientRoot,
  'assets/Modules/CreateRoom/Code/PlaySelectorController.ts',
), 'utf8');

test('create-room progress owns the screen before the first Hall request and commits after room handoff', () => {
  const beginAt = source.indexOf('presentationTransition.begin({');
  const createAt = source.indexOf('await this.gateway.create(', beginAt);
  const closeAt = source.indexOf('this.forms.close(FORM_PATH)', createAt);
  const handoffAt = source.indexOf('await this.onCreated(', createAt);
  const commitAt = source.indexOf('await transition.commitAfterPresentation()', handoffAt);

  assert.ok(beginAt >= 0, 'create-room transition is missing');
  const hideAt = source.indexOf('submittingForm.node.active = false', beginAt);
  assert.ok(hideAt > beginAt && hideAt < createAt,
    'create form must hide after its handoff frame is captured and before network creation settles');
  assert.ok(createAt > beginAt, 'progress must start before the Hall create request');
  assert.ok(closeAt > createAt && closeAt < handoffAt, 'create form must close before room handoff starts');
  assert.ok(handoffAt > createAt, 'room handoff must follow authoritative creation');
  assert.ok(commitAt > handoffAt, 'progress must remain until room handoff has completed');
  assert.match(source.slice(beginAt, createAt), /showAfterMs: 0/);
  assert.match(source.slice(beginAt, createAt), /retainCurrentFrame: true/);
  assert.doesNotMatch(source.slice(beginAt, createAt), /this\.host\.active = true/);
  assert.match(source, /transition\.update\('房间已创建，正在加载房间资源\.\.\.'/);
  assert.match(source, /transition\.fail\(error, \(\) => \{ void this\.submit\(\); \}\)/);
});
