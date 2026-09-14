import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const forbid = fs.readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubForbidController.ts', import.meta.url), 'utf8');

assert.ok(main.includes('Number(this.club?.minister ?? 0) !== 2'),
    'alliance creation must be guarded by the current club owner role');
assert.ok(main.includes("forms.show('ui/club/UIUnionCreate', {"),
    'alliance creation must carry the current club context');
assert.ok(forbid.includes('private canManage(): boolean { return Number(this.context.minister ?? 0) > 0; }'),
    'same-table restriction management must use the current club role only');
assert.ok(!forbid.includes('Number(this.context.unionPostType ?? -1) >= 2'),
    'alliance role must not grant management rights in an unrelated club');

console.log('club permission guards passed');
