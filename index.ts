/**
 * fence-check — syntax-check fenced code blocks in assistant messages
 * using tree-sitter WASM grammars.
 *
 * - agent_end: checks the just-finished turn; reports only when errors found.
 * - /fence-check: checks the latest assistant message; always reports.
 *
 * Type notes: @earendil-works/pi-coding-agent is provided by the host at
 * runtime; only the small API surface used here is typed locally.
 */

import { join } from "node:path";
import { checkBlocks, type BlockCheck, type SyntaxIssue } from "./check.ts";
import { SUPPORTED_TAGS } from "./languages.ts";
import { extractFencedBlocks, type FencedBlock } from "./parser.ts";

const REPORT_TYPE = "fence-check:report";
const LOGIC_VERSION = "v6";
const MAX_REPORT_ISSUES = 40;

interface SessionEntry {
	type: string;
	message?: { role?: string; content?: unknown };
}

interface ExtensionCtx {
	sessionManager: { getEntries(): SessionEntry[] };
}

interface ExtensionApi {
	on(
		event: string,
		handler: (event: unknown, ctx: ExtensionCtx) => unknown,
	): void;
	sendMessage(message: {
		customType: string;
		content: string;
		display?: boolean;
	}): void;
	registerCommand(
		name: string,
		options: {
			description: string;
			handler: (args: string, ctx: ExtensionCtx) => unknown;
		},
	): void;
}

export default function (pi: ExtensionApi) {
	pi.on("resources_discover", () => ({
		skillPaths: [join(import.meta.dirname, "skills", "fence-check")],
	}));

	// Audit only while the agent is actively running; after agent_end
	let runActive = false;
	pi.on("agent_start", () => {
		runActive = true;
	});
	pi.on("agent_end", () => {
		runActive = false;
	});

	pi.on("message_end", async (event) => {
		if (!runActive) return;
		const message = (
			event as { message?: { role?: string; content?: unknown } }
		).message;
		// Check assistant messages only (visible text + thinking parts);
		// inject the report right after the message, not at turn end.
		if (!message || message.role !== "assistant") return;
		const blocks = extractFencedBlocks(entryText(message.content)).filter(
			(b) => b.check,
		);
		if (blocks.length === 0) return;
		const results = await checkBlocks(blocks);
		const failed = results.filter((r) => r.issues.length > 0);
		if (failed.length === 0) return; // silent when clean
		pi.sendMessage({
			customType: REPORT_TYPE,
			content: formatReport(failed),
			display: true,
		});
	});

	pi.registerCommand("fence-check", {
		description: "Syntax-check code blocks in the latest assistant message",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getEntries();
			let blocks: FencedBlock[] = [];
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				// Session entries are serialized as {type:"message", message:{role,content}};
				// role/content live in the nested message object.
				const m = entry.message;
				if (entry.type !== "message" || m?.role !== "assistant") continue;
				blocks = extractFencedBlocks(entryText(m.content)).filter(
					(b) => b.check,
				);
				if (blocks.length > 0) break;
			}
			if (blocks.length === 0) {
				pi.sendMessage({
					customType: REPORT_TYPE,
					content:
						"No fenced code blocks found in the latest assistant message.",
					display: true,
				});
				return;
			}
			const results = await checkBlocks(blocks);
			const failed = results.filter((r) => r.issues.length > 0);
			if (results.length === 0) {
				pi.sendMessage({
					customType: REPORT_TYPE,
					content: `No supported code blocks in the latest assistant message (supported tags: ${SUPPORTED_TAGS.join(", ")}).`,
					display: true,
				});
				return;
			}
			if (failed.length === 0) {
				pi.sendMessage({
					customType: REPORT_TYPE,
					content: `✓ ${results.length} code block(s) checked, no syntax errors.`,
					display: true,
				});
				return;
			}
			pi.sendMessage({
				customType: REPORT_TYPE,
				content: formatReport(failed),
				display: true,
			});
		},
	});
}

/**
 * Extract all text from an assistant message content: visible text parts AND
 * Extract all text from an assistant message content: visible text parts AND
 * thinking (chain-of-thought) parts, in order. Code blocks in the CoT are
 * checked just like visible ones.
 */
export function entryText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<{ type?: string; text?: string; thinking?: string }>)
		.flatMap((part) => {
			if (part?.type === "text" && typeof part.text === "string")
				return [part.text];
			if (part?.type === "thinking" && typeof part.thinking === "string") {
				return [part.thinking];
			}
			return [];
		})
		.join("\n");
}

function formatReport(results: BlockCheck[]): string {
	const lines: string[] = [
		`**fence-check ${LOGIC_VERSION}: ${results.length} block(s) with syntax errors**`,
		"",
		"_语法提示，无需回应——后续写代码注意严谨即可。_",
	];
	let total = 0;
	for (const result of results) {
		lines.push("");
		lines.push(
			`**\`${result.tag}\`** (block at message line ${result.startLine}) — ${result.issues.length} issue(s):`,
		);
		for (const issue of result.issues.slice(0, 8)) {
			lines.push(formatIssue(issue));
			total++;
			if (total >= MAX_REPORT_ISSUES) {
				lines.push(`_...truncated at ${MAX_REPORT_ISSUES} issues_`);
				return lines.join("\n");
			}
		}
	}
	return lines.join("\n");
}

function formatIssue(issue: SyntaxIssue): string {
	const marker = issue.kind === "missing" ? "⚠" : "✗";
	return `- ${marker} L${issue.line}:${issue.col + 1} ${issue.detail} — \`${issue.excerpt}\``;
}
