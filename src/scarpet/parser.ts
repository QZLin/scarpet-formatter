import { tokenize } from './lexer';
import { Token, bracketPair } from './tokens';

/** A sequence of elements separated by commas. */
export interface Part {
    elems: Elem[];
}

/** A bracket delimited sequence. The program itself is a container without brackets. */
export interface Container {
    kind: 'container';
    /** '(' '[' '{' or null for the whole program */
    bracket: string | null;
    open: Token | null;
    close: Token | null;
    parts: Part[];
    /** the source had a line break somewhere between the opening and closing bracket */
    multiline: boolean;
    /** the source had a comma directly before the closing bracket */
    trailingComma: boolean;
}

export type Elem = Token | Container;

export interface ParseResult {
    ok: boolean;
    errors: string[];
    program: Container;
    /** comments that follow the last token of the file */
    danglingComments: Token[];
    /** the flat token list the tree was built from */
    tokens: Token[];
}

export function isContainer(elem: Elem): elem is Container {
    return (elem as Container).kind === 'container';
}

export function isEmptyContainer(container: Container): boolean {
    return container.parts.length === 1 && container.parts[0].elems.length === 0;
}

/** True when the container holds no code, only comments. */
export function hasOnlyComments(container: Container): boolean {
    if (!isEmptyContainer(container)) return false;
    return !!container.close && !!container.close.leadingComments && container.close.leadingComments.length > 0;
}

/**
 * Builds the bracket tree of a scarpet source and attaches every comment to the
 * token it belongs to. Never throws; problems are reported in `errors` and make
 * the result unusable for formatting (`ok === false`).
 */
export function parse(source: string): ParseResult {
    const { tokens, errors } = tokenize(source);
    const program = parseContainers(tokens, errors);
    const danglingComments = attachComments(tokens);
    return { ok: errors.length === 0, errors, program, danglingComments, tokens };
}

function newContainer(bracket: string | null, open: Token | null): Container {
    return {
        kind: 'container',
        bracket,
        open,
        close: null,
        parts: [{ elems: [] }],
        multiline: false,
        trailingComma: false,
    };
}

function parseContainers(tokens: Token[], errors: string[]): Container {
    const program = newContainer(null, null);
    const stack: Container[] = [program];

    for (const token of tokens) {
        if (token.kind === 'comment') continue;
        const current = stack[stack.length - 1];
        const part = current.parts[current.parts.length - 1];

        if (token.newlinesBefore > 0) {
            for (const container of stack) container.multiline = true;
        }

        switch (token.kind) {
            case 'open': {
                const container = newContainer(token.text, token);
                part.elems.push(container);
                stack.push(container);
                break;
            }
            case 'close': {
                if (stack.length === 1) {
                    errors.push(`Unmatched '${token.text}' on line ${token.line + 1}`);
                    break;
                }
                const container = stack.pop() as Container;
                const expected = bracketPair(container.bracket || '');
                if (expected !== token.text) {
                    errors.push(
                        `'${container.bracket}' on line ${(container.open as Token).line + 1} is closed by '${token.text}' on line ${token.line + 1}`
                    );
                }
                container.close = token;
                if (container.parts.length > 1 && container.parts[container.parts.length - 1].elems.length === 0) {
                    container.trailingComma = true;
                }
                break;
            }
            case 'comma': {
                current.parts.push({ elems: [] });
                break;
            }
            default: {
                part.elems.push(token);
                break;
            }
        }
    }

    for (let index = 1; index < stack.length; index++) {
        const container = stack[index];
        errors.push(`'${container.bracket}' on line ${(container.open as Token).line + 1} is never closed`);
    }

    return program;
}

/**
 * Comments are pulled out of the tree and hung on the nearest code token, either
 * as a leading comment (own line) or as a trailing one (same line). A trailing
 * comment on a `,` or `;` belongs to the element before the separator, because
 * that is where it has to be printed.
 */
function attachComments(tokens: Token[]): Token[] {
    const codeTokens: number[] = [];
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].kind !== 'comment') codeTokens.push(index);
    }

    const dangling: Token[] = [];
    let cursor = 0; // first code token after the comment being processed

    for (let index = 0; index < tokens.length; index++) {
        const comment = tokens[index];
        if (comment.kind !== 'comment') continue;
        while (cursor < codeTokens.length && codeTokens[cursor] < index) cursor++;
        const nextToken = cursor < codeTokens.length ? tokens[codeTokens[cursor]] : null;
        // An own line comment in front of a separator belongs to the element
        // after it; separators are never printed on their own.
        const nextElement = findNextElementToken(tokens, codeTokens, cursor);
        let previousPosition = cursor - 1;

        if (!comment.startsLine && previousPosition >= 0) {
            while (
                previousPosition >= 0 &&
                (tokens[codeTokens[previousPosition]].kind === 'comma' ||
                    tokens[codeTokens[previousPosition]].kind === 'semicolon')
            ) {
                previousPosition--;
            }
            if (previousPosition >= 0) {
                const target = tokens[codeTokens[previousPosition]];
                if (!target.trailingComment) {
                    target.trailingComment = comment;
                    continue;
                }
            }
        }

        const leadingTarget = comment.startsLine && nextElement ? nextElement : nextToken;
        if (leadingTarget) {
            pushLeading(leadingTarget, comment);
        } else if (!comment.startsLine && previousPosition >= 0) {
            const target = tokens[codeTokens[previousPosition]];
            if (!target.trailingComment) {
                target.trailingComment = comment;
            } else {
                dangling.push(comment);
            }
        } else {
            // an own line comment at the end of the file keeps its own line
            dangling.push(comment);
        }
    }

    return dangling;
}

function findNextElementToken(tokens: Token[], codeTokens: number[], fromPosition: number): Token | null {
    for (let position = fromPosition; position < codeTokens.length; position++) {
        const token = tokens[codeTokens[position]];
        if (token.kind !== 'comma' && token.kind !== 'semicolon') return token;
    }
    return null;
}

function pushLeading(token: Token | null, comment: Token): void {
    if (!token) return;
    if (!token.leadingComments) token.leadingComments = [];
    token.leadingComments.push(comment);
}
