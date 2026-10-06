import {
    Doc,
    breakParent,
    concat,
    conditionalGroup,
    group,
    hardline,
    ifBreak,
    indent,
    join,
    line,
    lineSuffix,
    softline,
} from './doc';
import { ScarpetFormatOptions } from './options';
import { Container, Elem, Part, isContainer, isEmptyContainer } from './parser';
import { ASSIGNMENT_OPERATORS, Token, bracketPair } from './tokens';

interface Context {
    /** top level statements always start on a new line */
    topLevel: boolean;
}

interface Statement {
    elems: Elem[];
    /** the `;` that terminated this statement, if the source had one */
    semicolon: Token | null;
}

type Role = 'call' | 'list' | 'map' | 'paren';

const NESTED: Context = { topLevel: false };
const TOP: Context = { topLevel: true };

/**
 * Turns the bracket tree of a scarpet program into a layout document. All the
 * scarpet specific knowledge lives here: how statements are separated, where
 * function bodies belong, which containers may keep their line breaks, and how
 * binary/unary operators are spaced.
 */
export function printProgram(program: Container, options: ScarpetFormatOptions, danglingComments: Token[]): Doc {
    return new Printer(options).program(program, danglingComments);
}

class Printer {
    constructor(private readonly options: ScarpetFormatOptions) {}

    program(program: Container, danglingComments: Token[]): Doc {
        const parts: Doc[] = [];
        let wroteSomething = false;
        for (let index = 0; index < program.parts.length; index++) {
            const part = program.parts[index];
            if (part.elems.length === 0) continue;
            if (wroteSomething) parts.push(concat([',', hardline]));
            parts.push(this.part(part, TOP));
            wroteSomething = true;
        }
        for (const comment of danglingComments) {
            if (wroteSomething) parts.push(hardline);
            parts.push(this.commentText(comment));
            wroteSomething = true;
        }
        return concat(parts);
    }

    // ------------------------------------------------------------- sequences

    private part(part: Part, context: Context): Doc {
        const statements = splitStatements(part);
        if (statements.length === 1 && !statements[0].semicolon) {
            return this.elems(statements[0].elems);
        }
        return this.statements(statements, context);
    }

    private statements(statements: Statement[], context: Context): Doc {
        const breakStatements = context.topLevel || this.options.expandStatementBlocks;
        const parts: Doc[] = [];
        let carried: Token[] = []; // own line comments that sat in front of a `;`

        for (const statement of statements) {
            const semicolonComments = (statement.semicolon && statement.semicolon.leadingComments) || [];
            if (statement.elems.length === 0 && !statement.semicolon && semicolonComments.length === 0) continue;

            if (parts.length > 0) {
                parts.push(breakStatements ? hardline : line);
                if (this.options.preserveBlankLines && breakStatements) {
                    const maxBlankLines = context.topLevel
                        ? this.options.maxBlankLinesTopLevel
                        : this.options.maxBlankLines;
                    const blanks = this.blankLinesBefore(statement, maxBlankLines);
                    for (let blank = 0; blank < blanks; blank++) parts.push(hardline);
                }
            }
            for (const comment of carried) parts.push(this.commentText(comment), hardline);
            carried = semicolonComments;

            parts.push(this.statement(statement));
        }

        for (const comment of carried) parts.push(hardline, this.commentText(comment));
        return concat(parts);
    }

    private statement(statement: Statement): Doc {
        const parts: Doc[] = [];
        if (statement.elems.length > 0) {
            parts.push(this.elems(statement.elems));
        }
        if (statement.semicolon) {
            parts.push(';');
            const comment = statement.semicolon.trailingComment;
            if (comment) {
                parts.push(lineSuffix(concat([' ', this.commentText(comment)])), breakParent);
            }
        }
        return concat(parts);
    }

