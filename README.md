# fence-check

Syntax-check fenced code blocks in assistant messages via tree-sitter WASM — 112 languages, zero configuration.

Every assistant message (visible text **and** chain-of-thought/thinking parts) is checked the moment it finishes; syntax errors surface as a compact `fence-check` report. Clean code stays silent.

## Install

```bash
pi install npm:fence-check
```

## What it does

- **112 languages** — js/ts/py/go/rs/java/c#/haskell/scheme/clojure/racket/erlang/julia/elm/ocaml/dart/ruby/vue + datalog(souffle)/sml/prolog (locally built grammars, see `grammars/README.md`)
- **Real-time** — report injects right after the message ends (`message_end` hook), not at turn end
- **CoT included** — code blocks inside thinking parts are checked too
- **Fault-point location** — deepest error node + region span (`L6:20 ERROR (region L1-L6)`)
- **Quiet by design** — only reports on errors; `no-check` marker opts blocks out; audit stops at `agent_end`
- **`/fence-check`** — re-check the latest assistant message on demand

## Usage

Write code blocks as usual — they get checked automatically:

````markdown
```datalog
dep(a, b). dep(b, c). dep(c, a).
reach(X, Y) :- dep(X, Y).
```
````

Marking **pseudocode / design sketches** (anything that is not real source code) skips checking:

````markdown
```typescript no-check
tool_call(todo) → gate → BLOCK
```
````

## Report format

```
**fence-check v6: 1 block(s) with syntax errors**

**`js`** (block at message line 4) — 1 issue(s):
- ✗ L3:9 ERROR — `return a + b`

_语法提示，无需回应——后续写代码注意严谨即可。_
```

The report is a hint, not a task: no need to respond to it — just keep the code rigorous.

## Design philosophy

This extension was shaped by a simple observation: an AI that gets told "your code block is wrong" every turn starts explaining, defending, and eventually stops writing code blocks. The fix is not stricter discipline — it is **better signal design**:

1. **Syntax-level, not semantic** — only guarantees the block parses. No execution, no type checking. Minimal surface, minimal noise.
2. **Quiet by default** — report only on errors; clean code stays silent.
3. **A hint, not a task** — the report carries a built-in "no need to respond" line and the skill forbids responding/explaining/defending it. The AI knows there is an error; the correction lives in the *next* code it writes, not in a token-consuming rebuttal.
4. **An escape hatch, not an exemption culture** — `no-check` exists for pseudocode/design sketches only. Real code never gets exempted: the report is a fix signal, not a threat.
5. **Real-time but bounded** — checks inject right after the message ends (`message_end`), and auditing stops at `agent_end`. No stale reports, no after-the-fact nagging.
6. **Chain-of-thought included** — thinking parts are checked too. This is where agents do their symbol reasoning (datalog models, verification sketches); that is exactly the code that benefits most from a parse check.
7. **Version self-identification** — the report header carries a logic version (`v6`), so "did my reload take effect" is answered by the report itself.
8. **Empirically driven grammar set** — every grammar is probe-verified (load + parse) before inclusion; the runtime (web-tree-sitter 0.26.x) and grammar source (tree-sitter-wasm 1.1.4, uniform ABI 15) were chosen by version-compatibility experiments, not by declaration.
9. **Local drop-in grammars** — languages without any prebuilt wasm (sml, souffle/datalog, prolog) are compiled locally once and placed in `grammars/`; the directory is auto-scanned, zero code change.

## How it works

- `tree-sitter-wasm` (106 prebuilt grammars, CLI 0.26.x, ABI 15) + `web-tree-sitter` 0.26.x
- Local `grammars/` directory for grammars with no prebuilt wasm (sml, souffle, prolog) — auto-scanned, drop-in
- Tag aliases (`js`→javascript, `dl`→souffle, `hs`→haskell, …) in `languages.ts`

## Development

```bash
node test.ts    # smoke tests (parser, checking, no-check, thinking extraction)
node probe.ts   # verify every grammar loads + parses
```

Building a local grammar (when `tree-sitter build --wasm` hangs with emsdk 6.x on Windows, use the manual recipe): see `grammars/README.md`.

## License

MIT
