import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath => fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('activity windows do not report optional catalog hydration as an open failure', () => {
    const source = read('assets/Modules/Activity/Code/TaskController.ts');
    const openBody = source.slice(source.indexOf('public async open'), source.indexOf('public destroy'));
    assert.match(openBody, /legacy-activity-unavailable/);
    assert.doesNotMatch(openBody, /this\.error\(/);
    assert.match(source, /private async claim[\s\S]*this\.error\(e\)/);
});

test('identity windows keep initial status hydration non-blocking', () => {
    const source = read('assets/Modules/Profile/Code/IdentityController.ts');
    assert.match(source, /openRealName[\s\S]*catch\(e\)\{this\.unavailable\(g,e\);\}/);
    assert.match(source, /openPhone[\s\S]*catch\(e\)\{this\.unavailable\(g,e\);\}/);
    assert.match(source, /private async run[\s\S]*catch\(e\)\{this\.report\(e\);\}/);
});

test('store window opens without surfacing optional catalog hydration failure', () => {
    const source = read('assets/Modules/Store/Code/StoreController.ts');
    const openBody = source.slice(source.indexOf('public async open'), source.indexOf('public destroy'));
    assert.match(openBody, /legacy-store-unavailable/);
    assert.doesNotMatch(openBody, /this\.reportError\(/);
    assert.match(source, /private async purchase[\s\S]*this\.reportError\(error\)/);
});
