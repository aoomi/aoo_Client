import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../..');
const controller = fs.readFileSync(path.join(
    clientRoot,
    'assets/Club/Code/Runtime/LegacyClubMainController.ts',
), 'utf8');

const visibilityMethod = controller.match(
    /private applyClubModeVisibility\(form: LegacyForm\): void \{([\s\S]*?)\n    \}/,
);
assert.ok(visibilityMethod, 'club mode visibility method must exist');
assert.ok(
    visibilityMethod[1].includes(
        "this.active(form, 'top/right_btn/moreNode/childMore/btn_caseSprots', true);",
    ),
    'club safe-box entry must be visible in both ordinary clubs and tournaments',
);
assert.ok(
    !/btn_caseSprots[^\n]*(?:isUnion|unionId|minister|permission)/.test(visibilityMethod[1]),
    'club safe-box entry must not retain tournament or permission visibility gates',
);

console.log('club safe-box default visibility checks passed');
