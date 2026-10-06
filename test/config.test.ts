import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseConfig, stripJsonComments } from '../src/scarpet/config';
import { DEFAULT_OPTIONS, resolveOptions } from '../src/scarpet/options';

test('config: comments are stripped, strings are left alone', () => {
    const source = [
        '{',
        '  // a line comment',
        '  "keep": "a // b",',
        '  /* a block comment',
        '     over two lines */',
        '  "tricky": "http://example.com/*not a comment*",',
        '  "escaped": "quote \\" and // slash"',
        '}',
    ].join('\n');
    const parsed = JSON.parse(stripJsonComments(source));
    assert.equal(parsed.keep, 'a // b');
    assert.equal(parsed.tricky, 'http://example.com/*not a comment*');
    assert.equal(parsed.escaped, 'quote " and // slash');
});

test('config: a scarpet section is unwrapped', () => {
    const parsed = parseConfig('{ "scarpet": { "indentSize": 3 }, "onSave": true }');
    assert.deepEqual(parsed, { indentSize: 3 });
});

test('config: a plain option bag is used as is', () => {
    assert.deepEqual(parseConfig('{"indentSize": 5}'), { indentSize: 5 });
});

test('config: broken json does not throw', () => {
    assert.deepEqual(parseConfig('{ not json at all'), {});
    assert.deepEqual(parseConfig('[]'), {});
    assert.deepEqual(parseConfig('null'), {});
});

test('config: js-beautify option names keep working', () => {
    const options = resolveOptions({ indent_size: 3, wrap_line_length: 0, end_with_newline: false });
    assert.equal(options.indentSize, 3);
    assert.equal(options.lineWidth, Number.MAX_SAFE_INTEGER);
    assert.equal(options.endWithNewline, false);
});

test('config: indent_char maps to tabs', () => {
    assert.equal(resolveOptions({ indent_char: '\t' }).useTabs, true);
    assert.equal(resolveOptions({ indent_char: ' ' }).useTabs, false);
});

test('config: unknown and malformed values fall back to the defaults', () => {
    const options = resolveOptions({ nope: 1, indentSize: 'wide', trailingComma: 'sometimes', lineWidth: -3 });
    assert.equal(options.indentSize, DEFAULT_OPTIONS.indentSize);
    assert.equal(options.trailingComma, DEFAULT_OPTIONS.trailingComma);
    assert.equal(options.lineWidth, DEFAULT_OPTIONS.lineWidth);
});

test('config: numbers are clamped to something sensible', () => {
    assert.equal(resolveOptions({ indentSize: -10 }).indentSize, 0);
    assert.equal(resolveOptions({ indentSize: 99 }).indentSize, 16);
    assert.equal(resolveOptions({ maxBlankLines: -2 }).maxBlankLines, 0);
});

test('config: boolean options accept the shapes editors produce', () => {
    assert.equal(resolveOptions({ useTabs: 1 }).useTabs, true);
    assert.equal(resolveOptions({ useTabs: 'false' }).useTabs, false);
    assert.equal(resolveOptions({ useTabs: 'true' }).useTabs, true);
});

test('config: the settings declared in package.json match the defaults', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
    ) as {
        contributes: { configuration: { properties: Record<string, { default?: unknown }> } };
    };
    const properties = packageJson.contributes.configuration.properties;

    for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
        const property = properties[`scarpetFormatter.${key}`];
        assert.ok(property, `package.json does not declare scarpetFormatter.${key}`);
        assert.deepEqual(property.default, value, `scarpetFormatter.${key} default is out of sync`);
    }

    const declared = Object.keys(properties).map((name) => name.replace('scarpetFormatter.', ''));
    const known = [...Object.keys(DEFAULT_OPTIONS), 'enable'];
    assert.deepEqual(declared.sort(), known.sort(), 'package.json declares settings the formatter does not know');
});
