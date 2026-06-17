import * as vscode from 'vscode';
import * as os from 'os';
import { PromptTreeDataProvider } from './treeDataProvider';
import { StorageService } from './storage';
import { PromptGroup, PromptItem, validatePromptData } from './types';
import { PromptPocketPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext) {
	const storage = new StorageService(context);
	const treeDataProvider = new PromptTreeDataProvider(storage, context.extensionPath);

	// Configuration helpers
	function getConfig() {
		return vscode.workspace.getConfiguration('promptPocket');
	}

	function shouldShowCopyNotification(): boolean {
		return getConfig().get<boolean>('showCopyNotification', true);
	}

	function shouldConfirmDelete(): boolean {
		return getConfig().get<boolean>('confirmDelete', true);
	}

	const treeView = vscode.window.createTreeView('prompt-pocket-view', {
		treeDataProvider,
		showCollapseAll: true
	});

	// Open panel command - opens Prompt Pocket in editor tab
	const openPanelCommand = vscode.commands.registerCommand('prompt-pocket.openPanel', () => {
		PromptPocketPanel.createOrShow(storage, context);
	});

	// Helper to find parent group for a prompt
	async function findParentGroup(promptId: string): Promise<PromptGroup | undefined> {
		const data = await storage.load();
		
		function searchGroups(groups: PromptGroup[]): PromptGroup | undefined {
			for (const group of groups) {
				if (group.prompts.some(p => p.id === promptId)) {
					return group;
				}
				const found = searchGroups(group.children);
				if (found) {
					return found;
				}
			}
			return undefined;
		}
		
		return searchGroups(data.groups);
	}

	// Copy prompt to clipboard
	const copyPromptCommand = vscode.commands.registerCommand('prompt-pocket.copyPrompt', async (item: PromptItem) => {
		await vscode.env.clipboard.writeText(normalizeClipboardContent(item.content));
		if (shouldShowCopyNotification()) {
			vscode.window.showInformationMessage(`Copied: ${item.title}`);
		}
	});

	// Create new group
	const createGroupCommand = vscode.commands.registerCommand('prompt-pocket.createGroup', async () => {
		const name = await vscode.window.showInputBox({
			prompt: 'Enter group name',
			placeHolder: 'My Group'
		});

		if (name) {
			const group: PromptGroup = {
				id: generateId(),
				name,
				children: [],
				prompts: []
			};
			await storage.addGroup(group);
			refreshAll();
		}
	});

	// Create new subgroup
	const createSubgroupCommand = vscode.commands.registerCommand('prompt-pocket.createSubgroup', async (parentGroup: PromptGroup) => {
		const name = await vscode.window.showInputBox({
			prompt: 'Enter subgroup name',
			placeHolder: 'My Subgroup'
		});

		if (name) {
			const subgroup: PromptGroup = {
				id: generateId(),
				name,
				children: [],
				prompts: []
			};
			await storage.addSubgroup(parentGroup.id, subgroup);
			refreshAll();
		}
	});

	// Create new prompt
	const createPromptCommand = vscode.commands.registerCommand('prompt-pocket.createPrompt', async (group: PromptGroup) => {
		const title = await vscode.window.showInputBox({
			prompt: 'Enter prompt title',
			placeHolder: 'My Prompt'
		});

		if (!title) {
			return;
		}

		// Create the prompt up front with empty content so it appears in the
		// tree immediately, then open the editor with live autosave wired into
		// the same prompt id. This makes the new prompt feel "real" the moment
		// the user starts typing.
		const prompt: PromptItem = {
			id: generateId(),
			title,
			content: ''
		};
		await storage.addPromptToGroup(group.id, prompt);
		refreshAll();

		let lastSavedContent = '';
		await editPromptContent({
			id: prompt.id,
			title: prompt.title,
			initialContent: '',
			storageDir: context.globalStorageUri,
			onUpdate: async (newContent) => {
				if (newContent === lastSavedContent) {
					return;
				}
				lastSavedContent = newContent;
				await storage.updatePrompt(group.id, prompt.id, { content: newContent });
				refreshAll();
			}
		});
	});

	// Rename group
	const renameGroupCommand = vscode.commands.registerCommand('prompt-pocket.renameGroup', async (group: PromptGroup) => {
		const newName = await vscode.window.showInputBox({
			prompt: 'Enter new group name',
			value: group.name
		});

		if (newName) {
			await storage.updateGroup(group.id, { name: newName });
			refreshAll();
		}
	});

	// Rename prompt
	const renamePromptCommand = vscode.commands.registerCommand('prompt-pocket.renamePrompt', async (prompt: PromptItem) => {
		const parentGroup = await findParentGroup(prompt.id);
		if (!parentGroup) {
			vscode.window.showErrorMessage('Could not find parent group for prompt');
			return;
		}

		const newTitle = await vscode.window.showInputBox({
			prompt: 'Enter new prompt title',
			value: prompt.title
		});

		if (newTitle) {
			await storage.updatePrompt(parentGroup.id, prompt.id, { title: newTitle });
			refreshAll();
		}
	});

	// Edit prompt content
	const editPromptCommand = vscode.commands.registerCommand('prompt-pocket.editPrompt', async (prompt: PromptItem) => {
		const parentGroup = await findParentGroup(prompt.id);
		if (!parentGroup) {
			vscode.window.showErrorMessage('Could not find parent group for prompt');
			return;
		}

		// Capture the last persisted content so we can skip no-op saves while
		// the user types (each save triggers a tree + panel refresh).
		let lastSavedContent = prompt.content;
		await editPromptContent({
			id: prompt.id,
			title: prompt.title,
			initialContent: prompt.content,
			storageDir: context.globalStorageUri,
			onUpdate: async (newContent) => {
				if (newContent === lastSavedContent) {
					return;
				}
				lastSavedContent = newContent;
				await storage.updatePrompt(parentGroup.id, prompt.id, { content: newContent });
				refreshAll();
			}
		});
	});

	// Delete group
	const deleteGroupCommand = vscode.commands.registerCommand('prompt-pocket.deleteGroup', async (group: PromptGroup) => {
		if (shouldConfirmDelete()) {
			const confirmed = await vscode.window.showWarningMessage(
				`Delete group "${group.name}" and all its contents?`,
				{ modal: true },
				'Delete'
			);
			if (confirmed !== 'Delete') {
				return;
			}
		}
		await storage.deleteGroup(group.id);
		refreshAll();
	});

	// Delete prompt
	const deletePromptCommand = vscode.commands.registerCommand('prompt-pocket.deletePrompt', async (prompt: PromptItem) => {
		const parentGroup = await findParentGroup(prompt.id);
		if (!parentGroup) {
			vscode.window.showErrorMessage('Could not find parent group for prompt');
			return;
		}

		if (shouldConfirmDelete()) {
			const confirmed = await vscode.window.showWarningMessage(
				`Delete prompt "${prompt.title}"?`,
				{ modal: true },
				'Delete'
			);
			if (confirmed !== 'Delete') {
				return;
			}
		}
		await storage.deletePrompt(parentGroup.id, prompt.id);
		refreshAll();
	});

	// Command palette: Copy prompt
	const copyPromptFromPaletteCommand = vscode.commands.registerCommand('prompt-pocket.copyPromptFromPalette', async () => {
		const data = await storage.load();
		const allPrompts: Array<{ prompt: PromptItem; group: PromptGroup }> = [];

		const collectPrompts = (groups: PromptGroup[]) => {
			for (const group of groups) {
				for (const prompt of group.prompts) {
					allPrompts.push({ prompt, group });
				}
				collectPrompts(group.children);
			}
		};

		collectPrompts(data.groups);

		if (allPrompts.length === 0) {
			vscode.window.showInformationMessage('No prompts available. Create a prompt first.');
			return;
		}

		const items = allPrompts.map(({ prompt, group }) => ({
			label: prompt.title,
			description: group.name,
			prompt,
			group
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a prompt to copy'
		});

		if (selected) {
			await vscode.env.clipboard.writeText(normalizeClipboardContent(selected.prompt.content));
			if (shouldShowCopyNotification()) {
				vscode.window.showInformationMessage(`Copied: ${selected.prompt.title}`);
			}
		}
	});

	// Refresh tree view and panel
	const refreshCommand = vscode.commands.registerCommand('prompt-pocket.refresh', () => {
		treeDataProvider.refresh();
		if (PromptPocketPanel.currentPanel) {
			PromptPocketPanel.currentPanel.refresh();
		}
	});

	// Helper to refresh both views
	function refreshAll() {
		treeDataProvider.refresh();
		if (PromptPocketPanel.currentPanel) {
			PromptPocketPanel.currentPanel.refresh();
		}
	}

	// Export prompts to JSON file
	const exportPromptsCommand = vscode.commands.registerCommand('prompt-pocket.export', async () => {
		try {
			const data = await storage.load();
			const jsonContent = JSON.stringify(data, null, 2);
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `prompt-pocket-export-${timestamp}.json`;
			const baseUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
			const defaultUri = vscode.Uri.joinPath(baseUri, filename);

			const uri = await vscode.window.showSaveDialog({
				defaultUri,
				saveLabel: 'Export',
				filters: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					'JSON Files': ['json']
				}
			});

			if (uri) {
				await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonContent, 'utf8'));
				vscode.window.showInformationMessage('Prompts exported successfully!');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Import prompts from JSON file
	const importPromptsCommand = vscode.commands.registerCommand('prompt-pocket.import', async () => {
		try {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				filters: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					'JSON Files': ['json']
				}
			});

			if (!uris || uris.length === 0) {
				return;
			}

			const fileContent = await vscode.workspace.fs.readFile(uris[0]);
			const jsonContent = Buffer.from(fileContent).toString('utf8');
			const importedData = JSON.parse(jsonContent);

			// Validate imported data
			if (!validatePromptData(importedData)) {
				vscode.window.showErrorMessage('Invalid prompt data format. Import cancelled.');
				return;
			}

			// Ask user how to handle import
			const choice = await vscode.window.showQuickPick([
				{ label: 'Merge', description: 'Add imported prompts to existing data', value: 'merge' },
				{ label: 'Replace', description: 'Replace all existing prompts with imported data', value: 'replace' }
			], {
				placeHolder: 'How should the import be handled?'
			});

			if (!choice) {
				return;
			}

			if (choice.value === 'replace') {
				await storage.save(importedData);
			} else {
				// Merge: add imported groups to existing data
				const currentData = await storage.load();
				currentData.groups.push(...importedData.groups);
				await storage.save(currentData);
			}

			refreshAll();
			vscode.window.showInformationMessage('Prompts imported successfully!');
		} catch (error) {
			vscode.window.showErrorMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Duplicate prompt
	const duplicatePromptCommand = vscode.commands.registerCommand('prompt-pocket.duplicatePrompt', async (prompt: PromptItem) => {
		const parentGroup = await findParentGroup(prompt.id);
		if (!parentGroup) {
			vscode.window.showErrorMessage('Could not find parent group for prompt');
			return;
		}

		const newPrompt: PromptItem = {
			id: generateId(),
			title: `${prompt.title} (Copy)`,
			content: prompt.content
		};

		await storage.addPromptToGroup(parentGroup.id, newPrompt);
		refreshAll();
		vscode.window.showInformationMessage(`Duplicated: ${prompt.title}`);
	});

	// Duplicate group
	const duplicateGroupCommand = vscode.commands.registerCommand('prompt-pocket.duplicateGroup', async (group: PromptGroup) => {
		const cloneGroup = (g: PromptGroup): PromptGroup => ({
			...g,
			id: generateId(),
			name: `${g.name} (Copy)`,
			children: g.children.map(cloneGroup),
			prompts: g.prompts.map(p => ({ ...p, id: generateId() }))
		});

		const newGroup = cloneGroup(group);
		await storage.addGroup(newGroup);
		refreshAll();
		vscode.window.showInformationMessage(`Duplicated: ${group.name}`);
	});

	// Search prompts
	const searchPromptsCommand = vscode.commands.registerCommand('prompt-pocket.search', async () => {
		const data = await storage.load();
		const allPrompts: Array<{ prompt: PromptItem; group: PromptGroup; path: string[] }> = [];

		const collectPrompts = (groups: PromptGroup[], path: string[] = []) => {
			for (const group of groups) {
				const currentPath = [...path, group.name];
				for (const prompt of group.prompts) {
					allPrompts.push({ prompt, group, path: currentPath });
				}
				collectPrompts(group.children, currentPath);
			}
		};

		collectPrompts(data.groups);

		if (allPrompts.length === 0) {
			vscode.window.showInformationMessage('No prompts available. Create a prompt first.');
			return;
		}

		const items = allPrompts.map(({ prompt, path }) => ({
			label: prompt.title,
			description: path.join(' > '),
			detail: prompt.content.substring(0, 100) + (prompt.content.length > 100 ? '...' : ''),
			prompt
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Search prompts...',
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (selected) {
			await vscode.env.clipboard.writeText(normalizeClipboardContent(selected.prompt.content));
			if (shouldShowCopyNotification()) {
				vscode.window.showInformationMessage(`Copied: ${selected.prompt.title}`);
			}
		}
	});

	context.subscriptions.push(
		treeView,
		openPanelCommand,
		copyPromptCommand,
		createGroupCommand,
		createSubgroupCommand,
		createPromptCommand,
		renameGroupCommand,
		renamePromptCommand,
		editPromptCommand,
		deleteGroupCommand,
		deletePromptCommand,
		copyPromptFromPaletteCommand,
		refreshCommand,
		exportPromptsCommand,
		importPromptsCommand,
		duplicatePromptCommand,
		duplicateGroupCommand,
		searchPromptsCommand
	);
}

export function deactivate() {}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function normalizeClipboardContent(content: string): string {
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
	for (let i = 0; i < lines.length; i++) {
		const current = lines[i];
		const next = i < lines.length - 1 ? lines[i + 1] : undefined;
		output += current;
		if (next === undefined) {
			break;
		}

		const keepNewline = isStructuralLine(current) || isStructuralLine(next);
		if (keepNewline) {
			output += '\n';
		} else {
			output += ' ';
		}
	}

	return output.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Tracks the markdown editor currently open for each prompt so a second
 * click on the same prompt focuses the existing tab instead of stacking
 * a new one. Cleaned up in the close handler below.
 */
const openPromptEditors = new Map<string, vscode.TextDocument>();

/**
 * Open a markdown editor for a prompt's content with live autosave.
 *
 * The editor is backed by a real file inside the extension's globalStorageUri
 * (`edit-cache/<safe-title>.<id>.md`). Backing it with a file — rather than an
 * untitled buffer — is the only way to suppress VS Code's dirty marker and the
 * "Save? Don't Save?" close dialog while still using the standard markdown
 * editor surface. globalState remains the source of truth: the cache file is
 * rewritten from `initialContent` every time we open the editor, so external
 * edits (e.g. from the editor panel) win on reopen.
 *
 * Every text change is debounced ~300ms and then flushed: `doc.save()` writes
 * the buffer to the cache file (clearing the dirty dot), and `onUpdate` is
 * called with the fresh text so the caller can persist it to globalState.
 * Any pending edit is flushed immediately on close, and saves are serialized
 * to prevent read-modify-write races inside `StorageService.updatePrompt`.
 *
 * The returned promise resolves once the editor has been shown — it does NOT
 * wait for the document to be closed. Editing is fire-and-forget from the
 * caller's perspective; all persistence flows through `onUpdate`.
 *
 * TODO: orphan cache files (whose prompt was deleted or renamed) currently
 * linger in globalStorageUri. Acceptable as a small disk cost; revisit if the
 * cache grows unboundedly for heavy users.
 */
async function editPromptContent(options: {
	id: string;
	title: string;
	initialContent: string;
	storageDir: vscode.Uri;
	onUpdate: (content: string) => Promise<void> | void;
}): Promise<void> {
	const { id, title, initialContent, storageDir, onUpdate } = options;

	const existing = openPromptEditors.get(id);
	if (existing && !existing.isClosed) {
		await vscode.window.showTextDocument(existing, {
			preview: false,
			viewColumn: vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
		});
		return;
	}

	const cacheDir = vscode.Uri.joinPath(storageDir, 'edit-cache');
	await vscode.workspace.fs.createDirectory(cacheDir);
	const filename = `${sanitizePromptFilename(title)}.${id}.md`;
	const fileUri = vscode.Uri.joinPath(cacheDir, filename);
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(initialContent, 'utf8'));

	const doc = await vscode.workspace.openTextDocument(fileUri);
	openPromptEditors.set(id, doc);

	await vscode.window.showTextDocument(doc, {
		preview: false,
		viewColumn: vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
	});

	const SAVE_DEBOUNCE_MS = 300;
	let pendingSave: NodeJS.Timeout | undefined;
	// Serialize saves so that a debounced flush still in flight can't be
	// clobbered by the next one. StorageService.updatePrompt does a
	// load -> mutate -> save sequence which is not atomic.
	let saveQueue: Promise<void> = Promise.resolve();

	const flush = (): Promise<void> => {
		if (pendingSave) {
			clearTimeout(pendingSave);
			pendingSave = undefined;
		}
		saveQueue = saveQueue.then(async () => {
			try {
				if (doc.isDirty) {
					await doc.save();
				}
				await onUpdate(doc.getText());
			} catch (err) {
				vscode.window.showErrorMessage(
					`Failed to save prompt: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		});
		return saveQueue;
	};

	const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document !== doc) {
			return;
		}
		if (pendingSave) {
			clearTimeout(pendingSave);
		}
		pendingSave = setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
	});

	const closeSubscription = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
		if (closedDoc !== doc) {
			return;
		}
		changeSubscription.dispose();
		closeSubscription.dispose();
		openPromptEditors.delete(id);
		void flush();
	});
}

/**
 * Strip filesystem-unsafe characters from a prompt title so it can be used
 * inside a cache filename. Empty / all-stripped titles fall back to "prompt".
 */
function sanitizePromptFilename(input: string): string {
	const cleaned = input.replace(/[\\/:*?"<>|]/g, '-').trim().substring(0, 80);
	return cleaned || 'prompt';
}

