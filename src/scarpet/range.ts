import { parse } from './parser';

/**
 * Expands a selection to the complete top level statements around it, so that a
 * partial format can be applied without guessing the indentation of the code in
 * between. Returns null when the file holds no tokens at all.
 */
export function topLevelStatementSpan(
    source: string,
    start: number,
    end: number
): { start: number; end: number } | null {
    const { tokens } = parse(source);
    if (tokens.length === 0) return null;

    // bracket depth of every token, statements live at depth 0
    const depth: number[] = [];
    let current = 0;
    for (const token of tokens) {
        if (token.kind === 'close') current = Math.max(0, current - 1);
        depth.push(current);
        if (token.kind === 'open') current++;
    }

    let first = tokens.findIndex((token) => token.end > start);
    if (first === -1) first = tokens.length - 1;

    let last = 0;
    for (let index = tokens.length - 1; index >= 0; index--) {
        if (tokens[index].start < end) {
            last = index;
            break;
        }
    }
    if (last < first) last = first;

    const endsAStatement = (index: number): boolean =>
        tokens[index].kind === 'semicolon' && depth[index] === 0 && index < tokens.length - 1;

    let from = first;
    while (from > 0 && !endsAStatement(from - 1)) from--;
    let to = last;
    while (to < tokens.length - 1 && !endsAStatement(to)) to++;

    return { start: tokens[from].start, end: tokens[to].end };
}
