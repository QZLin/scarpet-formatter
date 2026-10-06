# Reference material

This folder holds copies of upstream material the formatter is written against. Nothing here is
part of the published extension (`docs/**` is excluded in `.vscodeignore`).

* `scarpet-Full.md` — the official Scarpet language documentation from
  [gnembon/fabric-carpet](https://github.com/gnembon/fabric-carpet/blob/master/docs/scarpet/Full.md)
  (MIT). Every `<pre>` example in it is used as a test case: the formatter has to format it
  without changing its tokens, and it has to be idempotent. Download it again with:

  ```console
  curl -o docs/reference/scarpet-Full.md \
      https://raw.githubusercontent.com/gnembon/fabric-carpet/master/docs/scarpet/Full.md
  ```

* `java/` — the parts of Carpet's implementation that define the language surface, copied for
  reference (MIT):

  | File | Why |
  | --- | --- |
  | `Tokenizer.java` | where a token starts and ends, escapes, comments, `$` markers, unary/binary decisions |
  | `Operators.java` | the operator list with precedence |
  | `Expression.java` | operator precedence table usage, argument handling, semicolon cleanup |
  | `Loops.java`, `Functions.java`, `Context.java` | used while checking syntax details |

  If the game ever changes the grammar, these files are what `src/scarpet/lexer.ts` has to be
  compared against.
