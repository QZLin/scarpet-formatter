import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatScarpetWithDetail } from '../src/scarpet/format';
import { parse } from '../src/scarpet/parser';
import { tokensEquivalent } from '../src/scarpet/verify';

/**
 * Mutates real Scarpet programs (and the official documentation examples) and
 * checks the invariants that must hold for every input: no crash, never a
 * modified file when the formatter gives up, never a changed token stream, and
 * a stable result when formatting twice. The seed is fixed so failures here are
 * reproducible.
 */

const POOL = "();,[]{}'//$><=+-*~:!.a1 \n\t\\_";

function corpus(): string[] {
    const samples: string[] = [];
    const fixtureDir = path.join(__dirname, '..', '..', 'test', 'fixtures');
    if (fs.existsSync(fixtureDir)) {
        for (const name of fs.readdirSync(fixtureDir)) {
            samples.push(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
        }
    }
    const docPath = path.join(__dirname, '..', '..', 'docs', 'reference', 'scarpet-Full.md');
    if (fs.existsSync(docPath)) {
        const doc = fs.readFileSync(docPath, 'utf8');
        const pattern = /<pre>([\s\S]*?)<\/pre>/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(doc)) !== null) {
            samples.push(
                match[1]
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, '&')
                    .trim()
            );
        }
    }
    return samples.filter((sample) => sample.length > 0);
}

function makeRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

function mutate(text: string, random: () => number): string {
    const kind = Math.floor(random() * 4);
    const from = Math.floor(random() * text.length);
    const to = Math.min(text.length, from + 1 + Math.floor(random() * 12));
    const randomChar = (): string => POOL[Math.floor(random() * POOL.length)];
    switch (kind) {
        case 0:
            return text.slice(0, from) + text.slice(to);
        case 1: {
            let inserted = '';
            const count = 1 + Math.floor(random() * 6);
            for (let index = 0; index < count; index++) inserted += randomChar();
            return text.slice(0, from) + inserted + text.slice(from);
        }
        case 2:
            return text.slice(0, from) + text.slice(from, to) + text.slice(from, to) + text.slice(to);
        default:
            return text.slice(0, from) + randomChar() + text.slice(to);
    }
}

test('invariants: mutated programs never break the formatter contract', () => {
    const samples = corpus();
    assert.ok(samples.length > 20, 'expected a corpus to mutate');
    const random = makeRandom(20240607);

    for (let iteration = 0; iteration < 400; iteration++) {
        let source = samples[Math.floor(random() * samples.length)];
        const rounds = 1 + Math.floor(random() * 4);
        for (let round = 0; round < rounds; round++) source = mutate(source, random);

        const detail = formatScarpetWithDetail(source);
        if (detail.skipped) {
            assert.equal(detail.text, source, `skipped input was modified: ${detail.reason}`);
            continue;
        }

        const comparison = tokensEquivalent(source, detail.text);
        assert.ok(comparison.ok, `tokens changed: ${comparison.reason}\n${JSON.stringify(source)}`);
        const again = formatScarpetWithDetail(detail.text);
        assert.equal(again.text, detail.text, `not idempotent for ${JSON.stringify(source)}`);
        assert.ok(parse(detail.text).ok, `output does not parse for ${JSON.stringify(source)}`);
    }
});
