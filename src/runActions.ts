import * as vscode from 'vscode';

/**
 * The set of behaviors the **Run** (▶) button on a prompt row can perform.
 * Exposed to users via the `promptPocket.runAction` setting; adding or
 * removing a variant is a public-contract change.
 */
export type RunAction = 'copilotChat' | 'insertAtCursor' | 'terminal' | 'clipboard';

/**
 * Outcome of a Run dispatch. The discriminated `kind` lets callers tell whether
 * the user got their requested behavior (`done`) or got the clipboard fallback
 * (`fellback`) because the requested behavior wasn't reachable in this editor.
 */
export type RunResult =
	| { kind: 'done'; action: RunAction; message: string }
	| { kind: 'fellback'; from: RunAction; reason: string; message: string };

/**
 * Inputs the strategy map needs to do its job. Passed explicitly so the
 * module stays decoupled from `extension.ts` and so tests can call strategies
 * with arbitrary configurations without touching VS Code settings.
 */
export interface RunConfig {
	runAction: RunAction;
	showCopyNotification: boolean;
}

const TERMINAL_NAME = 'Prompt Pocket';

/**
 * Normalize prompt content for clipboard paste. Preserves intentional
 * structure (lists, code fences, headings, blockquotes, indented blocks)
 * while collapsing soft-wrapped paragraph line breaks into spaces.
 *
 * Moved here from extension.ts as part of consolidating the 3 existing copy
 * paths and the new run-fallback path onto one helper.
 */
