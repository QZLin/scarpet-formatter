import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { topLevelStatementSpan } from '../src/scarpet/range';

const SOURCE = [
    'first() -> 1;',
    'second() -> (',
    '  a = 1;',
    '  b = 2',
    ');',
    'third() -> 3',
].join('\n');

function spanOf(needle: string): string {
    const start = SOURCE.indexOf(needle);
    assert.ok(start >= 0, `${needle} is not in the source`);
    const span = topLevelStatementSpan(SOURCE, start, start + needle.length);
    assert.ok(span, 'expected a span');
    return SOURCE.slice(span.start, span.end);
}

test('range: a selection inside a definition covers the whole definition', () => {
    assert.equal(spanOf('a = 1'), 'second() -> (\n  a = 1;\n  b = 2\n);');
});

test('range: selecting a whole definition keeps it alone', () => {
    assert.equal(spanOf('first()'), 'first() -> 1;');
});

test('range: a selection in the last definition has no trailing semicolon to include', () => {
    assert.equal(spanOf('third'), 'third() -> 3');
});

test('range: a selection spanning several definitions covers all of them', () => {
    const start = SOURCE.indexOf('second');
    const end = SOURCE.indexOf('third') + 2;
    const span = topLevelStatementSpan(SOURCE, start, end);
    assert.ok(span);
    assert.equal(SOURCE.slice(span.start, span.end), 'second() -> (\n  a = 1;\n  b = 2\n);\nthird() -> 3');
});

test('range: an empty source has no span', () => {
    assert.equal(topLevelStatementSpan('', 0, 0), null);
});

test('range: a selection in whitespace resolves to the statement that follows', () => {
    const start = SOURCE.indexOf('\n');
    const span = topLevelStatementSpan(SOURCE, start, start + 1);
    assert.ok(span);
    assert.equal(SOURCE.slice(span.start, span.end), 'second() -> (\n  a = 1;\n  b = 2\n);');
});
