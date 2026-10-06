import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArguments } from '../src/cli';

test('cli: no arguments reads standard input', () => {
    const args = parseArguments([]);
    assert.deepEqual(args.files, []);
    assert.equal(args.write, false);
    assert.equal(args.check, false);
});

test('cli: files and flags are collected', () => {
    const args = parseArguments(['--write', 'a.sc', 'b.sc', '--check']);
    assert.deepEqual(args.files, ['a.sc', 'b.sc']);
    assert.equal(args.write, true);
    assert.equal(args.check, true);
});

test('cli: options with values are parsed', () => {
    const args = parseArguments(['--indent', '4', '--line-width', '90', '--trailing-comma', 'always', 'x.sc']);
    assert.deepEqual(args.overrides, { indentSize: 4, lineWidth: 90, trailingComma: 'always' });
    assert.deepEqual(args.files, ['x.sc']);
});

test('cli: a bare -- separator is ignored so package manager run scripts work', () => {
    const args = parseArguments(['--', '--write', 'a.sc']);
    assert.equal(args.write, true);
    assert.deepEqual(args.files, ['a.sc']);
});

test('cli: a lone dash means standard input', () => {
    assert.deepEqual(parseArguments(['-']).files, ['-']);
    assert.deepEqual(parseArguments(['--stdin']).files, ['-']);
});

test('cli: unknown options are rejected', () => {
    assert.throws(() => parseArguments(['--nope']), /Unknown option/);
    assert.throws(() => parseArguments(['--indent']), /Missing value/);
});

test('cli: help and version shortcuts are recognised', () => {
    assert.equal(parseArguments(['-h']).help, true);
    assert.equal(parseArguments(['--help']).help, true);
    assert.equal(parseArguments(['-v']).version, true);
    assert.equal(parseArguments(['--version']).version, true);
});
