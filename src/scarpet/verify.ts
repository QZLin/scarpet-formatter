import { tokenize } from './lexer';
import { Token } from './tokens';

export interface TokenComparison {
    ok: boolean;
    reason: string;
}

/**
 * Compares the token stream of two scarpet programs.
 *
 * Formatting must never change what the game sees, so the formatter re-reads
 * its own output and compares it with the input. Two kinds of tokens are left
 * out, because scarpet itself treats them as insignificant:
 *
 * - `;` : the preprocessor deletes redundant semicolons, and a comment may
 *   legally end up on either side of one (see the parser).
 * - `,` directly in front of a closing bracket: scarpet accepts and ignores a
 *   trailing comma in list and map literals.
 *
 * Everything else - including comments and `$` line markers - has to come back
 * unchanged and in order.
 */
export function tokensEquivalent(original: string, formatted: string): TokenComparison {
    const before = significantTokens(original);
    const after = significantTokens(formatted);

    if (before.length !== after.length) {
        return {
            ok: false,
            reason: `token count changed from ${before.length} to ${after.length}`,
        };
    }

    for (let index = 0; index < before.length; index++) {
        const a = before[index];
        const b = after[index];
        if (a.kind !== b.kind || a.text !== b.text) {
            return {
                ok: false,
                reason: `token ${index + 1} changed from ${describe(a)} to ${describe(b)}`,
            };
        }
    }

    return { ok: true, reason: '' };
}

function significantTokens(source: string): Token[] {
    const tokens = tokenize(source).tokens;
    return tokens.filter((token, index) => {
        if (token.kind === 'semicolon') return false;
        if (token.kind === 'comma') {
            const next = nextCodeToken(tokens, index + 1);
            if (next && next.kind === 'close') return false;
        }
        return true;
    });
}

function nextCodeToken(tokens: Token[], from: number): Token | null {
    for (let index = from; index < tokens.length; index++) {
        if (tokens[index].kind !== 'comment') return tokens[index];
    }
    return null;
}

function describe(token: Token): string {
    if (token.kind === 'comment') return `comment '${token.text.trim()}'`;
    return `'${token.text}'`;
}
