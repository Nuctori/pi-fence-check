/**
 * Extract fenced code blocks from markdown text.
 * CommonMark-ish: 0-3 leading spaces, ``` or ~~~ opener, closing fence
 * of the same char with >= opener length. Returns every block (no tag
 * allowlist) with its position so checkers can map errors back.
 */

export interface FencedBlock {
	/** First whitespace-delimited token of the info string, lowercased. */
	tag: string;
	/** False when the info string contains a no-check/skip marker. */
	check: boolean;
	source: string;
	/** 1-based line of the block's first source line within the message text. */
	startLine: number;
	lineCount: number;
}

const OPENER_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function extractFencedBlocks(markdown: string): FencedBlock[] {
	const lines = markdown.split("\n");
	const blocks: FencedBlock[] = [];
	let active:
		| {
				char: string;
				length: number;
				tag: string;
				check: boolean;
				start: number;
				body: string[];
		  }
		| undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (active) {
			if (isCloser(line, active.char, active.length)) {
				blocks.push({
					tag: active.tag,
					check: active.check,
					source: active.body.join("\n"),
					startLine: active.start,
					lineCount: active.body.length,
				});
				active = undefined;
			} else {
				active.body.push(line);
			}
			continue;
		}
		const opener = parseOpener(line);
		if (opener) {
			active = { ...opener, start: i + 2, body: [] };
		}
	}
	// Unterminated fence: keep what was collected.
	if (active) {
		blocks.push({
			tag: active.tag,
			check: active.check,
			source: active.body.join("\n"),
			startLine: active.start,
			lineCount: active.body.length,
		});
	}
	return blocks;
}

function parseOpener(
	line: string,
): { char: string; length: number; tag: string; check: boolean } | null {
	const match = OPENER_RE.exec(line);
	if (!match) return null;
	const fence = match[2];
	const rest = match[3];
	if (fence[0] === "`" && rest.includes("`")) return null;
	const tokens = rest.trim().split(/\s+/);
	const tag = (tokens[0] ?? "").toLowerCase();
	const check = !tokens.slice(1).some((t) => t === "no-check" || t === "skip");
	return { char: fence[0], length: fence.length, tag, check };
}

function isCloser(line: string, char: string, minLength: number): boolean {
	return new RegExp(`^ {0,3}${char}{${minLength},}\\s*$`).test(line);
}
