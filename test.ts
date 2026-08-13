/**
 * Standalone smoke test for fence-check. Run: node test.ts
 * Verifies: parser extraction, per-language checking, error detection,
 * ellipsis noise filtering, and clean-code silence.
 */

import { extractFencedBlocks } from "./parser.ts";
import { checkBlock, checkBlocks } from "./check.ts";
import { entryText } from "./index.ts";

const GOOD_TS = `const x: number = 1;
function add(a: number, b: number): number {
	return a + b;
}
console.log(add(x, 2));`;

const BAD_TS = `const x: number = 1;
function add(a: number, b: number): number {
	return a +
}`;

const BAD_PY = `def hello(name):
    print(f"hi {name}"
`;

const TRUNCATED_TS = `function foo() {
	doSomething();
	...
}
...`;

let failed = 0;
function assert(cond: boolean, label: string): void {
	if (cond) {
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(`  ✗ ${label}`);
	}
}

const md = [
	"# Test",
	"",
	"```ts",
	...GOOD_TS.split("\n"),
	"```",
	"",
	"Some text",
	"",
	"```typescript",
	...BAD_TS.split("\n"),
	"```",
	"",
	"```python",
	...BAD_PY.split("\n"),
	"```",
	"",
	"```ts",
	...TRUNCATED_TS.split("\n"),
	"```",
	"",
	"```unknownlang",
	"whatever {{{",
	"```",
].join("\n");

const blocks = extractFencedBlocks(md);
assert(blocks.length === 5, `parser extracts 5 blocks (got ${blocks.length})`);
assert(
	blocks[0].tag === "ts" && blocks[1].tag === "typescript",
	"tags extracted",
);
assert(blocks[2].startLine > 0, "startLine present");

// 4+ backtick opener must close by its own length (regression: isCloser
// used to short-circuit on minLength > 3, swallowing everything after the
// opener). Inner 3-backtick lines stay body; the next block is not swallowed.
const md4 = [
	"````ts",
	"const a = 1;",
	"```", // 3-backtick line: body, not a closer
	"not a closer",
	"````", // real closer (4 backticks)
	"",
	"```python",
	"x = 1",
	"```",
].join("\n");
const blocks4 = extractFencedBlocks(md4);
assert(
	blocks4.length === 2,
	`4-backtick fence closes; next block not swallowed (got ${blocks4.length} blocks)`,
);
assert(
	blocks4[0].tag === "ts" &&
		blocks4[0].lineCount === 3 &&
		blocks4[0].source.includes("not a closer"),
	"inner 3-backtick line stays body",
);
assert(
	blocks4[1].tag === "python" && blocks4[1].source === "x = 1",
	"python block after 4-backtick block intact",
);

const results = (await checkBlocks(blocks)).filter((r) => r !== null);
const byTag = new Map(results.map((r) => [r.tag, r]));

const good = byTag.get("ts")!;
assert(
	good.issues.length === 0,
	`clean ts block passes (got ${good.issues.length} issues)`,
);

const badTs = byTag.get("typescript")!;
assert(
	badTs.issues.length > 0,
	`broken ts block flagged (${badTs.issues.length} issues)`,
);
if (badTs.issues.length > 0) {
	console.log(
		`    first issue: L${badTs.issues[0].line} ${badTs.issues[0].detail} — ${badTs.issues[0].excerpt}`,
	);
}

const badPy = byTag.get("python")!;
assert(
	badPy.issues.length > 0,
	`broken python block flagged (${badPy.issues.length} issues)`,
);

const truncated = results.filter((r) => r.tag === "ts" && r.startLine > 20)[0];
assert(truncated !== undefined, "truncated block checked");
if (truncated) {
	const ellipsisIssues = truncated.issues.filter((i) =>
		i.excerpt.startsWith("..."),
	);
	assert(
		ellipsisIssues.length === 0,
		`ellipsis lines filtered (${ellipsisIssues.length} leaked)`,
	);
	console.log(
		`    remaining issues on truncated block: ${truncated.issues.map((i) => `L${i.line}`).join(", ") || "none"}`,
	);
}

assert(
	results.every((r) => r.tag !== "unknownlang"),
	"unknown tag skipped",
);

// New functional languages from the tree-sitter-wasm package (v2 source).
const hsGood = await checkBlock({
	tag: "haskell",
	check: true,
	source: 'main :: IO ()\nmain = putStrLn "hi"',
	startLine: 1,
	lineCount: 2,
});
assert(hsGood !== null, "haskell grammar loads");
assert(hsGood!.issues.length === 0, "clean haskell block passes");

const hsBad = await checkBlock({
	tag: "haskell",
	check: true,
	source: 'main = putStrLn "hi\n',
	startLine: 1,
	lineCount: 1,
});
assert(
	hsBad !== null && hsBad.issues.length > 0,
	"broken haskell block flagged",
);

// CoT (thinking) parts are extracted and checked like visible text.
const cotBlocks = extractFencedBlocks(
	entryText([
		{
			type: "thinking",
			thinking:
				"考虑用 datalog 建模\n\n```datalog\nedge(a, b). edge(b, c).\npath(X, Y) :- edge(X, Y).\npath(X, Y) :- edge(X, Z), path(Z, Y\n```",
		},
		{ type: "text", text: "结论：有路径。\n\n```js\nconsole.log(1\n```" },
	]),
);
assert(
	cotBlocks.length === 2 &&
		cotBlocks[0].tag === "datalog" &&
		cotBlocks[1].tag === "js",
	"thinking + text blocks both extracted",
);

// no-check marker: blocks opt out of checking (e.g. pseudocode/designs).
const marked = extractFencedBlocks(
	"```typescript no-check\nfoo(bar) → 伪代码\n```\n\n```typescript\nconst x = 1;\n```",
);
assert(
	marked.length === 2 && marked[0].check === false && marked[1].check === true,
	"no-check marker respected",
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
