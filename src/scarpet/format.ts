import { printDocToString } from './doc';
import { OptionBag } from './config';
import { ScarpetFormatOptions, resolveOptions } from './options';
import { parse } from './parser';
import { printProgram } from './printer';
import { tokensEquivalent } from './verify';

export interface FormatResult {
    /** the text the caller should use; the input itself when formatting was skipped */
    text: string;
    changed: boolean;
    /** true when the formatter refused to touch the input */
    skipped: boolean;
    /** why formatting was skipped, empty when it was not */
    reason: string;
}

/**
 * Formats a scarpet program.
 *
 * The formatter is conservative by design: source it cannot parse, and output
 * whose token stream does not match the input, are both thrown away, so a
 * half-typed file on disk never gets mangled by a save.
 */
export function formatScarpetWithDetail(source: string, partial?: OptionBag | null): FormatResult {
    const options = resolveOptions(partial);
    const skipped = (reason: string): FormatResult => ({ text: source, changed: false, skipped: true, reason });

    if (source.trim() === '') {
        return { text: source, changed: false, skipped: false, reason: '' };
    }

    const parsed = parse(source);
    if (!parsed.ok) {
        return skipped(parsed.errors[0] || 'the file could not be parsed');
    }

    const doc = printProgram(parsed.program, options, parsed.danglingComments);
    let output = printDocToString(doc, {
        width: Number.isFinite(options.lineWidth) ? options.lineWidth : Number.MAX_SAFE_INTEGER,
        useTabs: options.useTabs,
        tabWidth: options.indentSize,
    });

    output = output.replace(/[ \t]+$/gm, '');
    output = output.replace(/\n+$/, '');
    if (options.endWithNewline && output !== '') output += '\n';
    output = applyLineEndings(output, source, options.lineEnding);

    if (options.safetyCheck) {
        const comparison = tokensEquivalent(source, output);
        if (!comparison.ok) {
            return skipped(`formatting would have changed the code (${comparison.reason})`);
        }
    }

    if (output === source) return { text: source, changed: false, skipped: false, reason: '' };
    return { text: output, changed: true, skipped: false, reason: '' };
}

/** Formats a scarpet program, returning the input unchanged when in doubt. */
export function formatScarpet(source: string, partial?: OptionBag | null): string {
    return formatScarpetWithDetail(source, partial).text;
}

function applyLineEndings(text: string, source: string, mode: ScarpetFormatOptions['lineEnding']): string {
    const target = mode === 'auto' ? (source.includes('\r\n') ? 'crlf' : 'lf') : mode;
    if (target === 'lf') return text;
    return text.replace(/\r?\n/g, '\r\n');
}
