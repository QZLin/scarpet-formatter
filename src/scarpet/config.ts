/**
 * Config file support. The extension and the CLI both read a `formatter.json`
 * which may contain `//` and `/* *\/` comments (the file exists to be edited by
 * hand), and which keeps the js-beautify style `{ "scarpet": { ... } }` shape so
 * that existing configuration files keep working.
 */

export type OptionBag = Record<string, unknown>;

/**
 * Removes `//` and block comments that are not inside a string, and drops the
 * trailing commas hand edited JSON tends to collect.
 */
export function stripJsonComments(text: string): string {
    const result: string[] = [];
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        const next = index + 1 < text.length ? text[index + 1] : '';

        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false;
                result.push(char);
            }
            continue;
        }
        if (inBlockComment) {
            if (char === '*' && next === '/') {
                inBlockComment = false;
                index++;
            }
            continue;
        }
        if (inString) {
            result.push(char);
            if (char === '\\') {
                if (next) {
                    result.push(next);
                    index++;
                }
                continue;
            }
            if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            result.push(char);
            continue;
        }
        if (char === '/' && next === '/') {
            inLineComment = true;
            index++;
            continue;
        }
        if (char === '/' && next === '*') {
            inBlockComment = true;
            index++;
            continue;
        }
        if (char === ',' && nextSignificant(text, index + 1) !== undefined) {
            const significant = nextSignificant(text, index + 1) as string;
            if (significant === '}' || significant === ']') continue;
        }
        result.push(char);
    }

    return result.join('');
}

/** First character after `from` that is not whitespace or part of a comment. */
function nextSignificant(text: string, from: number): string | undefined {
    for (let index = from; index < text.length; index++) {
        const char = text[index];
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue;
        if (char === '/' && text[index + 1] === '/') {
            while (index < text.length && text[index] !== '\n') index++;
            continue;
        }
        if (char === '/' && text[index + 1] === '*') {
            const end = text.indexOf('*/', index + 2);
            if (end === -1) return undefined;
            index = end + 1;
            continue;
        }
        return char;
    }
    return undefined;
}

/**
 * Reads a formatter config. Files shaped like `{ "scarpet": { ... } }` (what the
 * js-beautify based version of this extension wrote) are unwrapped, anything
 * else is used as an option bag directly.
 */
export function parseConfig(text: string): OptionBag {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stripJsonComments(text));
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const bag = parsed as OptionBag;
    const section = bag['scarpet'];
    if (section && typeof section === 'object' && !Array.isArray(section)) return section as OptionBag;
    return bag;
}
