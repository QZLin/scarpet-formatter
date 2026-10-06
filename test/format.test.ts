import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatScarpet, formatScarpetWithDetail } from '../src/scarpet/format';
import { tokensEquivalent } from '../src/scarpet/verify';

interface Case {
    name: string;
    input: string;
    expected: string;
    options?: Record<string, unknown>;
}

const CASES: Case[] = [
    {
        name: 'binary operators get spaces',
        input: 'a=1+2*3-4',
        expected: 'a = 1 + 2 * 3 - 4\n',
    },
    {
        name: 'unary operators stay glued to their operand',
        input: 'a = -1 + (-b) - -c',
        expected: 'a = -1 + (-b) - -c\n',
    },
    {
        name: 'the accessor operator stays tight',
        input: "list:0:1 == m:'k'",
        expected: "list:0:1 == m:'k'\n",
        options: {},
    },
    {
        name: 'the accessor operator can be spaced out',
        input: 'list:0',
        expected: 'list : 0\n',
        options: { spaceAroundColon: true },
    },
    {
        name: 'the matching operator gets spaces',
        input: "nbt~'x' && a~2",
        expected: "nbt ~ 'x' && a ~ 2\n",
    },
    {
        name: 'the matching operator can be tightened',
        input: 'a~b',
        expected: 'a~b\n',
        options: { spaceAroundMatch: false },
    },
    {
        name: 'operator spacing can be turned off',
        input: 'a+b',
        expected: 'a+b\n',
        options: { spaceAroundOperators: false },
    },
    {
        name: 'operator spacing applies to assignments too',
        input: 'a = 1 + 2',
        expected: 'a=1+2\n',
        options: { spaceAroundOperators: false },
    },
    {
        name: 'commas are followed by a space',
        input: 'f(a,b,c)',
        expected: 'f(a, b, c)\n',
    },
    {
        name: 'calls hug their callee',
        input: 'f (a)',
        expected: 'f(a)\n',
    },
    {
        name: 'statements go to their own line',
        input: 'a=1;b=2;c=3',
        expected: 'a = 1;\nb = 2;\nc = 3\n',
    },
    {
        name: 'function bodies written as blocks are laid out as blocks',
        input: 'foo(a)->(a;b)',
        expected: 'foo(a) -> (\n  a;\n  b\n)\n',
    },
    {
        name: 'single expression bodies stay on the definition line',
        input: 'foo(a)->a+b',
        expected: 'foo(a) -> a + b\n',
    },
    {
        name: 'a statement block as the last argument hangs under the call',
        input: 'loop(10,a;b)',
        expected: 'loop(10,\n  a;\n  b\n)\n',
    },
    {
        name: 'a trailing lambda keeps its body on the call line',
        input: 'map(l,_(x)->(a;b))',
        expected: 'map(l, _(x) -> (\n  a;\n  b\n))\n',
    },
    {
        name: 'a block in the middle of an argument list expands the call',
        input: 'if(c,a;b,d)',
        expected: 'if(\n  c,\n  a;\n  b,\n  d\n)\n',
    },
    {
        name: 'lists and maps keep their brackets tight',
        input: "[1,2,3] {'a'->1,'b'->2}",
        expected: "[1, 2, 3] {'a' -> 1, 'b' -> 2}\n",
    },
    {
        name: 'grouping parentheses stay tight',
        input: '(a+b)*c',
        expected: '(a + b) * c\n',
    },
    {
        name: 'empty calls stay empty',
        input: 'f()',
        expected: 'f()\n',
    },
    {
        name: 'unpacking keeps its operand glued',
        input: 'sum(...[1,2,3])',
        expected: 'sum(...[1, 2, 3])\n',
    },
    {
        name: 'indentation is configurable',
        input: 'foo(a)->(a;b)',
        expected: 'foo(a) -> (\n    a;\n    b\n)\n',
        options: { indentSize: 4 },
    },
    {
        name: 'tabs can be used for indentation',
        input: 'foo(a)->(a;b)',
        expected: 'foo(a) -> (\n\ta;\n\tb\n)\n',
        options: { useTabs: true },
    },
    {
        name: 'js-beautify option names are understood',
        input: 'foo(a)->(a;b)',
        expected: 'foo(a) -> (\n        a;\n        b\n)\n',
        options: { indent_size: 8 },
    },
    {
        name: 'statement blocks can be kept inline',
        input: 'foo(a)->(a;b)',
        expected: 'foo(a) -> (a; b)\n',
        options: { expandStatementBlocks: false },
    },
];