    private elems(elems: Elem[], inContinuation = false): Doc {
        const parts: Doc[] = [];
        let previous: Elem | null = null;
        let previousHasTrailingComment = false;

        for (let index = 0; index < elems.length; index++) {
            const elem = elems[index];

            // A line comment swallows the rest of its line, so an expression that
            // continues after one moves one level in.
            if (index > 0 && previousHasTrailingComment) {
                const rest = this.elems(elems.slice(index), true);
                parts.push(inContinuation ? concat([hardline, rest]) : indent(concat([hardline, rest])));
                return concat(parts);
            }

            // `$` marks "a newline was here" for command blocks, so it always
            // starts a line and nothing may be glued to it.
            if (!isContainer(elem) && elem.kind === 'lineMarker') {
                if (index > 0) parts.push(hardline);
                parts.push(this.elementDoc(null, elem, index === 0));
                previous = elem;
                previousHasTrailingComment = false;
                continue;
            }

            // `a = <long expression>` may put the right hand side on its own
            // line, but a function body assigned to something stays on the same
            // line as the `=`.
            if (
                !isContainer(elem) &&
                elem.kind === 'operator' &&
                ASSIGNMENT_OPERATORS.has(elem.text) &&
                index + 1 < elems.length
            ) {
                parts.push(this.elementDoc(previous, elem, index === 0));
                const rest = elems.slice(index + 1);
                if (elemsHaveStatementBlock(rest) || elemsForceLineBreak(rest)) {
                    // the right hand side brings its own line structure (or ends a
                    // line itself), so an extra indentation level would only push
                    // it to the right
                    parts.push(this.gap(elem, rest[0]), this.elems(rest));
                    return concat(parts);
                }
                const separator = trailingCommentOf(elem)
                    ? hardline
                    : this.options.spaceAroundOperators
                      ? line
                      : softline;
                parts.push(group(indent(concat([separator, this.elems(rest)])), { isolate: true }));
                return concat(parts);
            }

            parts.push(this.elementDoc(previous, elem, index === 0));
            previousHasTrailingComment = !!trailingCommentOf(elem);
            previous = elem;
        }

        return concat(parts);
    }

    private elementDoc(previous: Elem | null, elem: Elem, atLineStart = false): Doc {
        const leading = leadingCommentsOf(elem);
        let doc = isContainer(elem) ? this.container(elem, previous) : this.tokenDoc(elem);

        const trailing = trailingCommentOf(elem);
        if (trailing) {
            doc = concat([doc, lineSuffix(concat([' ', this.commentText(trailing)])), breakParent]);
        }

        if (leading.length === 0) {
            return concat([this.gap(previous, elem), doc]);
        }
        const comments: Doc[] = [];
        // an own line comment has to start a line of its own
        if (!atLineStart) comments.push(hardline);
        for (const comment of leading) comments.push(this.commentText(comment), hardline);
        return concat([...comments, doc]);
    }

    // ------------------------------------------------------------ containers

    private container(container: Container, previous: Elem | null): Doc {
        const role = containerRole(container, previous);
        const openText = container.bracket || '';
        const closeText = container.close ? container.close.text : bracketPair(openText);
        const openTrailing = (container.open && container.open.trailingComment) || null;
        const closeLeading = (container.close && container.close.leadingComments) || [];

        if (isEmptyContainer(container)) {
            if (closeLeading.length === 0 && !openTrailing) return concat([openText, closeText]);
            const comments: Doc[] = [];
            if (openTrailing) comments.push(this.commentText(openTrailing));
            for (const comment of closeLeading) comments.push(this.commentText(comment));
            return concat([openText, indent(concat([hardline, join(hardline, comments)])), hardline, closeText]);
        }

        const codeParts = container.parts.filter((part) => part.elems.length > 0);
        const partsDocs = codeParts.map((part) => this.part(part, NESTED));
        const trailing = this.trailingCommaDoc(container, role);
        const innerComments: Doc[] = [];
        for (const comment of closeLeading) innerComments.push(hardline, this.commentText(comment));

        const openDoc: Doc[] = [openText];
        if (openTrailing) openDoc.push(lineSuffix(concat([' ', this.commentText(openTrailing)])), breakParent);

        const body = concat([
            ...openDoc,
            indent(concat([softline, join(concat([',', line]), partsDocs), trailing, ...innerComments])),
            softline,
            closeText,
        ]);

        const mustBreak =
            this.options.preserveContainerBreaks && startsOnNewLine(container) && codeParts.length >= 1;

        if (!mustBreak && !openTrailing) {
            const variants: Doc[] = [];
            const hug = this.huggedVariant(container, role, codeParts, closeLeading);
            if (hug) variants.push(hug);
            const hanging = this.hangingVariant(container, role, codeParts, closeLeading);
            if (hanging) variants.push(hanging);
            if (variants.length > 0) return conditionalGroup([...variants, body]);
        }
        return group(body, { break: mustBreak });
    }

