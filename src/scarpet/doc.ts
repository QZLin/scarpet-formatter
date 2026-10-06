/**
 * A small "document" intermediate representation plus a printer, in the spirit
 * of Prettier / Wadler's pretty printing algorithm. The formatter describes the
 * *shape* of the output (groups that either fit on one line or break, indents,
 * comments that must be flushed at the end of a line) and the printer decides
 * where the line breaks go.
 */

export type Doc =
    | string
    | ConcatDoc
    | LineDoc
    | GroupDoc
    | IndentDoc
    | IfBreakDoc
    | LineSuffixDoc
    | BreakParentDoc
    | TrimDoc;

export interface ConcatDoc {
    t: 'concat';
    parts: Doc[];
}

export interface LineDoc {
    t: 'line';
    /** always breaks the line, regardless of the enclosing group */
    hard?: boolean;
    /** breaks the line without printing a space when flat */
    soft?: boolean;
    /** like hard, but the new line is not indented */
    literal?: boolean;
}

export interface GroupDoc {
    t: 'group';
    contents: Doc;
    /** force this group to break */
    break?: boolean;
    /** alternative layouts, tried in order, the last one is the fallback */
    expanded?: Doc[];
    /** hard line breaks inside do not force this group (or its parents) to break */
    isolate?: boolean;
}

export interface IndentDoc {
    t: 'indent';
    contents: Doc;
}

export interface IfBreakDoc {
    t: 'ifBreak';
    breakContents: Doc;
    flatContents: Doc;
}

export interface LineSuffixDoc {
    t: 'lineSuffix';
    contents: Doc;
}

export interface BreakParentDoc {
    t: 'breakParent';
}

export interface TrimDoc {
    t: 'trim';
}

// ---------------------------------------------------------------- builders

export function concat(parts: Doc[]): Doc {
    return { t: 'concat', parts: parts.filter((part) => part !== '') };
}

export function group(contents: Doc, options: { break?: boolean; isolate?: boolean } = {}): GroupDoc {
    return { t: 'group', contents, break: options.break, isolate: options.isolate };
}

export function conditionalGroup(variants: Doc[]): GroupDoc {
    return { t: 'group', contents: variants[variants.length - 1], expanded: variants };
}

export function indent(contents: Doc): Doc {
    return { t: 'indent', contents };
}

export const line: LineDoc = { t: 'line' };
export const softline: LineDoc = { t: 'line', soft: true };
export const hardline: LineDoc = { t: 'line', hard: true };
export const literalline: LineDoc = { t: 'line', hard: true, literal: true };
export const breakParent: Doc = { t: 'breakParent' };
export const trim: Doc = { t: 'trim' };

export function ifBreak(breakContents: Doc, flatContents: Doc = ''): Doc {
    return { t: 'ifBreak', breakContents, flatContents };
}

export function lineSuffix(contents: Doc): Doc {
    return { t: 'lineSuffix', contents };
}

export function join(separator: Doc, docs: Doc[]): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < docs.length; index++) {
        if (index > 0) parts.push(separator);
        parts.push(docs[index]);
    }
    return concat(parts);
}

// ------------------------------------------------------------- break propagation

interface BreakInfo {
    /** a break that must propagate to every enclosing group (comments) */
    sticky: boolean;
    /** a break that only affects the enclosing (non isolated) groups */
    local: boolean;
}

const NOTHING: BreakInfo = { sticky: false, local: false };

function merge(a: BreakInfo, b: BreakInfo): BreakInfo {
    return { sticky: a.sticky || b.sticky, local: a.local || b.local };
}

/**
 * Marks every group that contains a forced line break so that the printer does
 * not even try to lay it out on a single line.
 */
export function propagateBreaks(doc: Doc): void {
    walkBreaks(doc);
}

