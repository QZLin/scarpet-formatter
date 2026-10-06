import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatScarpetWithDetail } from '../src/scarpet/format';
import { parse } from '../src/scarpet/parser';
import { tokensEquivalent } from '../src/scarpet/verify';

const DOC_PATH = path.join(__dirname, '..', '..', 'docs', 'reference', 'scarpet-Full.md');
const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures');

function unescapeHtml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Every `<pre>` block of the official scarpet documentation is a test case. */
function documentationSamples(): string[] {
    if (!fs.existsSync(DOC_PATH)) return [];
    const text = fs.readFileSync(DOC_PATH, 'utf8');
    const samples: string[] = [];
    const pattern = /<pre>([\s\S]*?)<\/pre>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const sample = unescapeHtml(match[1]).trim();
        if (sample.length > 0) samples.push(sample);
    }
    return samples;
}

function fixtureSamples(): string[] {
    if (!fs.existsSync(FIXTURE_DIR)) return [];
    return fs
        .readdirSync(FIXTURE_DIR)
        .filter((name) => name.endsWith('.sc'))
        .map((name) => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function assertSafe(before: string, after: string, label: string): void {
    const comparison = tokensEquivalent(before, after);
    assert.ok(comparison.ok, `${label}: formatting changed the code: ${comparison.reason}`);
    assert.ok(parse(after).ok, `${label}: formatted output does not parse`);
    const again = formatScarpetWithDetail(after);
    assert.equal(again.text, after, `${label}: formatting is not idempotent\n---\n${after}\n---\n${again.text}`);
}

test('invariants: the documented examples format safely', () => {
    const samples = documentationSamples();
    assert.ok(samples.length > 100, `expected the documentation to provide samples, got ${samples.length}`);

    let formatted = 0;
    for (const sample of samples) {
        const detail = formatScarpetWithDetail(sample);
        if (detail.skipped) {
            // the safety net must hand back exactly what it was given
            assert.equal(detail.text, sample, `skipped input was modified: ${detail.reason}`);
            continue;
        }
        formatted++;
        assertSafe(sample, detail.text, `doc sample ${formatted}`);
    }

    assert.ok(formatted > 100, `expected most samples to be formatted, got ${formatted}`);
});

test('invariants: fixture apps format safely', () => {
    const samples = fixtureSamples();
    assert.ok(samples.length > 0, 'expected fixture apps in test/fixtures');
    for (const sample of samples) {
        const detail = formatScarpetWithDetail(sample);
        assert.equal(detail.skipped, false, `fixture was skipped: ${detail.reason}`);
        assertSafe(sample, detail.text, 'fixture');
    }
});

test('invariants: every prefix of a program is handled without damage', () => {
    const samples = [...fixtureSamples(), ...documentationSamples().slice(0, 40)];
    for (const sample of samples) {
        const step = Math.max(1, Math.floor(sample.length / 40));
        for (let cut = 0; cut <= sample.length; cut += step) {
            const prefix = sample.slice(0, cut);
            const detail = formatScarpetWithDetail(prefix);
            if (detail.skipped) {
                assert.equal(detail.text, prefix);
                continue;
            }
            assertSafe(prefix, detail.text, `prefix of ${cut} characters`);
        }
    }
});

test('invariants: odd input never throws', () => {
    const odd = [
        '',
        '   ',
        '(',
        ')',
        '[',
        "'",
        '//',
        '$',
        '..',
        '...',
        '->',
        'a ->',
        'f(a,,b)',
        '[1,2',
        'a = = b',
        '0x',
        '1e',
        '\u0000',
        'π = 3',
        'a\r\nb',
        '/* not a scarpet comment */',
        'f(a) -> (a; b) -> (c; d)',
    ];
    for (const source of odd) {
        const detail = formatScarpetWithDetail(source);
        if (!detail.skipped) assertSafe(source, detail.text, JSON.stringify(source));
    }
});
