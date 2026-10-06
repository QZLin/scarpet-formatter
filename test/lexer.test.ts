import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenize } from '../src/scarpet/lexer';
import { Token } from '../src/scarpet/tokens';

function kinds(source: string): string[] {
    return tokenize(source).tokens.map((token) => `${token.kind}:${token.text}`);
}

function first(source: string): Token {
    const token = tokenize(source).tokens[0];
    assert.ok(token, `expected at least one token for ${JSON.stringify(source)}`);
    return token;
}

test('lexer keeps the source text of every token verbatim', () => {
    assert.deepEqual(kinds("a = 1 + 2.5e-3"), [
        'ident:a',
        'operator:=',
        'number:1',
        'operator:+',
        'number:2.5e-3',
    ]);
});

test('lexer understands hex numbers and trailing pieces', () => {
    assert.deepEqual(kinds('0xff 0X1 1.2.3 1e+4'), ['number:0xff', 'number:0X1', 'number:1.2.3', 'number:1e+4']);
});

test('lexer skips whitespace but records the line breaks before a token', () => {
    const tokens = tokenize('a\n\n\nb').tokens;
    assert.equal(tokens[0].newlinesBefore, 0);
    assert.equal(tokens[1].newlinesBefore, 3);
    assert.equal(tokens[1].startsLine, true);
    assert.equal(tokens[1].line, 3);
});

test('lexer handles \r\n as a single line break', () => {
    const tokens = tokenize('a\r\nb').tokens;
    assert.equal(tokens[1].newlinesBefore, 1);
    assert.equal(tokens[1].line, 1);
});

test('lexer reads single quoted strings with escapes', () => {
    assert.deepEqual(kinds("'foo' 'it\\'s' 'a\\\\b'"), [
        "string:'foo'",
        "string:'it\\'s'",
        "string:'a\\\\b'",
    ]);
});

test('lexer accepts strings that span several lines', () => {
    const tokens = tokenize("'line one\nline two'").tokens;
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].text, "'line one\nline two'");
    assert.equal(tokens[0].kind, 'string');
});

test('lexer reports an unterminated string but still produces a token', () => {
    const result = tokenize("a = 'oops");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Unterminated string/);
    assert.equal(result.tokens[result.tokens.length - 1].kind, 'string');
});

test('lexer reads line comments and stops at the newline', () => {
    const tokens = tokenize('a // note\nb').tokens;
    assert.deepEqual(
        tokens.map((token) => token.kind),
        ['ident', 'comment', 'ident']
    );
    assert.equal(tokens[1].text, '// note');
    assert.equal(tokens[2].newlinesBefore, 1);
});

test('lexer treats a lone slash as division', () => {
    assert.deepEqual(kinds('_/foo'), ['ident:_', 'operator:/', 'ident:foo']);
});

test('lexer is greedy with operators', () => {
    assert.deepEqual(kinds('a->b>=c!=d...e<>f+=g'), [
        'ident:a',
        'operator:->',
        'ident:b',
        'operator:>=',
        'ident:c',
        'operator:!=',
        'ident:d',
        'operator:...',
        'ident:e',
        'operator:<>',
        'ident:f',
        'operator:+=',
        'ident:g',
    ]);
});

test('lexer knows which operators can be unary in this position', () => {
    const tokens = tokenize('a - -1 + !b * ...c').tokens;
    const minus = tokens.filter((token) => token.kind === 'operator' && token.text === '-');
    assert.equal(minus[0].unary, false);
    assert.equal(minus[1].unary, true);
    const bang = tokens.find((token) => token.text === '!');
    assert.equal(bang?.unary, true);
    const dots = tokens.find((token) => token.text === '...');
    assert.equal(dots?.unary, true);
});

test('lexer sees an operator after a comma or an opening bracket as unary', () => {
    const tokens = tokenize('f(a, -1) g[-2]').tokens;
    const operators = tokens.filter((token) => token.kind === 'operator');
    assert.deepEqual(
        operators.map((token) => token.unary),
        [true, true]
    );
});

test('lexer reads the $ line markers used by command blocks', () => {
    assert.deepEqual(kinds('$a = 1;\n$b'), [
        'lineMarker:$',
        'ident:a',
        'operator:=',
        'number:1',
        'semicolon:;',
        'lineMarker:$',
        'ident:b',
    ]);
});

test('lexer keeps punctuation scarpet does not know about', () => {
    assert.deepEqual(kinds('a.b'), ['ident:a', 'unknown:.', 'ident:b']);
    assert.deepEqual(kinds('@e'), ['unknown:@', 'ident:e']);
});

test('lexer reads identifiers with underscores and unicode letters', () => {
    assert.deepEqual(kinds('_x _ global_state ä'), ['ident:_x', 'ident:_', 'ident:global_state', 'ident:ä']);
});

test('lexer records positions of every token', () => {
    const token = first('abc');
    assert.equal(token.start, 0);
    assert.equal(token.end, 3);
    assert.equal(token.line, 0);
    assert.equal(token.column, 0);
});

test('lexer produces a usable token list for an empty program', () => {
    const result = tokenize('');
    assert.deepEqual(result.tokens, []);
    assert.deepEqual(result.errors, []);
});
