# Local grammars

Wasm files here are built locally (no prebuilt wasm exists) and take
priority over the tree-sitter-wasm package. GRAMMAR_TAGS scans this
directory automatically — dropping a wasm in here activates the language.

Current: tree-sitter-sml.wasm, tree-sitter-souffle.wasm, tree-sitter-prolog.wasm

## Build recipe (Windows)

`tree-sitter build --wasm` HANGS with emsdk 6.x on this machine. Use the
manual emcc path instead:

```bat
rem 1. generate parser.c from grammar.js (run in the grammar repo root,
rem    or grammars/prolog/ for foxyseta's nested layout)
node_modules\.bin\tree-sitter.cmd generate

rem 2. compile to wasm (no scanner.c if the grammar has none;
rem    -sSIDE_MODULE is REQUIRED for web-tree-sitter's loader)
call emsdk\emsdk_env.bat
emcc -O2 -I src -o tree-sitter-<name>.wasm src\parser.c src\scanner.c ^
  -sSIDE_MODULE=2 -sEXPORTED_FUNCTIONS=_tree_sitter_<name>

rem 3. copy into this directory
```

Prereqs: emsdk (emsdk install latest && emsdk activate latest), tree-sitter-cli.
Grammar sources live in ../third_party/ (sml, souffle, prolog).
