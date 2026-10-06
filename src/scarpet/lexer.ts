import { OPERATORS, Token, TokenKind, isUnaryCapable } from './tokens';

export interface LexResult {
    tokens: Token[];
    /** problems that make the file unformattable (unterminated string, ...) */
    errors: string[];
}

interface Cursor {
    source: string;
    index: number;
    line: number;
    column: number;
}

const LETTER = /[\p{L}]/u;
const DIGIT = /[\p{Nd}]/u;

function isWhitespace(ch: string): boolean {
    // Java's Character.isWhitespace, which is what scarpet uses.
    return (
        ch === ' ' ||
        ch === '\t' ||
        ch === '\n' ||
        ch === '\r' ||
        ch === '\f' ||
        ch === '\u000b' ||
        ch === '\u001c' ||
        ch === '\u001d' ||
        ch === '\u001e' ||
        ch === '\u001f'
    );
}

function isDigit(ch: string): boolean {
    return ch !== '' && DIGIT.test(ch);
}

function isLetter(ch: string): boolean {
    return ch !== '' && LETTER.test(ch);
}

function isIdentStart(ch: string): boolean {
    return ch === '_' || isLetter(ch);
}

function isIdentPart(ch: string): boolean {
    return ch === '_' || isLetter(ch) || isDigit(ch);
}

function isHexDigit(ch: string): boolean {
    return (
        ch === 'x' ||
        ch === 'X' ||
        (ch >= '0' && ch <= '9') ||
        (ch >= 'a' && ch <= 'f') ||
        (ch >= 'A' && ch <= 'F')
    );
}

/**
 * Turns scarpet source into a flat token list. The lexer never throws: anything
 * it cannot make sense of becomes an `unknown` token (kept verbatim) or is
 * reported in `errors` while still producing a usable token list.
 */
export function tokenize(source: string): LexResult {
    const tokens: Token[] = [];
    const errors: string[] = [];
    const cursor: Cursor = { source, index: 0, line: 0, column: 0 };

    let newlinesBefore = 0;
    let onlyWhitespaceOnLine = true;

    const peek = (offset = 1): string =>
        cursor.index + offset < source.length ? source.charAt(cursor.index + offset) : '';

    const advance = (count = 1): void => {
        for (let i = 0; i < count && cursor.index < source.length; i++) {
            const ch = source.charAt(cursor.index);
            cursor.index++;
            if (ch === '\n') {
                cursor.line++;
                cursor.column = 0;
            } else {
                cursor.column++;
            }
        }
    };

    const push = (kind: TokenKind, startIndex: number, startLine: number, startColumn: number): Token => {
        const token: Token = {
            kind,
            text: source.slice(startIndex, cursor.index),
            start: startIndex,
            end: cursor.index,
            line: startLine,
            column: startColumn,
            newlinesBefore,
            startsLine: onlyWhitespaceOnLine,
        };
        tokens.push(token);
        newlinesBefore = 0;
        onlyWhitespaceOnLine = false;
        return token;
    };

    while (cursor.index < source.length) {
        const ch = source.charAt(cursor.index);

        if (isWhitespace(ch)) {
            if (ch === '\n' || ch === '\r') {
                newlinesBefore++;
                // \r\n counts as a single line break
                if (ch === '\r' && peek() === '\n') {
                    advance(2);
                    continue;
                }
                advance();
                onlyWhitespaceOnLine = true;
                continue;
            }
            advance();
            continue;
        }

        const startIndex = cursor.index;
        const startLine = cursor.line;
        const startColumn = cursor.column;

        // comments -------------------------------------------------------
        if (ch === '/' && peek() === '/') {
            while (cursor.index < source.length && source.charAt(cursor.index) !== '\n' && source.charAt(cursor.index) !== '\r') {
                advance();
            }
            push('comment', startIndex, startLine, startColumn);
            continue;
        }

        // line markers used by command blocks -----------------------------
        if (ch === '$') {
            advance();
            push('lineMarker', startIndex, startLine, startColumn);
            continue;
        }

        // numbers ---------------------------------------------------------
        if (isDigit(ch)) {
            const isHex = ch === '0' && (peek() === 'x' || peek() === 'X');
            while (cursor.index < source.length) {
                const current = source.charAt(cursor.index);
                if (isHex) {
                    if (!isHexDigit(current)) break;
                    advance();
                    continue;
                }
                if (isDigit(current) || current === '.' || current === 'e' || current === 'E') {
                    advance();
                    continue;
                }
                const previous = source.charAt(cursor.index - 1);
                if ((current === '-' || current === '+') && (previous === 'e' || previous === 'E')) {
                    advance();
                    continue;
                }
                break;
            }
            push('number', startIndex, startLine, startColumn);
            continue;
        }

        // strings ---------------------------------------------------------
        if (ch === "'") {
            advance();
            let closed = false;
            while (cursor.index < source.length) {
                const current = source.charAt(cursor.index);
                if (current === '\\') {
                    // scarpet consumes the backslash plus the escaped character
                    advance(2);
                    continue;
                }
                if (current === "'") {
                    advance();
                    closed = true;
                    break;
                }
                advance();
            }
            if (!closed) {
                errors.push(`Unterminated string starting on line ${startLine + 1}`);
            }
            push('string', startIndex, startLine, startColumn);
            continue;
        }

        // identifiers -----------------------------------------------------
        if (isIdentStart(ch)) {
            advance();
            while (cursor.index < source.length && isIdentPart(source.charAt(cursor.index))) {
                advance();
            }
            push('ident', startIndex, startLine, startColumn);
            continue;
        }

        // brackets and separators ----------------------------------------
        if (ch === '(' || ch === '[' || ch === '{') {
            advance();
            push('open', startIndex, startLine, startColumn);
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            advance();
            push('close', startIndex, startLine, startColumn);
            continue;
        }
        if (ch === ',') {
            advance();
            push('comma', startIndex, startLine, startColumn);
            continue;
        }
        if (ch === ';') {
            advance();
            push('semicolon', startIndex, startLine, startColumn);
            continue;
        }

        // operators -------------------------------------------------------
        let matched = '';
        for (const operator of OPERATORS) {
            if (source.startsWith(operator, cursor.index)) {
                matched = operator;
                break;
            }
        }
        if (matched) {
            advance(matched.length);
            const token = push('operator', startIndex, startLine, startColumn);
            token.text = matched;
            if (isUnaryCapable(matched)) {
                token.unary = isUnaryContext(tokens);
            }
            continue;
        }

        // anything else: keep verbatim, one character at a time -------
        advance();
        push('unknown', startIndex, startLine, startColumn);
    }

    return { tokens, errors };
}

/**
 * scarpet decides between the binary and the unary flavour of `-`, `+`, `!` and
 * `...` from the preceding token only, so we do exactly the same. Comments and
 * `$` markers do not count as preceding tokens (the reference tokenizer skips
 * both when looking back).
 */
function isUnaryContext(tokens: Token[]): boolean {
    let index = tokens.length - 2;
    while (index >= 0 && (tokens[index].kind === 'comment' || tokens[index].kind === 'lineMarker')) {
        index--;
    }
    const previous = index >= 0 ? tokens[index] : undefined;
    if (!previous) return true;
    switch (previous.kind) {
        case 'operator':
        case 'semicolon':
        case 'comma':
        case 'open':
            return true;
        default:
            return false;
    }
}
