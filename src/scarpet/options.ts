export type TrailingComma = 'preserve' | 'always' | 'never';
export type LineEnding = 'auto' | 'lf' | 'crlf';

export interface ScarpetFormatOptions {
    /** spaces per indentation level */
    indentSize: number;
    useTabs: boolean;
    /** preferred maximum line width; `Infinity` disables wrapping */
    lineWidth: number;
    spaceAroundColon: boolean;
    spaceAroundMatch: boolean;
    spaceAroundOperators: boolean;
    spaceAfterComma: boolean;
    trailingComma: TrailingComma;
    preserveContainerBreaks: boolean;
    expandStatementBlocks: boolean;
    preserveBlankLines: boolean;
    maxBlankLines: number;
    maxBlankLinesTopLevel: number;
    endWithNewline: boolean;
    lineEnding: LineEnding;
    /** re-read the formatted text and drop it again if the tokens changed */
    safetyCheck: boolean;
}

export const DEFAULT_OPTIONS: ScarpetFormatOptions = {
    indentSize: 2,
    useTabs: false,
    lineWidth: 120,
    spaceAroundColon: false,
    spaceAroundMatch: true,
    spaceAroundOperators: true,
    spaceAfterComma: true,
    trailingComma: 'preserve',
    preserveContainerBreaks: true,
    expandStatementBlocks: true,
    preserveBlankLines: true,
    maxBlankLines: 1,
    maxBlankLinesTopLevel: 2,
    endWithNewline: true,
    lineEnding: 'auto',
    safetyCheck: true,
};

/** js-beautify names, so that existing `formatter.json` files keep working. */
const LEGACY_KEYS: Record<string, keyof ScarpetFormatOptions> = {
    indent_size: 'indentSize',
    indent_with_tabs: 'useTabs',
    wrap_line_length: 'lineWidth',
    end_with_newline: 'endWithNewline',
    preserve_newlines: 'preserveBlankLines',
    max_preserve_newlines: 'maxBlankLines',
    space_around_colon: 'spaceAroundColon',
    space_around_match: 'spaceAroundMatch',
};

/**
 * Merges user settings over the defaults. Unknown keys are ignored, and the
 * js-beautify spellings of the options this formatter inherited are understood
 * as well.
 */
export function resolveOptions(partial?: Record<string, unknown> | null): ScarpetFormatOptions {
    const resolved: ScarpetFormatOptions = { ...DEFAULT_OPTIONS };
    if (!partial) return resolved;

    const writable = resolved as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(partial)) {
        if (value === undefined || value === null) continue;
        const target = LEGACY_KEYS[key] || (key in DEFAULT_OPTIONS ? (key as keyof ScarpetFormatOptions) : undefined);
        if (!target) {
            if (key === 'indent_char') {
                if (value === '\t') resolved.useTabs = true;
                continue;
            }
            continue;
        }
        writable[target] = coerce(target, value);
    }

    // js-beautify used 0 to mean "do not wrap"
    if (resolved.lineWidth === 0) resolved.lineWidth = Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(resolved.lineWidth) && resolved.lineWidth !== Number.MAX_SAFE_INTEGER) {
        resolved.lineWidth = Number.MAX_SAFE_INTEGER;
    }
    resolved.indentSize = Math.max(0, Math.min(16, Math.round(resolved.indentSize)));
    resolved.maxBlankLines = Math.max(0, Math.round(resolved.maxBlankLines));
    resolved.maxBlankLinesTopLevel = Math.max(0, Math.round(resolved.maxBlankLinesTopLevel));
    if (resolved.lineWidth <= 0) resolved.lineWidth = DEFAULT_OPTIONS.lineWidth;
    return resolved;
}

function coerce(key: keyof ScarpetFormatOptions, value: unknown): unknown {
    const expected = DEFAULT_OPTIONS[key];
    if (typeof expected === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') return value !== 'false' && value !== '0' && value !== '';
        return expected;
    }
    if (typeof expected === 'number') {
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numeric) ? numeric : expected;
    }
    if (key === 'trailingComma') {
        return value === 'always' || value === 'never' || value === 'preserve' ? value : expected;
    }
    if (key === 'lineEnding') {
        return value === 'lf' || value === 'crlf' || value === 'auto' ? value : expected;
    }
    return typeof value === 'string' ? value : expected;
}
