// Probe every grammar in isolation: load + parse a sample; report survivors.
// Run after upgrading tree-sitter-wasm / web-tree-sitter or adding grammars.
import { GRAMMAR_TAGS, tagToGrammar } from "./languages.ts";
import { checkBlock } from "./check.ts";

// One realistic snippet per grammar; default "x" covers the rest.
const samples: Record<string, string> = {
	bash: "echo hi",
	c: "int main(void) { return 0; }",
	cpp: "int main() { return 0; }",
	css: "a { color: red; }",
	c_sharp: "class X { static void Main() {} }",
	dart: "void main() { print('x'); }",
	elixir: "defmodule X do\nend",
	go: "package main\nfunc main() {}",
	haskell: 'main :: IO ()\nmain = putStrLn "hi"',
	html: "<div></div>",
	java: "class X {}",
	javascript: "const x = 1;",
	json: '{"a": 1}',
	kotlin: "fun main() {}",
	lua: "local x = 1",
	ocaml: "let x = 1",
	ocaml_interface: "val x : int",
	php: "<?php echo 1;",
	python: "x = 1",
	ruby: "x = 1",
	rust: "fn main() {}",
	scala: "object X",
	sml: "val x = 1",
	swift: "let x = 1",
	toml: "a = 1",
	tsx: "const x = <div/>;",
	typescript: "const x: number = 1;",
	vue: "<template><div/></template>",
	yaml: "a: 1",
	zig: "const x = 1;",
	clojure: "(def x 1)",
	commonlisp: "(defvar x 1)",
	scheme: "(define x 1)",
	racket: "#lang racket\n(define x 1)",
	erlang: "-module(x).",
	julia: "x = 1",
};

let ok = 0;
const failed: string[] = [];
for (const tag of [...GRAMMAR_TAGS].sort()) {
	const grammar = tagToGrammar(tag);
	const source = samples[tag] ?? "x";
	const result = await checkBlock({
		tag,
		check: true,
		source,
		startLine: 1,
		lineCount: 1,
	});
	if (result) {
		ok++;
	} else {
		failed.push(grammar ?? tag);
		console.log(`FAIL ${grammar ?? tag}`);
	}
}
console.log(
	`\n${ok}/${GRAMMAR_TAGS.size} working; failed: ${failed.join(", ") || "none"}`,
);
