/**
 * Token model for the Scarpet language.
 *
 * The shapes here deliberately mirror what the reference implementation
 * (carpet/script/Tokenizer.java) does, so that the formatter never disagrees
 * with the game about where a token starts or ends.
 */

export type TokenKind =
    /** 1, 2.5, -3e-7 (the sign is a separate unary operator), 0xff */
    | 'number'
    /** 'single quoted string, with \' escapes' */
    | 'string'
    /** variable, function name, or one of the reserved words (true/false/null/pi/euler) */
    | 'ident'
    /** an operator such as + - * / % ^ ~ : = += <> -> && || == != < > <= >= ! ... */
    | 'operator'
    /** ( [ { */
    | 'open'
    /** ) ] } */
    | 'close'
    /** , */
    | 'comma'
    /** ; - also an operator in scarpet, but treated structurally here */
    | 'semicolon'
    /** // line comment */
    | 'comment'
    /** $ - the "a newline was here" marker used in command mode */
    | 'lineMarker'
    /** anything the scarpet tokenizer would reject; kept verbatim so we never mangle input */
    | 'unknown';

export interface Token {
    kind: TokenKind;
    /** exact source text of the token */
    text: string;
    /** offset of the first character in the source */
    start: number;
    /** offset one past the last character in the source */
    end: number;
    /** 0 based line of the first character */
    line: number;
    /** 0 based column of the first character */
    column: number;
    /** number of line terminators between the previous token and this one */
    newlinesBefore: number;
    /** true when only whitespace precedes this token on its line */
    startsLine: boolean;
    /**
     * Only set for the operators that scarpet also accepts as prefix operators
     * (- + ! ...). Unary operators are printed without a space after them.
     */
    unary?: boolean;
    /** own line comments that appeared directly above this token */
    leadingComments?: Token[];
    /** comment that appeared at the end of the same line as this token */
    trailingComment?: Token;
}

/** Operators understood by scarpet, longest first so the lexer is greedy. */
export const OPERATORS: readonly string[] = [
    '...',
    '->',
    '>=',
    '<=',
    '==',
    '!=',
    '&&',
    '||',
    '+=',
    '<>',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '<',
    '>',
    '!',
    '~',
    ':',
];

/** Operators that scarpet can use as a prefix (unary) operator. */
const UNARY_CAPABLE = new Set(['-', '+', '!', '...']);

/** Assignment-like operators: the right hand side may move to the next line. */
export const ASSIGNMENT_OPERATORS = new Set(['=', '+=', '<>']);

export function isUnaryCapable(text: string): boolean {
    return UNARY_CAPABLE.has(text);
}

export function isOpenBracket(text: string): boolean {
    return text === '(' || text === '[' || text === '{';
}

export function isCloseBracket(text: string): boolean {
    return text === ')' || text === ']' || text === '}';
}

/** Opening bracket that matches a closing one. */
export function bracketPair(open: string): string {
    switch (open) {
        case '(':
            return ')';
        case '[':
            return ']';
        case '{':
            return '}';
        default:
            return '';
    }
}

export function isCommentToken(token: Token | undefined): token is Token {
    return !!token && token.kind === 'comment';
}

/** Human readable description of a token, used in error messages. */
export function describeToken(token: Token): string {
    if (token.kind === 'comment') return 'comment';
    return `'${token.text}'`;
}