    /**
     * Higher order functions read best when their trailing lambda keeps its body
     * on the same line as the call: `map(list, _(x) -> ( ... ))`.
     */
    private huggedVariant(container: Container, role: Role, codeParts: Part[], closeLeading: Token[]): Doc | null {
        if (closeLeading.length > 0 || role === 'paren') return null;
        const hugging = role === 'call' ? codeParts.length >= 2 : codeParts.length === 1;
        if (!hugging) return null;
        const last = codeParts[codeParts.length - 1];
        if (partHasTopLevelStatements(last) || !partHasStatementBlock(last)) return null;
        if (codeParts.slice(0, -1).some(partHasStatementBlock)) return null;

        const prefix: Doc[] = [];
        for (const part of codeParts.slice(0, -1)) prefix.push(this.part(part, NESTED), ', ');
        prefix.push(this.part(last, NESTED));

        // The hugged body carries its own indentation, so nothing here may add
        // another level on top of it.
        return concat([
            container.bracket || '',
            ...prefix,
            container.close ? container.close.text : bracketPair(container.bracket || ''),
        ]);
    }

    /**
     * `loop( 10, body; body )` and friends: the leading arguments stay on the
     * opening line while the statement block that follows hangs underneath it.
     */
    private hangingVariant(container: Container, role: Role, codeParts: Part[], closeLeading: Token[]): Doc | null {
        if (role !== 'call' || codeParts.length < 2 || closeLeading.length > 0) return null;
        const init = codeParts.slice(0, -1);
        const last = codeParts[codeParts.length - 1];
        if (!partHasTopLevelStatements(last)) return null;
        if (init.some(partHasStatementBlock)) return null;

        const prefix: Doc[] = [container.bracket || ''];
        for (const part of init) prefix.push(this.part(part, NESTED), ', ');
        prefix.push(indent(concat([hardline, this.part(last, NESTED)])));
        prefix.push(hardline, container.close ? container.close.text : bracketPair(container.bracket || ''));
        return concat(prefix);
    }

    private trailingCommaDoc(container: Container, role: Role): Doc {
        const mode = this.options.trailingComma;
        if (mode === 'never') return '';
        // `[a, b,]` and `{a -> b,}` are literals and always tolerate a trailing
        // comma; argument lists only keep the one they were written with.
        const allowed = mode === 'always' && (role === 'list' || role === 'map');
        if (allowed || (mode === 'preserve' && container.trailingComma)) return ifBreak(',');
        return '';
    }

    // ---------------------------------------------------------------- tokens

    private tokenDoc(token: Token): Doc {
        if (token.kind === 'comment') return this.commentText(token);
        return token.text;
    }

    private commentText(comment: Token): string {
        return comment.text.replace(/\s+$/, '');
    }

    private gap(previous: Elem | null, next: Elem): Doc {
        return needsSpace(previous, next, this.options) ? ' ' : '';
    }

    private blankLinesBefore(statement: Statement, maxBlankLines: number): number {
        const edge = leadingCommentEdge(statement);
        if (!edge) return 0;
        return Math.min(Math.max(edge.newlinesBefore - 1, 0), maxBlankLines);
    }
}

// --------------------------------------------------------------- statements

function splitStatements(part: Part): Statement[] {
    const statements: Statement[] = [];
    let current: Elem[] = [];

    for (const elem of part.elems) {
        if (!isContainer(elem) && elem.kind === 'semicolon') {
            statements.push({ elems: current, semicolon: elem });
            current = [];
        } else {
            current.push(elem);
        }
    }
    if (current.length > 0 || statements.length === 0) {
        statements.push({ elems: current, semicolon: null });
    }
    return statements;
}

function hasStatements(container: Container): boolean {
    return container.parts.some((part) => part.elems.some((elem) => !isContainer(elem) && elem.kind === 'semicolon'));
}

/** `a; b` written directly inside this part (as opposed to inside a bracket). */
function partHasTopLevelStatements(part: Part): boolean {
    return part.elems.some((elem) => !isContainer(elem) && elem.kind === 'semicolon');
}

