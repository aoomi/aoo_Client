import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubPromotionController.ts', import.meta.url),
    'utf8',
);

test('captain record and report lists accept direct and compatibility-wrapped arrays', () => {
    assert.match(source, /PromotionRecord\[\] \| LegacyListEnvelope<PromotionRecord>/);
    assert.match(source, /Array<Record<string, unknown>> \| LegacyListEnvelope<Record<string, unknown>>/);
    assert.match(source, /if \(Array\.isArray\(value\)\) return value;/);
    assert.match(source, /if \(Array\.isArray\(value\.items\)\) return value\.items;/);
    assert.match(source, /if \(Array\.isArray\(value\.list\)\) return value\.list;/);
});

test('captain record and report requests emit bounded diagnostic outcomes', () => {
    for (const marker of [
        'record-list-start', 'record-list-success', 'record-list-failed',
        'report-list-start', 'report-list-success', 'report-list-failed',
    ]) assert.match(source, new RegExp(`\\[ClubPromotion\\] ${marker}`));
    assert.match(source, /rowCount: rows\.length/);
});

test('closing a captain child form only clears dynamic listeners owned by that form', () => {
    assert.match(source, /rowDisposers = new Map<Node, Array<\(\) => void>>\(\)/);
    assert.match(source, /onClose: \(form\) => \{ this\.clearRows\(form\.node\); this\.recordForm = null; \}/);
    assert.match(source, /this\.rowDisposers\.get\(scope\) \?\? \[\]/);
    assert.match(source, /this\.rowDisposers\.delete\(owner\)/);
    assert.doesNotMatch(source, /onClose: \(\) => \{ this\.(?:form|recordForm|activeForm) = null; this\.clearRows\(\); \}/);
});

test('the first captain row is always self and remains data-only', () => {
    assert.match(source, /for \(const \[index, row\] of rows\.entries\(\)\)/);
    assert.match(source, /const isSelf = index === 0 \|\| pid === this\.playerId/);
    assert.match(source, /if \(isSelf\) \{[\s\S]*?btn_ShowBtn'[\s\S]*?btn_control'[\s\S]*?continue;/);
    assert.match(source, /\[ClubPromotion\] manager-list-render/);
});
