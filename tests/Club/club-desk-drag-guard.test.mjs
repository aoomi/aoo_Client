import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');

assert.match(source, /dx \* dx \+ dy \* dy > 144/,
    '桌子手势必须用移动阈值区分点击和滑动');
assert.match(source, /if \(pointerDragged\) suppressClickUntil = Date\.now\(\) \+ 300/,
    '滑动结束后必须抑制随后合成的 CLICK');
assert.match(source, /const shouldOpen = pointerStart !== null && !pointerDragged/);
assert.match(source, /Node\.EventType\.TOUCH_CANCEL, cancelPointer/);

console.log('club desk drag guard contract passed');