export function normalizeClipboardContent(content: string): string {
	const normalized = content.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	const isStructuralLine = (line: string): boolean => {
		const trimmed = line.trim();
		if (!trimmed) {
			return true;
		}
		return /^([-*+]|\d+[.)])\s+/.test(trimmed) || // bullet/numbered list
			/^#{1,6}\s+/.test(trimmed) || // markdown heading
			/^```/.test(trimmed) || // fenced code block
			/^>\s+/.test(trimmed) || // blockquote
			/^\|.*\|$/.test(trimmed) || // markdown table row
			/^\s{2,}\S/.test(line); // indented/code-like line
	};

	if (lines.length <= 1) {
		return normalized.replace(/[ \t]{2,}/g, ' ').trim();
	}

	let output = '';
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const current = lines[i];
		const next = i < lines.length - 1 ? lines[i + 1] : undefined;
		const currentIsFence = /^```/.test(current.trim());
		const nextIsFence = next !== undefined && /^```/.test(next.trim());
		output += current;
		if (next === undefined) {
			break;
		}
		const keepNewline = inFence || currentIsFence || nextIsFence || isStructuralLine(current) || isStructuralLine(next);
		output += keepNewline ? '\n' : ' ';
		if (currentIsFence) {
			inFence = !inFence;
		}
	}
	return output.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Write a prompt to the system clipboard, with an optional confirmation toast.
 *
 * Shared by the dedicated Copy paths (tree inline button, context menu,
 * Command Palette quick-pick, panel search) AND by the clipboard fallback
 * inside the Run dispatch — collapsing four near-identical inline copies of
 * the same pattern that previously lived in extension.ts.
 */
export async function copyPromptContentWithFeedback(
	content: string,
	title: string,
	config: { showCopyNotification: boolean }
): Promise<void> {
	await vscode.env.clipboard.writeText(normalizeClipboardContent(content));
	if (config.showCopyNotification) {
		vscode.window.showInformationMessage(`Copied: ${title}`);
	}
}

/**
 * Return the long-lived "Prompt Pocket" terminal if one exists (and hasn't
 * been killed by the user), otherwise create a freshly named one. Using a
 * single named terminal across Run-into-terminal clicks prevents the user
 * from accumulating dozens of terminals over a long session.
 */
function findOrCreatePromptPocketTerminal(): vscode.Terminal {
	const existing = vscode.window.terminals.find(
		(t) => t.name === TERMINAL_NAME && t.exitStatus === undefined
	);
	return existing ?? vscode.window.createTerminal({ name: TERMINAL_NAME });
}

/**
 * One implementation per RunAction. Each strategy is responsible for:
 *   1. Attempting its preferred behavior.
 *   2. Falling back to `copyPromptContentWithFeedback` if the preferred
 *      behavior can't be reached in the current editor / environment.
 *   3. Returning a RunResult describing what actually happened so the caller
 *      can show an accurate toast.
 *
 * Strategies do NOT consult VS Code settings directly — they receive a
 * `RunConfig` so they remain pure-ish and unit-testable.
 */
const STRATEGIES: Record<
	RunAction,
	(content: string, title: string, config: RunConfig) => Promise<RunResult>
> = {
	copilotChat: async (content, title, config) => {
		try {
			// `workbench.action.chat.open` is the documented VS Code chat entry
			// point. The `mode: 'agent'` hint asks the host (Copilot Chat in
			// VS Code 1.95+, Cursor's chat panel in Cursor) to open in agent
			// mode rather than the default (typically "ask"), which matches the
			// "Run this prompt" mental model better. Older VS Code versions and
			// chat hosts that don't recognize the hint silently ignore it and
			// fall through to their default mode — no regression. The command
			// throws when no chat provider is registered (e.g. VS Code without
			// Copilot installed), which we catch to drive the clipboard fallback.
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: content,
				mode: 'agent'
			});
			return {
				kind: 'done',
				action: 'copilotChat',
				message: `Sent to AI chat (Agent mode): ${title}`
			};
		} catch {
			await copyPromptContentWithFeedback(content, title, config);
			return {
				kind: 'fellback',
				from: 'copilotChat',
				reason: 'No AI chat is available in this editor',
				message: `AI chat not available — prompt copied to clipboard: ${title}`
			};
		}
	},

	insertAtCursor: async (content, title, config) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await copyPromptContentWithFeedback(content, title, config);
			return {
				kind: 'fellback',
				from: 'insertAtCursor',
				reason: 'No active editor to insert into',
				message: `No active editor — prompt copied to clipboard: ${title}`
			};
		}
		// Replace the user's current selection (or insert at the cursor if no
		// range is selected). Matches the behavior of native Paste, which is
		// what users intuitively expect when they "send the prompt to my editor."
		const ok = await editor.edit((edit) => edit.replace(editor.selection, content));
		if (!ok) {
			await copyPromptContentWithFeedback(content, title, config);
			return {
				kind: 'fellback',
				from: 'insertAtCursor',
				reason: 'Editor refused the edit (read-only?)',
				message: `Could not insert into the active editor — prompt copied to clipboard: ${title}`
			};
		}
		return {
			kind: 'done',
			action: 'insertAtCursor',
			message: `Inserted at cursor: ${title}`
		};
	},

	terminal: async (content, title) => {
		const terminal = findOrCreatePromptPocketTerminal();
		terminal.show();
		// `false` = don't append a newline, so the prompt sits at the terminal
		// prompt without auto-executing. Users press Enter themselves if they
		// want to run a shell command. Safer than auto-Enter for chat-style
		// prompts that would otherwise be interpreted as shell syntax.
		terminal.sendText(content, false);
		return {
			kind: 'done',
			action: 'terminal',
			message: `Sent to "${TERMINAL_NAME}" terminal: ${title}`
		};
	},

	clipboard: async (content, title, config) => {
		await copyPromptContentWithFeedback(content, title, config);
		return {
			kind: 'done',
			action: 'clipboard',
			message: `Copied: ${title}`
		};
	}
};

/**
 * Dispatch the user's configured Run action for a prompt. The returned
 * RunResult describes whether the preferred action succeeded or whether the
 * clipboard fallback ran instead — the caller uses it to decide what to toast.
 */
export async function runPromptContent(
	content: string,
	title: string,
	config: RunConfig
): Promise<RunResult> {
	const strategy = STRATEGIES[config.runAction];
	return strategy(content, title, config);
}