for (const item of CASES) {
    test(`format: ${item.name}`, () => {
        assert.equal(formatScarpet(item.input, item.options), item.expected);
    });
}

test('format: every case is idempotent and token preserving', () => {
    for (const item of CASES) {
        const once = formatScarpet(item.input, item.options);
        const twice = formatScarpet(once, item.options);
        assert.equal(twice, once, `${item.name} is not idempotent`);
        const comparison = tokensEquivalent(item.input, once);
        assert.ok(comparison.ok, `${item.name} changed the token stream: ${comparison.reason}`);
    }
});

test('format: long lines break at arguments', () => {
    const output = formatScarpet(
        'some_function_with_long_name(first_argument_here, second_argument_here, third_argument_here, fourth)',
        { lineWidth: 60 }
    );
    assert.equal(
        output,
        'some_function_with_long_name(\n  first_argument_here,\n  second_argument_here,\n  third_argument_here,\n  fourth\n)\n'
    );
    for (const line of output.split('\n')) {
        assert.ok(line.length <= 60, `line too long: ${line}`);
    }
});

test('format: wrapping can be turned off', () => {
    const source = 'some_function(first_argument, second_argument, third_argument)';
    assert.equal(formatScarpet(source, { lineWidth: 0 }), source + '\n');
    assert.equal(formatScarpet(source, { lineWidth: Number.MAX_SAFE_INTEGER }), source + '\n');
});

test('format: no result line is longer than the configured width', () => {
    const source = `__config() -> {
  'commands' -> {'greet' -> 'greet'},
  'arguments' -> {'name' -> {'type' -> 'string', 'suggest' -> ['a', 'b', 'c']}}
};
greet(name) -> print('hello ' + name + ', welcome to the server');
`;
    const output = formatScarpet(source, { lineWidth: 50 });
    for (const line of output.split('\n')) {
        assert.ok(line.length <= 50, `line too long (${line.length}): ${line}`);
    }
});

test('format: lists that were written multi-line stay multi-line', () => {
    assert.equal(formatScarpet('[\n1, 2,\n3\n]'), '[\n  1,\n  2,\n  3\n]\n');
    assert.equal(formatScarpet('[\n1, 2,\n3\n]', { preserveContainerBreaks: false }), '[1, 2, 3]\n');
});

test('format: trailing commas are preserved, added or removed', () => {
    assert.equal(formatScarpet('[\n1,\n2,\n]'), '[\n  1,\n  2,\n]\n');
    assert.equal(formatScarpet('[\n1,\n2\n]'), '[\n  1,\n  2\n]\n');
    assert.equal(formatScarpet('[\n1,\n2\n]', { trailingComma: 'always' }), '[\n  1,\n  2,\n]\n');
    assert.equal(formatScarpet('[\n1,\n2,\n]', { trailingComma: 'never' }), '[\n  1,\n  2\n]\n');
});

test('format: blank lines are kept but limited', () => {
    assert.equal(formatScarpet('a = 1;\n\n\n\nb = 2'), 'a = 1;\n\n\nb = 2\n');
    assert.equal(formatScarpet('a = 1;\n\n\n\nb = 2', { maxBlankLinesTopLevel: 1 }), 'a = 1;\n\nb = 2\n');
    assert.equal(formatScarpet('a = 1;\n\n\n\nb = 2', { preserveBlankLines: false }), 'a = 1;\nb = 2\n');
});

test('format: comments stay where they belong', () => {
    assert.equal(formatScarpet('a = 1; // note\nb = 2'), 'a = 1; // note\nb = 2\n');
    assert.equal(formatScarpet('a = 1;\n// note\nb = 2'), 'a = 1;\n// note\nb = 2\n');
    assert.equal(formatScarpet('f(a, // note\n b)'), 'f(\n  a, // note\n  b\n)\n');
    assert.equal(formatScarpet('[1,\n2 // two\n]'), '[\n  1,\n  2 // two\n]\n');
    assert.equal(formatScarpet('[\n// nothing\n]'), '[\n  // nothing\n]\n');
    assert.equal(formatScarpet('a = 1 // tail'), 'a = 1 // tail\n');
});

