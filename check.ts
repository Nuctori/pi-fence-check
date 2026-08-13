/**
 * Syntax checking of fenced code blocks via tree-sitter WASM.
 * Grammars load lazily from the tree-sitter-wasms package and are cached.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
	Parser,
	Language,
	type Node as SyntaxNode,
	type Tree,
} from "web-tree-sitter";
import { tagToGrammar } from "./languages.ts";
import type { FencedBlock } from "./parser.ts";

const require = createRequire(import.meta.url);
const PKG_WASM_DIR = join(dirname(require.resolve("tree-sitter-wasm")), "out");
// Locally built grammars that have no prebuilt wasm (e.g. sml).
const LOCAL_WASM_DIR = join(import.meta.dirname, "grammars");

/** Grammar wasm path: local build wins, else the prebuilt package. */
function wasmPathFor(grammar: string): string | null {
	const local = join(LOCAL_WASM_DIR, `tree-sitter-${grammar}.wasm`);
	if (existsSync(local)) return local;
	const pkg = join(PKG_WASM_DIR, grammar, `tree-sitter-${grammar}.wasm`);
	return existsSync(pkg) ? pkg : null;
}

const parsers = new Map<string, Parser>();
const loading = new Map<string, Promise<Parser | null>>();
let initPromise: Promise<void> | null = null;

export interface SyntaxIssue {
	/** 1-based line within the block. */
	line: number;
	/** 0-based column within the line. */
	col: number;
	kind: "error" | "missing";
	detail: string;
	excerpt: string;
}

export interface BlockCheck {
	tag: string;
	grammar: string;
	startLine: number;
	issues: SyntaxIssue[];
}

export const MAX_ISSUES_PER_BLOCK = 8;

function ensureInitialized(): Promise<void> {
	if (!initPromise) initPromise = Parser.init();
	return initPromise!;
}

function parserFor(grammar: string): Promise<Parser | null> {
	const cached = parsers.get(grammar);
	if (cached) return Promise.resolve(cached);
	let pending = loading.get(grammar);
	if (!pending) {
		pending = loadParser(grammar).then((parser) => {
			loading.delete(grammar);
			if (parser) parsers.set(grammar, parser);
			return parser;
		});
		loading.set(grammar, pending);
	}
	return pending;
}

async function loadParser(grammar: string): Promise<Parser | null> {
	try {
		await ensureInitialized();
		const parser = new Parser();
		const wasmPath = wasmPathFor(grammar);
		if (!wasmPath) return null;
		const lang = await Language.load(wasmPath);
		parser.setLanguage(lang);
		return parser;
	} catch (err) {
		console.error(`[fence-check] failed to load grammar ${grammar}:`, err);
		return null;
	}
}

/** Check one block. Returns null when no grammar covers its tag. */
export async function checkBlock(
	block: FencedBlock,
): Promise<BlockCheck | null> {
	const grammar = tagToGrammar(block.tag);
	if (!grammar) return null;
	const parser = await parserFor(grammar);
	if (!parser) return null;

	let tree: Tree | null = null;
	try {
		tree = parser.parse(block.source);
	} catch (err) {
		console.error(`[fence-check] parse failed for ${grammar} block:`, err);
		return null;
	}
	if (!tree) return null;
	const issues = collectIssues(tree.rootNode, block.source);
	return {
		tag: block.tag,
		grammar,
		startLine: block.startLine,
		issues: issues.slice(0, MAX_ISSUES_PER_BLOCK),
	};
}

/** Check many blocks in parallel; blocks without a grammar are omitted. */
export async function checkBlocks(
	blocks: FencedBlock[],
): Promise<BlockCheck[]> {
	const results = await Promise.all(blocks.map(checkBlock));
	return results.filter((r): r is BlockCheck => r !== null);
}

const ELLIPSIS_RE = /^\s*(\.\.\.|…)\s*$/;

/**
 * isMissing is a method in web-tree-sitter 0.20.x, a getter in 0.22+.
 * Handle both shapes so the extension survives a version bump.
 */
function isMissingNode(node: SyntaxNode): boolean {
	const n = node as unknown as { isMissing?: boolean | (() => boolean) };
	if (typeof n.isMissing === "function")
		return (n.isMissing as () => boolean).call(node);
	return !!n.isMissing;
}

function collectIssues(root: SyntaxNode, source: string): SyntaxIssue[] {
	const lines = source.split("\n");
	const raw: {
		start: number;
		end: number;
		startRow: number;
		endRow: number;
		endCol: number;
		issue: SyntaxIssue;
	}[] = [];

	const visit = (node: SyntaxNode): void => {
		const isErr = node.type === "ERROR" || isMissingNode(node);
		if (isErr) {
			const startRow = node.startPosition.row;
			const endRow = node.endPosition.row;
			// Skip error regions that overlap an intentional elision marker
			// ("..." / "…" lines) — recovery often spans the whole statement.
			// Also skip the subtree: nested errors are the same noise.
			for (let row = startRow; row <= endRow; row++) {
				if (ELLIPSIS_RE.test(lines[row] ?? "")) return;
			}
			const kind = isMissingNode(node) ? "missing" : "error";
			const detail = isMissingNode(node) ? "missing token" : node.type;
			raw.push({
				start: node.startIndex,
				end: node.endIndex,
				startRow,
				endRow,
				endCol: node.endPosition.column,
				issue: {
					line: startRow + 1,
					col: node.startPosition.column,
					kind,
					detail,
					excerpt: excerpt(lines[startRow] ?? ""),
				},
			});
			// Descend into error subtrees too: the deepest nested error is
			// closest to the actual fault (outer regions often span whole
			// statements after error recovery).
		}
		for (const child of node.children) {
			if (child) visit(child);
		}
	};
	visit(root);

	// Region filter: disjoint broken regions; within each region keep the
	// DEEPEST error (max start) as the fault point, and note the region span.
	raw.sort((a, b) => a.start - b.start || b.end - a.end);
	const kept: SyntaxIssue[] = [];
	let regionEnd = -1;
	let regionStartRow = 0;
	let regionEndRow = 0;
	let best: (typeof raw)[number] | undefined;

	const finalize = (): void => {
		if (!best) return;
		// Multi-line leaf errors: the region START is usually where parsing
		// was still fine (recovery regions swallow preceding valid code);
		// the END is where the parser actually choked. Point there instead.
		if (best.startRow < best.endRow) {
			best.issue.line = best.endRow + 1;
			best.issue.col = best.endCol;
			best.issue.excerpt = excerpt(lines[best.endRow] ?? "");
		}
		best.issue.detail = withSpan(
			best.issue.detail,
			regionStartRow,
			regionEndRow,
		);
		kept.push(best.issue);
	};

	for (const item of raw) {
		if (item.start >= regionEnd) {
			finalize();
			best = item;
			regionStartRow = item.startRow;
			regionEndRow = item.endRow;
			regionEnd = item.end;
		} else {
			regionEnd = Math.max(regionEnd, item.end);
			regionEndRow = Math.max(regionEndRow, item.endRow);
			if (item.start > best!.start) best = item;
		}
	}
	finalize();
	return kept;
}

/** Append the region span for multi-line regions, e.g. "ERROR (region L1-L8)". */
function withSpan(detail: string, startRow: number, endRow: number): string {
	return startRow < endRow
		? `${detail} (region L${startRow + 1}-L${endRow + 1})`
		: detail;
}

function excerpt(line: string): string {
	const trimmed = line.trim();
	return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}