/** The part contains a statement block, so it cannot share a line with what came before. */
function partHasStatementBlock(part: Part): boolean {
    return part.elems.some((elem) => {
        if (!isContainer(elem)) return elem.kind === 'semicolon';
        return containerHasStatementBlock(elem);
    });
}

function containerHasStatementBlock(container: Container): boolean {
    if (container.bracket === '(' && hasStatements(container)) return true;
    for (const part of container.parts) {
        for (const elem of part.elems) {
            if (isContainer(elem) && containerHasStatementBlock(elem)) return true;
        }
    }
    return false;
}

function elemsContainComment(elems: Elem[]): boolean {
    return elems.some((elem) => {
        if (!isContainer(elem)) {
            return !!(elem.trailingComment || (elem.leadingComments && elem.leadingComments.length > 0));
        }
        return containerContainsComment(elem);
    });
}

/**
 * Comments in front of an element and `$` markers always end (or start) the line
 * they are printed on, so the element after them cannot share their line.
 */
function elemsForceLineBreak(elems: Elem[]): boolean {
    return elems.some((elem) => !isContainer(elem) && elem.kind === 'lineMarker') || elemsContainComment(elems);
}

function containerContainsComment(container: Container): boolean {
    if (container.open && (container.open.trailingComment || container.open.leadingComments?.length)) return true;
    if (container.close && (container.close.trailingComment || container.close.leadingComments?.length)) return true;
    for (const part of container.parts) {
        if (elemsContainComment(part.elems)) return true;
    }
    return false;
}

function elemsHaveStatementBlock(elems: Elem[]): boolean {
    return elems.some((elem) => {
        if (!isContainer(elem)) return elem.kind === 'semicolon';
        return containerHasStatementBlock(elem);
    });
}

/** The source started the content of this container on a line of its own. */
function startsOnNewLine(container: Container): boolean {
    for (const part of container.parts) {
        for (const elem of part.elems) {
            const token = isContainer(elem) ? elem.open : elem;
            if (token) return token.newlinesBefore > 0;
        }
    }
    return false;
}

/** The first token of a statement, comments included. */
function leadingCommentEdge(statement: Statement): Token | null {
    for (const elem of statement.elems) {
        const token = isContainer(elem) ? elem.open : elem;
        if (!token) continue;
        if (token.leadingComments && token.leadingComments.length > 0) return token.leadingComments[0];
        return token;
    }
    return statement.semicolon;
}

function leadingCommentsOf(elem: Elem): Token[] {
    const token = isContainer(elem) ? elem.open : elem;
    return (token && token.leadingComments) || [];
}

function trailingCommentOf(elem: Elem): Token | null {
    if (isContainer(elem)) {
        return (elem.close && elem.close.trailingComment) || null;
    }
    return elem.trailingComment || null;
}

function containerRole(container: Container, previous: Elem | null): Role {
    if (container.bracket === '[') return 'list';
    if (container.bracket === '{') return 'map';
    if (container.bracket !== '(') return 'paren';
    if (previous && (isContainer(previous) || previous.kind === 'ident')) return 'call';
    return 'paren';
}

// ---------------------------------------------------------------- spacing

function tokenOf(elem: Elem | null): Token | null {
    if (!elem) return null;
    return isContainer(elem) ? elem.close : elem;
}

function needsSpace(previous: Elem | null, next: Elem, options: ScarpetFormatOptions): boolean {
    if (!previous) return false;
    const before = tokenOf(previous);
    const after = isContainer(next) ? next.open : next;
    if (!before || !after) return false;

    // the operator decides the spacing by itself
    if (before.kind === 'operator') {
        if (before.text === ':') return options.spaceAroundColon;
        if (before.text === '~') return options.spaceAroundMatch;
        if (before.unary) return false;
        return options.spaceAroundOperators;
    }

    if (after.kind === 'operator') {
        if (after.text === ':') return options.spaceAroundColon;
        if (after.text === '~') return options.spaceAroundMatch;
        if (after.unary) return false;
        return options.spaceAroundOperators;
    }

    if (isContainer(next)) {
        // a call or a parenthesised expression hugs whatever it follows
        if (next.bracket === '(') return !(before.kind === 'ident' || isContainer(previous));
        return true;
    }

    if (before.kind === 'unknown' || after.kind === 'unknown') return false;
    if (before.kind === 'lineMarker') return false;

    return true;
}
