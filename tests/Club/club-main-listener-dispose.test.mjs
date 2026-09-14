import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');

assert.ok(source.includes('this.listenClick(node, listener, this.disposers);'));
assert.ok(source.includes('this.listenClick(node, listener, this.switchDisposers);'));
assert.ok(source.includes('if (!active) return;'));
assert.ok(source.includes('if (node.isValid) node.off(Button.EventType.CLICK, listener);'));
assert.doesNotMatch(source, /this\.disposers\.push\(\(\) => node\.off\(Button\.EventType\.CLICK, listener\)\)/);
assert.doesNotMatch(source, /this\.switchDisposers\.push\(\(\) => node\.off\(Button\.EventType\.CLICK, listener\)\)/);

console.log('club main listener disposal contract passed');
