#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { OptionBag, parseConfig } from './scarpet/config';
import { formatScarpetWithDetail } from './scarpet/format';

interface CliArguments {
    files: string[];
    write: boolean;
    check: boolean;
    configPath: string | null;
    overrides: OptionBag;
    help: boolean;
    version: boolean;
}

const HELP = `scarpet-fmt - format scarpet (Carpet mod) scripts

Usage: scarpet-fmt [options] [files...]

Options:
  -w, --write             rewrite the files in place instead of printing them
  -c, --check             fail (exit code 1) when a file is not formatted
  -i, --indent <n>        number of spaces per indentation level (default 2)
  -t, --tabs              indent with tabs instead of spaces
  -l, --line-width <n>    preferred maximum line width (default 120)
      --trailing-comma <preserve|always|never>
      --config <file>     formatter.json (or plain options json) to read
      --stdin             read the program from standard input
  -h, --help              show this help
  -v, --version           show the version

Without --write the formatted program is written to standard output.`;

export function parseArguments(argv: string[]): CliArguments {
    const result: CliArguments = {
        files: [],
        write: false,
        check: false,
        configPath: null,
        overrides: {},
        help: false,
        version: false,
    };

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        const next = (): string => {
            index++;
            if (index >= argv.length) throw new Error(`Missing value for ${argument}`);
            return argv[index];
        };
        switch (argument) {
            case '--':
                // `npm run fmt -- --write file.sc` and friends
                break;
            case '-w':
            case '--write':
                result.write = true;
                break;
            case '-c':
            case '--check':
                result.check = true;
                break;
            case '-t':
            case '--tabs':
                result.overrides.useTabs = true;
                break;
            case '-i':
            case '--indent':
                result.overrides.indentSize = Number(next());
                break;
            case '-l':
            case '--line-width':
                result.overrides.lineWidth = Number(next());
                break;
            case '--trailing-comma':
                result.overrides.trailingComma = next();
                break;
            case '--config':
                result.configPath = next();
                break;
            case '--stdin':
                result.files.push('-');
                break;
            case '-h':
            case '--help':
                result.help = true;
                break;
            case '-v':
            case '--version':
                result.version = true;
                break;
            default:
                if (argument.startsWith('-') && argument !== '-') {
                    throw new Error(`Unknown option ${argument}`);
                }
                result.files.push(argument);
                break;
        }
    }

    return result;
}

function readConfiguration(configPath: string | null): OptionBag {
    if (!configPath) return {};
    try {
        return parseConfig(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`scarpet-fmt: cannot read ${configPath}: ${message}\n`);
        return {};
    }
}

function main(argv: string[]): number {
    let args: CliArguments;
    try {
        args = parseArguments(argv);
    } catch (error) {
        process.stderr.write(`scarpet-fmt: ${error instanceof Error ? error.message : String(error)}\n`);
        return 2;
    }

    if (args.help) {
        process.stdout.write(HELP + '\n');
        return 0;
    }
    if (args.version) {
        const pkg = readPackageVersion();
        process.stdout.write(`scarpet-fmt ${pkg}\n`);
        return 0;
    }

    const options: OptionBag = { ...readConfiguration(args.configPath), ...args.overrides };
    const files = args.files.length > 0 ? args.files : ['-'];
    let failures = 0;
    let unformatted = 0;

    for (const file of files) {
        const isStdin = file === '-';
        let source: string;
        try {
            source = isStdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
        } catch (error) {
            process.stderr.write(`scarpet-fmt: cannot read ${file}: ${error instanceof Error ? error.message : error}\n`);
            failures++;
            continue;
        }

        const result = formatScarpetWithDetail(source, options);
        if (result.skipped) {
            process.stderr.write(`scarpet-fmt: ${file}: skipped, ${result.reason}\n`);
            failures++;
            continue;
        }

        if (args.check) {
            if (result.changed) {
                process.stderr.write(`scarpet-fmt: ${file} is not formatted\n`);
                unformatted++;
            }
            continue;
        }

        if (args.write) {
            if (result.changed) {
                try {
                    fs.writeFileSync(file, result.text);
                } catch (error) {
                    process.stderr.write(
                        `scarpet-fmt: cannot write ${file}: ${error instanceof Error ? error.message : error}\n`
                    );
                    failures++;
                }
            }
            continue;
        }

        process.stdout.write(result.text);
    }

    if (failures > 0) return 2;
    if (unformatted > 0) return 1;
    return 0;
}

function readPackageVersion(): string {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : 'unknown';
    } catch {
        return 'unknown';
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