test('format: a comment forces the surrounding call to break', () => {
    const output = formatScarpet('map(list, _(x) -> (a; // inner\n b))');
    assert.equal(output, 'map(\n  list,\n  _(x) -> (\n    a; // inner\n    b\n  )\n)\n');
});

test('format: command block line markers survive', () => {
    assert.equal(formatScarpet('$a = 1;\n$b = 2'), '$a = 1;\n$b = 2\n');
    assert.equal(
        formatScarpet('run() -> (\n$  a = 1;\n$  b = 2\n$)'),
        'run() -> (\n  $a = 1;\n  $b = 2\n  $\n)\n'
    );
});

test('format: a comment in front of an operator keeps its line', () => {
    // regression: the blank line used to grow on every run
    const source = 'foo = 1;\n//This is a\n = 2;';
    assert.equal(formatScarpet(source), 'foo = 1;\n//This is a\n= 2;\n');
    assert.equal(formatScarpet(formatScarpet(source)), formatScarpet(source));
});

test('format: a comment at the end of the file keeps its own line', () => {
    assert.equal(formatScarpet('a = 1;\n// tail'), 'a = 1;\n// tail\n');
    assert.equal(formatScarpet('// only a comment'), '// only a comment\n');
    assert.equal(formatScarpet('// one\n// two'), '// one\n// two\n');
});

test('format: multi-line strings are left exactly as they are', () => {
    assert.equal(formatScarpet("print('one\ntwo')"), "print('one\ntwo')\n");
});

test('format: the final newline can be turned off', () => {
    assert.equal(formatScarpet('a = 1', { endWithNewline: false }), 'a = 1');
    assert.equal(formatScarpet('a = 1', { endWithNewline: true }), 'a = 1\n');
});

test('format: line endings are detected and can be forced', () => {
    assert.equal(formatScarpet('a = 1;\r\nb = 2;\r\n'), 'a = 1;\r\nb = 2;\r\n');
    assert.equal(formatScarpet('a = 1;\nb = 2;\n', { lineEnding: 'crlf' }), 'a = 1;\r\nb = 2;\r\n');
    assert.equal(formatScarpet('a = 1;\r\nb = 2;\r\n', { lineEnding: 'lf' }), 'a = 1;\nb = 2;\n');
});

test('format: an already formatted program is returned untouched', () => {
    const source = "foo(a) -> (\n  a;\n  a + 1\n);\n";
    const detail = formatScarpetWithDetail(source);
    assert.equal(detail.changed, false);
    assert.equal(detail.text, source);
});

test('format: source that cannot be parsed is returned untouched', () => {
    const broken = 'foo(a -> (a; b';
    const detail = formatScarpetWithDetail(broken);
    assert.equal(detail.skipped, true);
    assert.equal(detail.text, broken);
    assert.match(detail.reason, /closed|never closed/);
});

test('format: whitespace only input is left alone', () => {
    assert.equal(formatScarpet('\n\n   \n'), '\n\n   \n');
});

test('format: unknown punctuation is kept verbatim instead of being spaced out', () => {
    assert.equal(formatScarpet('a.b = 1'), 'a.b = 1\n');
});

test('format: the safety net can be turned off', () => {
    const detail = formatScarpetWithDetail('a = 1', { safetyCheck: false });
    assert.equal(detail.skipped, false);
    assert.equal(detail.text, 'a = 1\n');
});

test('format: a whole scarpet app gets a readable shape', () => {
    const source = [
        "__config()->{'scope'->'global','stay_loaded'->true};",
        '__on_start() -> (',
        "    global_state={'count'->0};",
        "print('ready');",
        ');',
        '',
        "greet(name) -> print('hello '+name);",
        '',
        'run() -> (',
        '  loop(10,',
        '    foo = floor(rand(10));',
        "    print(_+' - foo: '+foo)",
        '  )',
        ');',
    ].join('\n');

    assert.equal(
        formatScarpet(source),
        [
            "__config() -> {'scope' -> 'global', 'stay_loaded' -> true};",
            '__on_start() -> (',
            "  global_state = {'count' -> 0};",
            "  print('ready');",
            ');',
            '',
            "greet(name) -> print('hello ' + name);",
            '',
            'run() -> (',
            '  loop(10,',
            '    foo = floor(rand(10));',
            "    print(_ + ' - foo: ' + foo)",
            '  )',
            ');',
            '',
        ].join('\n')
    );
});
