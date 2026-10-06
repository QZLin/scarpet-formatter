import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    Doc,
    breakParent,
    concat,
    conditionalGroup,
    group,
    hardline,
    ifBreak,
    indent,
    join,
    line,
    lineSuffix,
    printDocToString,
    propagateBreaks,
    softline,
} from '../src/scarpet/doc';

const OPTIONS = { width: 40, useTabs: false, tabWidth: 2 };

function print(doc: Doc, width = OPTIONS.width): string {
    return printDocToString(doc, { ...OPTIONS, width });
}

test('doc: a group that fits stays on one line', () => {
    const doc = group(concat(['f(', indent(concat([softline, join(concat([',', line]), ['a', 'b'])])), softline, ')']));
    assert.equal(print(doc), 'f(a, b)');
});

test('doc: a group that does not fit breaks at every line', () => {
    const doc = group(
        concat([
            'a_function_with_a_long_name(',
            indent(concat([softline, join(concat([',', line]), ['first_argument', 'second_argument'])])),
            softline,
            ')',
        ])
    );
    assert.equal(print(doc), 'a_function_with_a_long_name(\n  first_argument,\n  second_argument\n)');
});

test('doc: indentation grows with every level', () => {
    const doc = group(
        concat(['a(', indent(concat([softline, group(concat(['b(', indent(concat([softline, 'c'])), softline, ')']))])), softline, ')'])
    );
    assert.equal(print(doc, 5), 'a(\n  b(\n    c\n  )\n)');
});

test('doc: a hard line always breaks, even inside a flat group', () => {
    const doc = group(concat(['f(', indent(concat([softline, 'a', hardline, 'b'])), softline, ')']));
    assert.equal(print(doc), 'f(\n  a\n  b\n)');
});

test('doc: ifBreak follows the mode of its group', () => {
    const flat = group(concat(['[', indent(concat([softline, 'a', ifBreak(',')])), softline, ']']));
    assert.equal(print(flat), '[a]');
    const long = 'a'.repeat(60);
    const broken = group(concat(['[', indent(concat([softline, long, ifBreak(',')])), softline, ']']));
    assert.equal(print(broken), `[\n  ${long},\n]`);
});

test('doc: line suffixes are flushed when the line ends', () => {
    const doc = concat(['a', lineSuffix(' // note'), ',', line, 'b']);
    assert.equal(print(doc), 'a, // note\nb');
});

test('doc: hard breaks do not propagate out of an isolated group', () => {
    const forced = group(concat([hardline]), {});
    propagateBreaks(forced);
    assert.equal(forced.break, true);

    const isolated = group(concat([hardline]), { isolate: true });
    propagateBreaks(isolated);
    assert.equal(isolated.break, undefined);

    const outer = group(concat(['x = ', group(indent(concat([hardline, 'body'])), { isolate: true })]));
    propagateBreaks(outer);
    assert.equal(outer.break, undefined);
    assert.equal(print(outer), 'x =\n  body');
});

test('doc: a comment style break does propagate through an isolated group', () => {
    const outer = group(concat(['x = ', group(concat(['a', lineSuffix(' // note'), breakParent]), { isolate: true })]));
    propagateBreaks(outer);
    assert.equal(outer.break, true);
});

test('doc: a conditional group picks the first layout that fits', () => {
    const hug = concat(['f(a, ', 'g(', indent(concat([hardline, 'body'])), hardline, ')', ')']);
    const exploded = group(concat(['f(', indent(concat([softline, 'a,', line, 'g(...)'])), softline, ')']));
    assert.equal(print(conditionalGroup([hug, exploded])), 'f(a, g(\n  body\n))');
    assert.equal(
        print(conditionalGroup([concat(['way too long to ever fit on one single line at all']), exploded])),
        'f(\n  a,\n  g(...)\n)'
    );
});

test('doc: trailing whitespace is never emitted', () => {
    const doc = concat(['a', line, line, 'b']);
    assert.equal(print(doc), 'a\n\nb');
});

test('doc: soft lines vanish when flat and break when not', () => {
    assert.equal(print(group(concat(['a', softline, 'b']))), 'ab');
    assert.equal(print(group(concat(['a', softline, 'b', hardline]))), 'a\nb\n');
});
