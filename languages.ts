/**
 * Fence tag -> tree-sitter grammar resolution.
 *
 * Grammar wasm sources, in priority order:
 *  1. <extension>/grammars/tree-sitter-<grammar>.wasm  (locally built grammars,
 *     e.g. sml, which has no prebuilt wasm anywhere)
 *  2. tree-sitter-wasm package out/<grammar>/tree-sitter-<grammar>.wasm
 *     (106 prebuilt grammars, all built with tree-sitter-cli 0.26.x)
 *
 * The runtime is web-tree-sitter 0.26.x (ABI 15). Grammars that fail to
 * load/parse are skipped per-block at runtime (try/catch in check.ts), so
 * the set below is intentionally broad; probe.ts verifies empirically.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("tree-sitter-wasm/manifest.json");

/** Grammars excluded: markdown is slow and noise-prone for chat blocks. */
const EXCLUDED = new Set(["markdown", "markdown_inline", "comment"]);

let packageGrammars: string[] = [];
try {
	packageGrammars = Object.keys(
		JSON.parse(readFileSync(manifestPath, "utf8")),
	).filter((lang) => !EXCLUDED.has(lang));
} catch (err) {
	// Broken install (missing/unreadable manifest): fail loudly at load
	// rather than silently checking nothing.
	console.error("[fence-check] failed to read tree-sitter-wasm manifest:", err);
}

/** Locally built grammars (no prebuilt wasm exists): scanned from grammars/. */
function localGrammars(): string[] {
	try {
		return readdirSync(join(import.meta.dirname, "grammars"))
			.filter((f) => f.startsWith("tree-sitter-") && f.endsWith(".wasm"))
			.map((f) => f.slice("tree-sitter-".length, -".wasm".length));
	} catch {
		return []; // grammars/ missing or unreadable: package grammars only
	}
}

/** All grammar names available from the package manifest + local builds. */
export const GRAMMAR_TAGS: ReadonlySet<string> = new Set([
	...packageGrammars,
	...localGrammars(),
]);

const ALIASES: Record<string, string> = {
	// js/ts family
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	node: "javascript",
	ts: "typescript",
	// web
	htm: "html",
	htmx: "html",
	yml: "yaml",
	jsonc: "json",
	json5: "json",
	scss: "scss",
	// scripting
	py: "python",
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	rb: "ruby",
	php_only: "php",
	ps1: "powershell",
	pwsh: "powershell",
	pl: "perl",
	// systems
	rs: "rust",
	"c++": "cpp",
	cc: "cpp",
	cpp: "cpp",
	hpp: "cpp",
	h: "cpp",
	cs: "c_sharp",
	csharp: "c_sharp",
	"c#": "c_sharp",
	"obj-c": "objc",
	"objective-c": "objc",
	// functional
	hs: "haskell",
	ml: "ocaml",
	mli: "ocaml_interface",
	clj: "clojure",
	cljs: "clojure",
	lisp: "commonlisp",
	rkt: "racket",
	erl: "erlang",
	ex: "elixir",
	exs: "elixir",
	jl: "julia",
	// config / data
	tf: "terraform",
	hcl: "hcl",
	make: "make",
	makefile: "make",
	docker: "dockerfile",
	dockerfile: "dockerfile",
	ini: "ini",
	diff: "diff",
	regex: "regex",
	regexp: "regex",
	sql: "sql",
	gql: "graphql",
	proto: "proto",
	protobuf: "proto",
	// other
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	scala: "scala",
	elm: "elm",
	gleam: "gleam",
	nix: "nix",
	nim: "nim",
	dart: "dart",
	vue: "vue",
	f90: "fortran",
	f95: "fortran",
	r: "r",
	matlab: "matlab",
	awk: "awk",
	fish: "fish",
	cmake: "cmake",
	just: "just",
	kdl: "kdl",
	toml: "toml",
	zig: "zig",
	d: "d",
	typst: "typst",
	latex: "latex",
	bibtex: "bibtex",
	glsl: "glsl",
	cuda: "cuda",
	cairo: "cairo",
	gdscript: "gdscript",
	qml: "qmljs",
	angular: "angular",
	astro: "astro",
	svelte: "svelte",
	razor: "razor",
	templ: "templ",
	liquid: "liquid",
	prisma: "prisma",
	// odd fences
	gitignore: "gitignore",
	gitattributes: "gitattributes",
	git_config: "git_config",
	ssh_config: "ssh_config",
	editorconfig: "editorconfig",
	requirements: "requirements",
	devicetree: "devicetree",
	systemverilog: "systemverilog",
	verilog: "systemverilog",
	vim: "vim",
	vimdoc: "vimdoc",
	desktop: "desktop",
	sln: "sln",
	csv: "csv",
	tsv: "tsv",
	psv: "psv",
	jq: "jq",
	query: "query",
	nginx: "nginx",
	godot_resource: "godot_resource",
	solidity: "solidity",
	graphql: "graphql",
	groovy: "groovy",
	// lisp family direct names
	scheme: "scheme",
	commonlisp: "commonlisp",
	racket: "racket",
	clojure: "clojure",
	// sml family
	smlnj: "sml",
	sml: "sml",
	// datalog / prolog (locally built, see grammars/README)
	datalog: "souffle",
	souffle: "souffle",
	dl: "souffle",
	prolog: "prolog",
	swipl: "prolog",
	biscuit: "biscuit",
};

/** Returns the grammar name for a tag, or null if unsupported. */
export function tagToGrammar(tag: string): string | null {
	if (!tag) return null;
	const base = ALIASES[tag] ?? tag;
	return GRAMMAR_TAGS.has(base) ? base : null;
}

/** All fence tags accepted, for user-facing messages. */
export const SUPPORTED_TAGS = [
	...new Set([...GRAMMAR_TAGS, ...Object.keys(ALIASES)]),
].sort();
