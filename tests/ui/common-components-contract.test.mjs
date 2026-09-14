import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scroll = await readFile(new URL('../../assets/Common/Code/UI/UnifiedScroll.ts', import.meta.url), 'utf8');
const interaction = await readFile(new URL('../../assets/Common/Code/UI/Interaction.ts', import.meta.url), 'utf8');
const presentation = await readFile(new URL('../../assets/Common/Code/UI/Presentation.ts', import.meta.url), 'utf8');
const countdown = await readFile(new URL('../../assets/Common/Code/UI/CountdownLabel.ts', import.meta.url), 'utf8');
const infrastructure = await readFile(new URL('../../assets/Common/Code/UI/Infrastructure.ts', import.meta.url), 'utf8');

assert.ok(
    /@requireComponent\(ScrollView\)/.test(scroll)
    || (/getComponent\(ScrollView\)/.test(scroll) && /requires native ScrollView/.test(scroll)),
    'UnifiedScroll must enforce its native ScrollView dependency',
);
assert.match(scroll, /inertia:\s*true/);
assert.match(scroll, /bounceDuration:\s*0\.23/);
assert.match(scroll, /class VirtualList<T>/);
assert.match(scroll, /class Pagination/);
assert.match(interaction, /finally \{ this\.busy = false/);
assert.match(interaction, /class PopupStack/);
assert.match(interaction, /private prune\(\)/);
assert.match(interaction, /stored === null \|\| stored\.trim\(\) === ''/);
assert.match(presentation, /loadingCount/);
assert.match(presentation, /private readonly pooled = new Set<T>\(\)/);
assert.match(presentation, /if \(!node\.isValid \|\| this\.pooled\.has\(node\)\) return/);
assert.match(countdown, /class CountdownLabel/);
assert.match(infrastructure, /asset\.addRef\(\)/);
assert.match(infrastructure, /asset\.decRef\(\)/);
assert.match(infrastructure, /class ScopedUiController/);
assert.match(scroll, /Number\.isInteger\(overscan\)/);
assert.match(scroll, /Number\.isInteger\(page\)/);
assert.match(scroll, /normalizePages/);
console.log('common component contracts passed');