function walkBreaks(doc: Doc): BreakInfo {
    if (typeof doc === 'string') return NOTHING;
    switch (doc.t) {
        case 'concat': {
            let info = NOTHING;
            for (const part of doc.parts) info = merge(info, walkBreaks(part));
            return info;
        }
        case 'indent':
        case 'lineSuffix':
            return walkBreaks(doc.contents);
        case 'breakParent':
            return { sticky: true, local: false };
        case 'trim':
            return NOTHING;
        case 'line':
            return { sticky: false, local: !!doc.hard };
        case 'ifBreak':
            return merge(walkBreaks(doc.breakContents), walkBreaks(doc.flatContents));
        case 'group': {
            if (doc.expanded) {
                let info = NOTHING;
                for (const variant of doc.expanded) info = merge(info, walkBreaks(variant));
                if (info.sticky) doc.break = true;
                // alternative layouts manage their own line breaks
                return { sticky: info.sticky, local: false };
            }
            const inner = walkBreaks(doc.contents);
            if (inner.sticky || (inner.local && !doc.isolate)) doc.break = true;
            if (doc.isolate) return { sticky: inner.sticky, local: false };
            return inner;
        }
        default:
            return NOTHING;
    }
}

// ------------------------------------------------------------------- printer

const MODE_FLAT = 0;
const MODE_BREAK = 1;
type Mode = typeof MODE_FLAT | typeof MODE_BREAK;

export interface PrintOptions {
    width: number;
    useTabs: boolean;
    tabWidth: number;
}

interface IndentValue {
    value: string;
    length: number;
}

interface Command {
    ind: IndentValue;
    mode: Mode;
    doc: Doc;
}

const ROOT_INDENT: IndentValue = { value: '', length: 0 };

export function printDocToString(doc: Doc, options: PrintOptions): string {
    propagateBreaks(doc);

    const commands: Command[] = [{ ind: ROOT_INDENT, mode: MODE_BREAK, doc }];
    const lineSuffixes: Command[] = [];
    const out: string[] = [];
    let position = 0;
    let shouldRemeasure = false;

    const makeIndent = (ind: IndentValue): IndentValue =>
        options.useTabs
            ? { value: ind.value + '\t', length: ind.length + options.tabWidth }
            : { value: ind.value + ' '.repeat(options.tabWidth), length: ind.length + options.tabWidth };

    const trimOutput = (): void => {
        let removed = 0;
        while (out.length > 0) {
            const last = out[out.length - 1];
            const trimmed = last.replace(/[ \t]+$/, '');
            removed += last.length - trimmed.length;
            if (trimmed === '') {
                out.pop();
                continue;
            }
            out[out.length - 1] = trimmed;
            break;
        }
        position -= removed;
        if (position < 0) position = 0;
    };

    const newline = (ind: IndentValue, literal: boolean): void => {
        trimOutput();
        if (literal) {
            out.push('\n');
            position = 0;
            return;
        }
        out.push('\n' + ind.value);
        position = ind.length;
    };

    while (commands.length > 0) {
        const command = commands.pop() as Command;
        const { ind, mode } = command;
        const current = command.doc;

        if (typeof current === 'string') {
            out.push(current);
            const lastBreak = current.lastIndexOf('\n');
            position = lastBreak === -1 ? position + current.length : current.length - lastBreak - 1;
            continue;
        }

        switch (current.t) {
            case 'concat': {
                for (let index = current.parts.length - 1; index >= 0; index--) {
                    commands.push({ ind, mode, doc: current.parts[index] });
                }
                break;
            }
            case 'indent': {
                commands.push({ ind: makeIndent(ind), mode, doc: current.contents });
                break;
            }
            case 'trim': {
                trimOutput();
                break;
            }
            case 'lineSuffix': {
                lineSuffixes.push({ ind, mode, doc: current.contents });
                break;
            }
            case 'breakParent': {
                break;
            }
            case 'ifBreak': {
                commands.push({ ind, mode, doc: mode === MODE_BREAK ? current.breakContents : current.flatContents });
                break;
            }
            case 'line': {
                if (mode === MODE_FLAT && !current.hard) {
                    if (!current.soft) {
                        out.push(' ');
                        position += 1;
                    }
                    break;
                }
                if (mode === MODE_FLAT && current.hard) {
                    // A hard break inside a group that is currently measured as
                    // flat: the enclosing group has to be measured again once the
                    // line is really printed.
                    shouldRemeasure = true;
                }
                if (lineSuffixes.length > 0) {
                    commands.push({ ind, mode, doc: current });
                    for (let index = lineSuffixes.length - 1; index >= 0; index--) {
                        commands.push(lineSuffixes[index]);
                    }
                    lineSuffixes.length = 0;
                    break;
                }
                newline(ind, !!current.literal);
                break;
            }
            case 'group': {
                if (mode === MODE_FLAT && !shouldRemeasure && !current.expanded) {
                    commands.push({ ind, mode: current.break ? MODE_BREAK : MODE_FLAT, doc: current.contents });
                    break;
                }

                shouldRemeasure = false;
                const remaining = options.width - position;
                const hasLineSuffix = lineSuffixes.length > 0;

                if (current.expanded) {
                    let printed = false;
                    // a comment inside one of the alternative layouts forces the
                    // fully expanded one
                    if (!current.break) {
                        for (let index = 0; index < current.expanded.length - 1; index++) {
                            const candidate: Command = { ind, mode: MODE_FLAT, doc: current.expanded[index] };
                            if (fits(candidate, commands, remaining, hasLineSuffix, false)) {
                                commands.push(candidate);
                                printed = true;
                                break;
                            }
                        }
                    }
                    if (!printed) {
                        // The fallback layout is the fully expanded one, so it is
                        // printed in break mode without being measured again.
                        const fallback = current.expanded[current.expanded.length - 1];
                        const contents = typeof fallback === 'string' || fallback.t !== 'group' ? fallback : fallback.contents;
                        commands.push({ ind, mode: MODE_BREAK, doc: contents });
                    }
                    break;
                }

                const flatCandidate: Command = { ind, mode: MODE_FLAT, doc: current.contents };
                if (!current.break && fits(flatCandidate, commands, remaining, hasLineSuffix, false)) {
                    commands.push(flatCandidate);
                } else {
                    commands.push({ ind, mode: MODE_BREAK, doc: current.contents });
                }
                break;
            }
            default:
                break;
        }
    }

    // comments waiting for a line break that never came (end of file)
    for (const suffix of lineSuffixes) {
        out.push(printDocToString(suffix.doc, options));
    }

    return out.join('');
}

