import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Integration test for the VS Code layer. VS Code itself cannot be started from
 * a unit test, so `require('vscode')` is answered by a small stub, which is
 * enough to exercise the formatting providers, the commands, the configuration
 * layers and the selection handling.
 */

const nodeModule = require('node:module') as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };

interface FakePosition {
    line: number;
    character: number;
}

interface FakeRange {
    start: FakePosition;
    end: FakePosition;
}

interface FakeUri {
    fsPath: string;
    toString(): string;
}

interface FakeDocument {
    uri: FakeUri;
    getText(): string;
    positionAt(offset: number): FakePosition;
    offsetAt(position: FakePosition): number;
    readonly lineCount: number;
}

interface FakeEdit {
    range: FakeRange;
    newText: string;
}

function makeDocument(text: string, fsPath = path.join(path.sep, 'work', 'app.sc')): FakeDocument {
    const lineStarts: number[] = [0];
    for (let index = 0; index < text.length; index++) {
        if (text[index] === '\n') lineStarts.push(index + 1);
    }
    return {
        uri: { fsPath, toString: () => `file://${fsPath}` },
        getText: () => text,
        positionAt: (offset) => {
            let line = 0;
            while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line++;
            return { line, character: offset - lineStarts[line] };
        },
        offsetAt: (position) => lineStarts[position.line] + position.character,
        get lineCount() {
            return lineStarts.length;
        },
    };
}

interface Harness {
    format(document: FakeDocument): FakeEdit[];
    formatRange(document: FakeDocument, start: number, end: number): FakeEdit[];
    runCommand(id: string): void;
    setActiveEditor(editor: unknown): void;
    settings: Map<string, unknown>;
    messages: string[];
    outputLines: string[];
    workspaceFolder: string | null;
}

function createHarness(): Harness {
    const commands = new Map<string, () => void>();
    const messages: string[] = [];
    const outputLines: string[] = [];
    const settings = new Map<string, unknown>();
    let activeEditor: unknown = null;
    let workspaceFolder: string | null = null;
    let formatterProvider: { provideDocumentFormattingEdits(document: FakeDocument): FakeEdit[] } | null = null;
    let rangeProvider:
        | { provideDocumentRangeFormattingEdits(document: FakeDocument, range: FakeRange): FakeEdit[] }
        | null = null;

    const disposable = { dispose: () => undefined };
    const uriFor = (fsPath: string): FakeUri => ({ fsPath, toString: () => `file://${fsPath}` });

    const vscode = {
        Position: class {
            constructor(public line: number, public character: number) {}
        },
        Range: class {
            constructor(public start: FakePosition, public end: FakePosition) {}
        },
        TextEdit: {
            replace: (range: FakeRange, newText: string): FakeEdit => ({ range, newText }),
        },
        Uri: { file: uriFor },
        commands: {
            registerCommand: (id: string, handler: () => void) => {
                commands.set(id, handler);
                return disposable;
            },
        },
        languages: {
            registerDocumentFormattingEditProvider: (_id: string, provider: NonNullable<typeof formatterProvider>) => {
                formatterProvider = provider;
                return disposable;
            },
            registerDocumentRangeFormattingEditProvider: (_id: string, provider: NonNullable<typeof rangeProvider>) => {
                rangeProvider = provider;
                return disposable;
            },
        },
        window: {
            createOutputChannel: () => ({
                appendLine: (line: string) => void outputLines.push(line),
                dispose: () => undefined,
            }),
            get activeTextEditor() {
                return activeEditor;
            },
            showInformationMessage: (message: string) => {
                messages.push(message);
                return Promise.resolve(undefined);
            },
            showWarningMessage: (message: string) => {
                messages.push(message);
                return Promise.resolve(undefined);
            },
            showErrorMessage: (message: string) => {
                messages.push(message);
                return Promise.resolve(undefined);
            },
            showTextDocument: () => Promise.resolve(undefined),
        },
        workspace: {
            workspaceFolders: undefined,
            getWorkspaceFolder: () => (workspaceFolder ? { uri: uriFor(workspaceFolder) } : null),
            getConfiguration: () => ({
                get: (key: string, fallback: unknown) => (settings.has(key) ? settings.get(key) : fallback),
                inspect: (key: string) =>
                    settings.has(key) ? { globalValue: settings.get(key) } : { globalValue: undefined },
            }),
            openTextDocument: () => Promise.resolve({}),
            asRelativePath: (uri: FakeUri) => uri.fsPath,
        },
    };

    const originalLoad = nodeModule._load;
    nodeModule._load = function (request: string, parent: unknown, isMain: boolean): unknown {
        if (request === 'vscode') return vscode;
        return originalLoad.call(this, request, parent, isMain);
    };

    const extensionPath = require.resolve('../src/extension');
    delete require.cache[extensionPath];
    const extension = require(extensionPath) as { activate(context: unknown): void };
    nodeModule._load = originalLoad;

    extension.activate({
        extensionPath: path.join(__dirname, '..', '..'),
        subscriptions: [],
    });

    assert.ok(formatterProvider, 'activate did not register a formatting provider');
    assert.ok(rangeProvider, 'activate did not register a range formatting provider');

    return {
        format: (document) => (formatterProvider as NonNullable<typeof formatterProvider>).provideDocumentFormattingEdits(document),
        formatRange: (document, start, end) =>
            (rangeProvider as NonNullable<typeof rangeProvider>).provideDocumentRangeFormattingEdits(document, {
                start: document.positionAt(start),
                end: document.positionAt(end),
            }),
        runCommand: (id) => {
            const command = commands.get(id);
            assert.ok(command, `command ${id} is not registered`);
            command();
        },
        setActiveEditor: (editor) => {
            activeEditor = editor;
        },
        settings,
        messages,
        outputLines,
        get workspaceFolder() {
            return workspaceFolder;
        },
        set workspaceFolder(folder: string | null) {
            workspaceFolder = folder;
        },
    };
}

