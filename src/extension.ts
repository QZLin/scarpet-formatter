import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { OptionBag, parseConfig } from './scarpet/config';
import { formatScarpetWithDetail } from './scarpet/format';
import { DEFAULT_OPTIONS } from './scarpet/options';
import { topLevelStatementSpan } from './scarpet/range';

const LANGUAGE_ID = 'scarpet';
const CONFIG_SECTION = 'scarpetFormatter';
const CONFIG_FILE_NAME = 'formatter.json';

export function activate(context: vscode.ExtensionContext): void {
    const formatter = new ScarpetFormatter(context);

    context.subscriptions.push(formatter.output, formatter);
    context.subscriptions.push(
        vscode.commands.registerCommand('ScarpetFormatter.formatting', () => formatter.formatActiveEditor(true)),
        vscode.commands.registerCommand('ScarpetFormatter.formatterConfig', () => formatter.openConfig()),
        vscode.commands.registerCommand('ScarpetFormatter.formatterCreateLocalConfig', () => formatter.createLocalConfig()),
        vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
            provideDocumentFormattingEdits: (document) => formatter.provideEdits(document),
        }),
        vscode.languages.registerDocumentRangeFormattingEditProvider(LANGUAGE_ID, {
            provideDocumentRangeFormattingEdits: (document, range) => formatter.provideEdits(document, range),
        })
    );
}

export function deactivate(): void {
    // nothing to release
}

class ScarpetFormatter {
    readonly output = vscode.window.createOutputChannel('Scarpet Formatter');
    private readonly reportedSkips = new Map<string, string>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    dispose(): void {
        this.reportedSkips.clear();
    }

    // ------------------------------------------------------------- formatting

    /**
     * Formats the whole document, or - for a selection - the top level
     * statements the selection touches.
     */
    provideEdits(document: vscode.TextDocument, range?: vscode.Range): vscode.TextEdit[] {
        const { enabled, options } = this.optionsFor(document.uri);
        if (!enabled) return [];

        const text = document.getText();

        if (range && !isWholeDocument(document, range)) {
            const span = topLevelStatementSpan(text, document.offsetAt(range.start), document.offsetAt(range.end));
            if (!span) return [];
            const result = formatScarpetWithDetail(text.slice(span.start, span.end), {
                ...options,
                endWithNewline: false,
            });
            this.reportSkip(document, result);
            if (!result.changed) return [];
            const replaceRange = new vscode.Range(document.positionAt(span.start), document.positionAt(span.end));
            return [vscode.TextEdit.replace(replaceRange, result.text)];
        }

        const result = formatScarpetWithDetail(text, options);
        this.reportSkip(document, result);
        if (!result.changed) return [];
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
        return [vscode.TextEdit.replace(fullRange, result.text)];
    }

    /**
     * Files the formatter refuses to touch are worth a line in the output
     * channel - otherwise a silent format-on-save looks like a broken formatter.
     */
    private reportSkip(document: vscode.TextDocument, result: { skipped: boolean; reason: string }): void {
        const key = document.uri.toString();
        if (!result.skipped) {
            this.reportedSkips.delete(key);
            return;
        }
        if (this.reportedSkips.get(key) === result.reason) return;
        this.reportedSkips.set(key, result.reason);
        this.output.appendLine(`${vscode.workspace.asRelativePath(document.uri)}: left untouched, ${result.reason}`);
    }

    formatActiveEditor(notify: boolean): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            if (notify) void vscode.window.showInformationMessage('Scarpet Formatter: no active editor.');
            return;
        }

        const edits = this.provideEdits(editor.document);
        if (edits.length === 0) {
            if (notify) {
                const { enabled, options } = this.optionsFor(editor.document.uri);
                if (!enabled) {
                    void vscode.window.showInformationMessage(
                        'Scarpet Formatter is turned off (scarpetFormatter.enable).'
                    );
                    return;
                }
                const detail = formatScarpetWithDetail(editor.document.getText(), options);
                void vscode.window.showInformationMessage(
                    detail.skipped ? `Scarpet Formatter: skipped, ${detail.reason}.` : 'Scarpet: already formatted.'
                );
            }
            return;
        }

        void editor.edit((builder) => {
            for (const edit of edits) builder.replace(edit.range, edit.newText);
        });
    }

    // ------------------------------------------------------------ config file

    private optionsFor(uri?: vscode.Uri): { enabled: boolean; options: OptionBag } {
        const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, uri ?? null);
        const options: OptionBag = {};

        Object.assign(options, this.readConfigFile(this.bundledConfigPath()));
        const local = this.localConfigPath(uri);
        if (local) Object.assign(options, this.readConfigFile(local));
        Object.assign(options, explicitSettings(configuration));

        return { enabled: configuration.get<boolean>('enable', true), options };
    }

    private bundledConfigPath(): string {
        return path.join(this.context.extensionPath, CONFIG_FILE_NAME);
    }

    private localConfigPath(uri?: vscode.Uri): string | null {
        const folder = uri
            ? vscode.workspace.getWorkspaceFolder(uri)
            : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) || null;
        if (!folder) return null;
        return path.join(folder.uri.fsPath, '.vscode', CONFIG_FILE_NAME);
    }

    private readConfigFile(file: string): OptionBag {
        try {
            return parseConfig(fs.readFileSync(file, 'utf8'));
        } catch {
            return {};
        }
    }

    openConfig(): void {
        const local = this.localConfigPath(vscode.window.activeTextEditor?.document.uri);
        const target = local && fs.existsSync(local) ? local : this.bundledConfigPath();
        void vscode.workspace.openTextDocument(target).then(
            (document) => void vscode.window.showTextDocument(document),
            () => void vscode.window.showWarningMessage(`Scarpet Formatter: cannot open ${target}.`)
        );
    }

    createLocalConfig(): void {
        const local = this.localConfigPath(vscode.window.activeTextEditor?.document.uri);
        if (!local) {
            void vscode.window.showWarningMessage(
                'Scarpet Formatter: open a folder first to create a local .vscode/formatter.json.'
            );
            return;
        }
        if (fs.existsSync(local)) {
            void vscode.workspace.openTextDocument(local).then((document) => void vscode.window.showTextDocument(document));
            void vscode.window.showInformationMessage(`Scarpet Formatter: ${local} already exists.`);
            return;
        }

        try {
            fs.mkdirSync(path.dirname(local), { recursive: true });
            fs.copyFileSync(this.bundledConfigPath(), local);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Scarpet Formatter: cannot write ${local}: ${message}`);
            return;
        }

        void vscode.workspace.openTextDocument(local).then((document) => void vscode.window.showTextDocument(document));
        void vscode.window.showInformationMessage(`Scarpet Formatter: created ${local}.`);
    }
}

/** Settings the user really set, as opposed to the ones VS Code fills in. */
function explicitSettings(configuration: vscode.WorkspaceConfiguration): OptionBag {
    const bag: OptionBag = {};
    for (const key of Object.keys(DEFAULT_OPTIONS)) {
        const info = configuration.inspect(key);
        if (!info) continue;
        const value =
            info.workspaceFolderLanguageValue ??
            info.workspaceFolderValue ??
            info.workspaceLanguageValue ??
            info.workspaceValue ??
            info.globalLanguageValue ??
            info.globalValue;
        if (value !== undefined) bag[key] = value;
    }
    return bag;
}

function isWholeDocument(document: vscode.TextDocument, range: vscode.Range): boolean {
    if (range.start.line !== 0 || range.start.character !== 0) return false;
    const lastLine = document.lineCount - 1;
    return range.end.line >= lastLine;
}