function fits(
    next: Command,
    restCommands: Command[],
    width: number,
    hasLineSuffix: boolean,
    mustBeFlat: boolean
): boolean {
    if (width < 0) return false;
    let remaining = width;
    const commands: Command[] = [{ ind: next.ind, mode: next.mode, doc: next.doc }];
    let restIndex = restCommands.length - 1;

    while (remaining >= 0) {
        if (commands.length === 0) {
            if (restIndex < 0) return true;
            const rest = restCommands[restIndex--];
            commands.push({ ind: rest.ind, mode: rest.mode, doc: rest.doc });
            continue;
        }

        const command = commands.pop() as Command;
        const { ind, mode } = command;
        const current = command.doc;

        if (typeof current === 'string') {
            const newlineIndex = current.indexOf('\n');
            if (newlineIndex >= 0) {
                remaining -= newlineIndex;
                return remaining >= 0;
            }
            remaining -= current.length;
            continue;
        }

        switch (current.t) {
            case 'concat': {
                for (let index = current.parts.length - 1; index >= 0; index--) {
                    commands.push({ ind, mode, doc: current.parts[index] });
                }
                break;
            }
            case 'indent': {
                commands.push({ ind, mode, doc: current.contents });
                break;
            }
            case 'group': {
                if (mustBeFlat && current.break) return false;
                commands.push({ ind, mode: current.break ? MODE_BREAK : mode, doc: current.contents });
                break;
            }
            case 'ifBreak': {
                commands.push({ ind, mode, doc: mode === MODE_BREAK ? current.breakContents : current.flatContents });
                break;
            }
            case 'line': {
                if (mode === MODE_BREAK) return true;
                if (current.hard) return true;
                if (!current.soft) remaining -= 1;
                break;
            }
            case 'lineSuffix': {
                if (hasLineSuffix) return false;
                break;
            }
            default:
                break;
        }
    }

    return false;
}
