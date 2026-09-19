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
        "this.active(form, 'Btn_Safe', true);",
    ),
    'club safe-box entry must be visible in both ordinary clubs and tournaments',
);
assert.ok(
    visibilityMethod[1].includes("this.refreshMoreMenuLayout(form, 'mode');"),
    'club mode visibility must immediately reflow the more menu after hiding sibling entries',
);
assert.match(
    controller,
    /semanticName === 'Menu'\) this\.refreshMoreMenuLayout\(form, 'open'\)/,
    'opening the more menu must reflow its visible entries before interaction',
);
assert.match(
    controller,
    /if \(safe\?\.parent === menu\) safe\.setSiblingIndex\(0\)/,
    'every club mode must keep the safe-box entry above the bottom toolbar',
);
assert.ok(
    !/btn_caseSprots[^\n]*(?:isUnion|unionId|minister|permission)/.test(visibilityMethod[1]),
    'club safe-box entry must not retain tournament or permission visibility gates',
);

console.log('club safe-box default visibility checks passed');
