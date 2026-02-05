import * as vscode from 'vscode';
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
		await vscode.env.clipboard.writeText(item.content);
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

		// Open a new editor for multiline content
		const content = await editPromptContent('');

		if (content !== undefined) {
			const prompt: PromptItem = {
				id: generateId(),
				title,
				content: content || ''
			};
			await storage.addPromptToGroup(group.id, prompt);
			refreshAll();
		}
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

		// Open editor for multiline content
		const newContent = await editPromptContent(prompt.content, prompt.title);

		if (newContent !== undefined) {
			await storage.updatePrompt(parentGroup.id, prompt.id, { content: newContent });
			refreshAll();
		}
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
			await vscode.env.clipboard.writeText(selected.prompt.content);
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

			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file('prompt-pocket-export.json'),
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
			await vscode.env.clipboard.writeText(selected.prompt.content);
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

/**
 * Open a text editor for editing multiline prompt content
 */
async function editPromptContent(initialContent: string, title?: string): Promise<string | undefined> {
	const doc = await vscode.workspace.openTextDocument({
		content: initialContent,
		language: 'markdown'
	});

	await vscode.window.showTextDocument(doc, {
		preview: false,
		viewColumn: vscode.ViewColumn.Beside
	});

	// Show a message to guide the user
	const message = title 
		? `Editing prompt: ${title}. Close the editor when done.`
		: 'Enter prompt content. Close the editor when done.';
	
	vscode.window.showInformationMessage(message);

	// Wait for the document to be closed
	return new Promise<string | undefined>((resolve) => {
		const disposable = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
			if (closedDoc === doc) {
				disposable.dispose();
				// Check if the document was modified
				if (doc.isDirty) {
					// User closed without saving, ask if they want to keep changes
					vscode.window.showWarningMessage(
						'Document has unsaved changes. Save changes?',
						'Save',
						'Discard'
					).then((choice) => {
						if (choice === 'Save') {
							resolve(doc.getText());
						} else {
							resolve(undefined);
						}
					});
				} else {
					// Document was saved or unchanged
					resolve(doc.getText());
				}
			}
		});
	});
}

