# Scarpet Formatter

A formatter for [Scarpet](https://github.com/gnembon/fabric-carpet/blob/master/docs/scarpet/Full.md), the scripting
language of the [Carpet mod](https://github.com/gnembon/fabric-carpet) — as a VS Code extension and as a command
line tool.

This started as a fork of [Lonefy/vscode-JS-CSS-HTML-formatter](https://github.com/Lonefy/vscode-JS-CSS-HTML-formatter)
that piped Scarpet code through `js-beautify` after replacing `->` with `=`. It is now a real Scarpet formatter: it
has its own tokenizer and layout engine, it understands Scarpet's grammar (`;` statements, `->` definitions, `[]`
lists, `{}` maps, `:` accessors, `...` unpacking, `$` command line markers), and it can never change what your
program means.

```scarpet
foo(a,b)->(y=x*2;
        z=y+1;
   [y,z]);

// becomes

foo(a, b) -> (
  y = x * 2;
  z = y + 1;
  [y, z]
);
```

## Features

* **Scarpet aware layout.** Statements separated by `;` go on their own lines, function bodies become indented
  blocks, trailing lambdas are hugged (`map(list, _(x) -> ( ... ))`), statement blocks hang under their call
  (`loop(10,` … `)`), long argument lists and containers break at the right places, and everything that fits is
  kept on one line.
* **Comments are safe.** Line comments stick to the code they belong to and always end their line, so a comment can
  never swallow the code behind it.
* **Idempotent.** Formatting an already formatted file changes nothing, so it is safe to run on every save.
* **Never breaks code.** The formatted text is tokenized again and compared with the input; if a single token
  changed (or the file cannot be parsed, e.g. because you are halfway through typing it) nothing is written at all.
* **No runtime dependencies.** The formatter is plain TypeScript.

## Using it in VS Code

1. Install the extension (`qzlin.scarpet-formatter`) and open a Scarpet app (`*.sc`).
2. Format the document:
   * `Alt+Shift+F` / `Format Document`,
   * the command palette (`F1`) → **Scarpet: Format Scarpet Code** (works on any open file, even without Scarpet
     language support installed),
   * the context menu → *Format Document*.
3. Format on save: enable `"editor.formatOnSave": true`. The formatter is registered as the default formatter for the
   `scarpet` language, so this works out of the box.

Selecting a piece of code and formatting the selection formats the complete top level statements the selection
touches (Scarpet statements depend on their `;` neighbours, so a partial format never guesses).

Automatic formatting needs VS Code to know your file is Scarpet. If your `.sc` files are not recognised (no Scarpet
syntax extension installed, or `.sc` is claimed by something else), either use the command, or tell VS Code about it:

```jsonc
// .vscode/settings.json
{
    "files.associations": { "*.sc": "scarpet" },
    "editor.defaultFormatter": "qzlin.scarpet-formatter"
}
```

If the formatter decides not to touch a file (see *Never breaks code* above) it says so in the **Scarpet Formatter**
output channel - that is usually a half typed or invalid program.

### Settings

Every option is available in VS Code settings under `scarpetFormatter.`, and in a `formatter.json` file:

| Option | Default | Meaning |
| --- | --- | --- |
| `indentSize` | `2` | Spaces per indentation level. |
| `useTabs` | `false` | Indent with tabs. |
| `lineWidth` | `120` | Preferred maximum line width; `0` disables wrapping. |
| `spaceAroundColon` | `false` | `list:0` vs `list : 0`. |
| `spaceAroundMatch` | `true` | Spaces around the `~` matching operator. |
| `spaceAroundOperators` | `true` | Spaces around binary operators. |
| `spaceAfterComma` | `true` | Space after commas when a container stays on one line. |
| `trailingComma` | `"preserve"` | `preserve`, `always` or `never` for broken lists and maps. |
| `preserveContainerBreaks` | `true` | Keep a list/map multi-line when the source was multi-line. |
| `expandStatementBlocks` | `true` | Put each `;` separated statement on its own line. |
| `preserveBlankLines` | `true` | Keep blank lines between statements. |
| `maxBlankLines` | `1` | Blank lines kept inside a block. |
| `maxBlankLinesTopLevel` | `2` | Blank lines kept between top level statements. |
| `endWithNewline` | `true` | End the file with a single newline. |
| `lineEnding` | `"auto"` | `auto` (keep the file's), `lf` or `crlf`. |
| `safetyCheck` | `true` | Throw the result away when the token stream changed. |
| `enable` | `true` | Turn the whole formatter off. |

Configuration is read from these places, the last one that sets a value wins:

1. the built in defaults,
2. the `formatter.json` shipped with the extension (a commented reference copy),
3. `.vscode/formatter.json` in your workspace,
4. VS Code settings (`scarpetFormatter.*`), including `[scarpet]` language scoped settings.

`.vscode/formatter.json` uses the same shape the previous version wrote, so existing files keep working — including
js-beautify spellings such as `indent_size`, `wrap_line_length` or `end_with_newline`:

```jsonc
{
    "scarpet": {
        "indentSize": 4,
        "lineWidth": 100,
        "trailingComma": "always"
    }
}
```

Commands: **Scarpet: Open Formatter Config** opens the local config file (or the bundled one) and
**Scarpet: Create Local Formatter Config** copies the bundled file into `.vscode/formatter.json`.

Format on save is left to VS Code (`"editor.formatOnSave": true`); the old `onSave` key of `formatter.json` is
ignored, because the previous implementation never actually formatted Scarpet from it.

## Command line

The project is built with [pnpm](https://pnpm.io) (there is no runtime dependency, pnpm only installs the TypeScript
toolchain):

```console
pnpm install
pnpm run compile
node out/src/cli.js --help
node out/src/cli.js app.sc                 # formatted program on stdout
node out/src/cli.js --write apps/*.sc      # rewrite files in place
node out/src/cli.js --check apps/*.sc      # exit 1 when something is not formatted
cat app.sc | node out/src/cli.js --indent 4 --trailing-comma always
pnpm run fmt -- --write apps/*.sc          # same as the node invocation above
```

`scarpet-fmt` is also declared as a `bin` entry, so `pnpm dlx scarpet-fmt` works from a published copy.

## How the formatting decisions are made

Scarpet is a functional language: everything is a call, `,` separates arguments, `;` separates statements, and
`newline` is just whitespace. The formatter builds a bracket tree from the token stream (`src/scarpet/parser.ts`),
turns it into a layout description (`src/scarpet/printer.ts`) and lets the printer decide where lines break
(`src/scarpet/doc.ts`, the usual Wadler/Prettier "group fits or breaks" algorithm).

The Scarpet specific rules are:

* Top level statements always start on a new line, whatever the source looked like.
* A `( ... )` body that contains `;` becomes an indented block; a single expression stays inline.
* `control(args..., statements)` keeps `args` on the call line and hangs the block underneath it.
* A trailing lambda with a block body is hugged by its call, so `map(list, _(x) -> ( ... ))` does not explode.
* Lists and maps keep their brackets tight, break one element per line, and remember whether the author wrote them
  multi-line.
* `:` binds tightly, `~` and every other binary operator get spaces, unary `-`, `+`, `!` and `...` are glued to
  their operand.
* `$` line markers always start a line, because that is what they mean in a command block.

## Development

```console
pnpm install
pnpm run compile          # or: pnpm run watch
pnpm test                 # tsc + node --test
```

`pnpm-lock.yaml` is committed; use `pnpm install --frozen-lockfile` in CI. The scripts shell out to `pnpm run`, so
`npm`/`yarn` are not needed - and no package is needed at runtime either.

The test suite covers the tokenizer, the layout engine, the option handling, range formatting, and two kinds of
invariants over every `<pre>` example of the official Scarpet documentation plus the apps in `test/fixtures`:

* formatting is idempotent,
* formatting never changes the token stream,
* every prefix of a program (think "half typed file") is handled without damage.

A seeded mutation fuzzer (`test/fuzz.test.ts`) throws thousands of mutated programs at the same invariants, and the
whole suite runs in about a second.

```txt
src/
  extension.ts        VS Code integration (formatters, commands, configuration)
  cli.ts              command line interface
  scarpet/
    tokens.ts         token model
    lexer.ts          tokenizer, follows carpet's Tokenizer.java
    parser.ts         bracket tree, comment attachment
    printer.ts        bracket tree -> layout document, all Scarpet rules
    doc.ts            layout document + printer
    options.ts        options, defaults, js-beautify compatibility
    config.ts         formatter.json parsing
    format.ts         public API
    verify.ts         token stream comparison (the safety net)
    range.ts          selection -> top level statements
test/                 node --test suites and fixture apps
docs/reference/       copy of the official Scarpet documentation used by the tests
pnpm-lock.yaml        the only build dependency is the TypeScript toolchain
```

## Known limitations

* A single statement that is one long chain of binary operators (`a + b + c + ...`) is not broken up; put it in
  brackets or split it into statements if you want it wrapped.
* Files that Scarpet itself would reject (unbalanced brackets, a trailing comma in a position Scarpet does not
  accept) are left untouched on purpose.
* `#` is not a comment in Scarpet and is not treated as one here either.

## License and credits

GPL-3.0-or-later for this project (see `LICENSE.md`), originally based on
[Lonefy/vscode-JS-CSS-HTML-formatter](https://github.com/Lonefy/vscode-JS-CSS-HTML-formatter) (MIT). The tokenizer
follows the behaviour of `carpet.script.Tokenizer` from
[fabric-carpet](https://github.com/gnembon/fabric-carpet) (MIT), and the Scarpet examples in
`docs/reference/scarpet-Full.md` are the official Carpet documentation.