test('extension: the formatting provider returns a whole document edit', () => {
    const harness = createHarness();
    const edits = harness.format(makeDocument('a=1+2'));
    assert.equal(edits.length, 1);
    assert.equal(edits[0].newText, 'a = 1 + 2\n');
    assert.deepEqual(edits[0].range.start, { line: 0, character: 0 });
    assert.deepEqual(edits[0].range.end, { line: 0, character: 5 });
});

test('extension: an already formatted document produces no edit', () => {
    const harness = createHarness();
    assert.deepEqual(harness.format(makeDocument('a = 1\n')), []);
});

test('extension: broken source is left alone and reported', () => {
    const harness = createHarness();
    const edits = harness.format(makeDocument('f(a -> 1'));
    assert.deepEqual(edits, []);
    assert.equal(harness.outputLines.length, 1);
    assert.match(harness.outputLines[0], /left untouched/);
});

test('extension: the formatter can be turned off', () => {
    const harness = createHarness();
    harness.settings.set('enable', false);
    assert.deepEqual(harness.format(makeDocument('a=1')), []);
});

test('extension: explicit settings win over the defaults', () => {
    const harness = createHarness();
    harness.settings.set('indentSize', 4);
    assert.equal(harness.format(makeDocument('f(a)->(a;b)'))[0].newText, 'f(a) -> (\n    a;\n    b\n)\n');
});

test('extension: a local formatter.json is read and VS Code settings win over it', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scarpet-formatter-'));
    fs.mkdirSync(path.join(folder, '.vscode'), { recursive: true });
    fs.writeFileSync(
        path.join(folder, '.vscode', 'formatter.json'),
        '{\n  // local config\n  "scarpet": { "indentSize": 3 }\n}\n'
    );
    try {
        const harness = createHarness();
        harness.workspaceFolder = folder;
        assert.equal(harness.format(makeDocument('f(a)->(a;b)'))[0].newText, 'f(a) -> (\n   a;\n   b\n)\n');

        harness.settings.set('indentSize', 8);
        assert.equal(harness.format(makeDocument('f(a)->(a;b)'))[0].newText, 'f(a) -> (\n        a;\n        b\n)\n');
    } finally {
        fs.rmSync(folder, { recursive: true, force: true });
    }
});

test('extension: range formatting covers the top level statement', () => {
    const harness = createHarness();
    const source = ['first() -> 1;', 'second() -> (', '  a=1;', '  b=2', ');'].join('\n');
    const start = source.indexOf('a=1');
    const edits = harness.formatRange(makeDocument(source), start, start + 1);
    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0].range.start, { line: 1, character: 0 });
    assert.deepEqual(edits[0].range.end, { line: 4, character: 2 });
    assert.equal(edits[0].newText, 'second() -> (\n  a = 1;\n  b = 2\n);');
});

test('extension: the Formatter command edits the active editor', () => {
    const harness = createHarness();
    const applied: FakeEdit[] = [];
    harness.setActiveEditor({
        document: makeDocument('a=1+2'),
        edit: (callback: (builder: { replace(range: FakeRange, text: string): void }) => void) => {
            callback({ replace: (range, text) => void applied.push({ range, newText: text }) });
            return Promise.resolve(true);
        },
    });

    harness.runCommand('ScarpetFormatter.formatting');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].newText, 'a = 1 + 2\n');
});

test('extension: the Formatter command reports when there is no editor', () => {
    const harness = createHarness();
    harness.setActiveEditor(null);
    harness.runCommand('ScarpetFormatter.formatting');
    assert.match(harness.messages[harness.messages.length - 1], /no active editor/);
});

test('extension: the config commands are registered', () => {
    const harness = createHarness();
    harness.runCommand('ScarpetFormatter.formatterCreateLocalConfig');
    assert.match(harness.messages[harness.messages.length - 1], /open a folder first/);
});
