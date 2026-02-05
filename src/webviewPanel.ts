import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from './storage';
import { PromptData, PromptGroup, PromptItem, GroupColor } from './types';
import { Icons } from './icons';

const UI_STATE_KEY = 'prompt-pocket-ui-state';

interface UIState {
	selectedGroupId: string | null;
	searchQuery: string;
	scrollPosition: number;
	showMarkdownPreview: boolean;
	collapsedGroupIds: string[];
	groupsSidebarWidth: number;
	groupsSidebarSize: 'sm' | 'md' | 'lg' | 'xl';
}

interface Config {
	showCopyNotification: boolean;
	confirmDelete: boolean;
	modalClickOutsideToClose: boolean;
}

/**
 * Message types for webview <-> extension communication
 */
type WebviewMessage =
	| { type: 'ready' }
	| { type: 'getState' }
	| { type: 'copy'; promptId: string }
	| { type: 'createPrompt'; groupId: string; title: string; content: string }
	| { type: 'updatePrompt'; groupId: string; promptId: string; title?: string; content?: string }
	| { type: 'deletePrompt'; groupId: string; promptId: string }
	| { type: 'createGroup'; name: string; color?: GroupColor; parentId?: string }
	| { type: 'updateGroup'; groupId: string; name?: string; color?: GroupColor }
	| { type: 'deleteGroup'; groupId: string }
	| { type: 'selectGroup'; groupId: string | null }
	| { type: 'updateUIState'; state: Partial<UIState> }
	| { type: 'reorderPrompt'; groupId: string; promptId: string; newIndex: number }
	| { type: 'movePrompt'; promptId: string; fromGroupId: string; toGroupId: string; newIndex?: number }
	| { type: 'reorderGroup'; groupId: string; newIndex: number }
	| { type: 'moveGroup'; groupId: string; targetGroupId: string | null; newIndex?: number }
	| { type: 'fileSearch'; query: string }
	| { type: 'resolveUris'; uris: string[] }
	| { type: 'export' }
	| { type: 'import' };

type ExtensionMessage =
	| { type: 'state'; data: PromptData; uiState: UIState; config: Config }
	| { type: 'copied'; title: string; showNotification: boolean }
	| { type: 'error'; message: string }
	| { type: 'promptCreated'; prompt: PromptItem; groupId: string }
	| { type: 'promptUpdated'; prompt: PromptItem; groupId: string }
	| { type: 'promptDeleted'; promptId: string; groupId: string }
	| { type: 'groupCreated'; group: PromptGroup }
	| { type: 'groupUpdated'; group: PromptGroup }
	| { type: 'groupDeleted'; groupId: string }
	| { type: 'fileSearchResults'; query: string; results: string[] }
	| { type: 'resolvedPaths'; paths: string[] };

export class PromptPocketPanel {
	public static currentPanel: PromptPocketPanel | undefined;
	private static readonly viewType = 'promptPocket';

	private readonly panel: vscode.WebviewPanel;
	private readonly storage: StorageService;
	private readonly context: vscode.ExtensionContext;
	private disposables: vscode.Disposable[] = [];
	private fileCache: { files: string[]; timestamp: number } = { files: [], timestamp: 0 };

	private constructor(
		panel: vscode.WebviewPanel,
		storage: StorageService,
		context: vscode.ExtensionContext
	) {
		this.panel = panel;
		this.storage = storage;
		this.context = context;

		this.panel.webview.html = this.getWebviewContent();

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(
			(message: WebviewMessage) => this.handleMessage(message),
			null,
			this.disposables
		);
	}

	public static createOrShow(storage: StorageService, context: vscode.ExtensionContext) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (PromptPocketPanel.currentPanel) {
			PromptPocketPanel.currentPanel.panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			PromptPocketPanel.viewType,
			'Prompt Pocket',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(context.extensionPath, 'media'))
				]
			}
		);

		PromptPocketPanel.currentPanel = new PromptPocketPanel(panel, storage, context);
	}

	public dispose() {
		PromptPocketPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			const d = this.disposables.pop();
			if (d) {
				d.dispose();
			}
		}
	}

	private async getUIState(): Promise<UIState> {
		const stored = this.context.globalState.get<UIState>(UI_STATE_KEY);
		return {
			selectedGroupId: null,
			searchQuery: '',
			scrollPosition: 0,
			showMarkdownPreview: false,
			collapsedGroupIds: [],
			groupsSidebarWidth: 220,
			groupsSidebarSize: 'md',
			...stored
		};
	}

	private async saveUIState(state: Partial<UIState>): Promise<void> {
		const current = await this.getUIState();
		await this.context.globalState.update(UI_STATE_KEY, { ...current, ...state });
	}

	private async getWorkspaceFiles(): Promise<string[]> {
		const cacheTtlMs = 60000; // 60 second cache
		const now = Date.now();
		if (this.fileCache.files.length > 0 && now - this.fileCache.timestamp < cacheTtlMs) {
			return this.fileCache.files;
		}

		const exclude = [
			// Package managers & dependencies
			'**/node_modules/**', '**/.pnpm/**', '**/.pnpm-store/**', '**/.yarn/**',
			'**/.npm/**', '**/bower_components/**', '**/jspm_packages/**', '**/vendor/**',
			'**/Pods/**', '**/.bundle/**',
			// Version control
			'**/.git/**', '**/.svn/**', '**/.hg/**',
			// Build outputs
			'**/dist/**', '**/out/**', '**/build/**', '**/target/**', '**/_build/**',
			'**/.next/**', '**/.nuxt/**', '**/.svelte-kit/**', '**/.angular/**',
			'**/.turbo/**', '**/.parcel-cache/**', '**/.cache/**', '**/.sass-cache/**',
			'**/.gradle/**', '**/.maven/**',
			// Python
			'**/__pycache__/**', '**/.venv/**', '**/venv/**', '**/.env/**',
			'**/.pytest_cache/**', '**/.mypy_cache/**', '**/.tox/**',
			'**/*.egg-info/**', '**/.eggs/**',
			// Test & coverage
			'**/coverage/**', '**/.nyc_output/**', '**/htmlcov/**',
			// IDE & editors (keep .vscode for settings, but not .idea)
			'**/.idea/**',
			// DevOps & infra
			'**/.terraform/**', '**/.serverless/**', '**/.vagrant/**',
			// Minified & generated
			'**/*.min.js', '**/*.map', '**/*.min.css'
		].join(',');
		const excludePattern = `{${exclude}}`;
		const uris = await vscode.workspace.findFiles('**/*', excludePattern, 2000);
		const files = uris
			.map(uri => vscode.workspace.asRelativePath(uri, false))
			.sort((a, b) => a.localeCompare(b));

		this.fileCache = { files, timestamp: now };
		return files;
	}

	private getConfig(): Config {
		const config = vscode.workspace.getConfiguration('promptPocket');
		return {
			showCopyNotification: config.get<boolean>('showCopyNotification', true),
			confirmDelete: config.get<boolean>('confirmDelete', true),
			modalClickOutsideToClose: config.get<boolean>('modalClickOutsideToClose', true)
		};
	}

	private async handleMessage(message: WebviewMessage) {
		switch (message.type) {
			case 'ready':
			case 'getState': {
				const data = await this.storage.load();
				const uiState = await this.getUIState();
				const config = this.getConfig();
				this.postMessage({ type: 'state', data, uiState, config });
				break;
			}

			case 'copy': {
				const data = await this.storage.load();
				const prompt = this.findPrompt(data.groups, message.promptId);
				if (prompt) {
					await vscode.env.clipboard.writeText(prompt.content);
					const config = this.getConfig();
					this.postMessage({ type: 'copied', title: prompt.title, showNotification: config.showCopyNotification });
				}
				break;
			}

			case 'createPrompt': {
				const id = generateId();
				const prompt: PromptItem = {
					id,
					title: message.title,
					content: message.content
				};
				await this.storage.addPromptToGroup(message.groupId, prompt);
				this.postMessage({ type: 'promptCreated', prompt, groupId: message.groupId });
				this.refreshState();
				break;
			}

			case 'updatePrompt': {
				const updates: Partial<PromptItem> = {};
				if (message.title !== undefined) {
					updates.title = message.title;
				}
				if (message.content !== undefined) {
					updates.content = message.content;
				}
				await this.storage.updatePrompt(message.groupId, message.promptId, updates);
				const data = await this.storage.load();
				const updatedPrompt = this.findPrompt(data.groups, message.promptId);
				if (updatedPrompt) {
					this.postMessage({ type: 'promptUpdated', prompt: updatedPrompt, groupId: message.groupId });
				}
				this.refreshState();
				break;
			}

			case 'deletePrompt': {
				await this.storage.deletePrompt(message.groupId, message.promptId);
				this.postMessage({ type: 'promptDeleted', promptId: message.promptId, groupId: message.groupId });
				this.refreshState();
				break;
			}

			case 'createGroup': {
				const group: PromptGroup = {
					id: generateId(),
					name: message.name,
					color: message.color || undefined,
					children: [],
					prompts: []
				};
				if (message.parentId) {
					await this.storage.addSubgroup(message.parentId, group);
				} else {
					await this.storage.addGroup(group);
				}
				this.postMessage({ type: 'groupCreated', group });
				this.refreshState();
				break;
			}

			case 'updateGroup': {
				const updates: Partial<PromptGroup> = {};
				if (message.name !== undefined) {
					updates.name = message.name;
				}
				if (message.color !== undefined) {
					updates.color = message.color;
				}
				await this.storage.updateGroup(message.groupId, updates);
				const data = await this.storage.load();
				const updatedGroup = this.findGroup(data.groups, message.groupId);
				if (updatedGroup) {
					this.postMessage({ type: 'groupUpdated', group: updatedGroup });
				}
				this.refreshState();
				break;
			}

			case 'deleteGroup': {
				await this.storage.deleteGroup(message.groupId);
				this.postMessage({ type: 'groupDeleted', groupId: message.groupId });
				this.refreshState();
				break;
			}

			case 'selectGroup': {
				await this.saveUIState({ selectedGroupId: message.groupId });
				break;
			}

			case 'updateUIState': {
				await this.saveUIState(message.state);
				break;
			}

			case 'reorderPrompt': {
				await this.storage.reorderPrompt(message.groupId, message.promptId, message.newIndex);
				this.refreshState();
				break;
			}

			case 'movePrompt': {
				await this.storage.movePromptToGroup(message.promptId, message.fromGroupId, message.toGroupId, message.newIndex);
				this.refreshState();
				break;
			}

			case 'reorderGroup': {
				await this.storage.reorderGroup(message.groupId, message.newIndex);
				this.refreshState();
				break;
			}

			case 'moveGroup': {
				await this.storage.moveGroup(message.groupId, message.targetGroupId, message.newIndex);
				this.refreshState();
				break;
			}

			case 'fileSearch': {
				const query = message.query.trim().toLowerCase();
				const includeHidden = query.startsWith('.');
				const files = await this.getWorkspaceFiles();

				// Filter out hidden paths unless query starts with '.'
				const visibleFiles = includeHidden
					? files
					: files.filter(file => !file.split('/').some(segment => segment.startsWith('.')));

				const results = query
					? visibleFiles.filter(file => file.toLowerCase().includes(query))
					: visibleFiles;

				this.postMessage({
					type: 'fileSearchResults',
					query: message.query,
					results: results.slice(0, 50)
				});
				break;
			}

			case 'resolveUris': {
				const paths = message.uris.map(uriString => {
					try {
						const uri = vscode.Uri.parse(uriString);
						return vscode.workspace.asRelativePath(uri, false);
					} catch {
						return null;
					}
				}).filter((p): p is string => p !== null);

				this.postMessage({
					type: 'resolvedPaths',
					paths
				});
				break;
			}

			case 'export': {
				vscode.commands.executeCommand('prompt-pocket.export');
				break;
			}

			case 'import': {
				vscode.commands.executeCommand('prompt-pocket.import');
				global.setTimeout(() => this.refreshState(), 500);
				break;
			}
		}
	}

	private async refreshState() {
		const data = await this.storage.load();
		const uiState = await this.getUIState();
		const config = this.getConfig();
		this.postMessage({ type: 'state', data, uiState, config });
	}

	public refresh() {
		this.refreshState();
	}

	private postMessage(message: ExtensionMessage) {
		this.panel.webview.postMessage(message);
	}

	private findPrompt(groups: PromptGroup[], promptId: string): PromptItem | undefined {
		for (const group of groups) {
			const prompt = group.prompts.find(p => p.id === promptId);
			if (prompt) {
				return prompt;
			}
			const found = this.findPrompt(group.children, promptId);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	private findGroup(groups: PromptGroup[], groupId: string): PromptGroup | undefined {
		for (const group of groups) {
			if (group.id === groupId) {
				return group;
			}
			const found = this.findGroup(group.children, groupId);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	private getWebviewContent(): string {
		const stylesPath = vscode.Uri.file(
			path.join(this.context.extensionPath, 'media', 'icons.css')
		);
		const stylesUri = this.panel.webview.asWebviewUri(stylesPath);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${this.panel.webview.cspSource}; font-src ${this.panel.webview.cspSource}; script-src 'unsafe-inline';">
	<link href="${stylesUri}" rel="stylesheet">
	<title>Prompt Pocket</title>
	<style>
		:root {
			--spacing-xs: 4px;
			--spacing-sm: 8px;
			--spacing-md: 12px;
			--spacing-lg: 16px;
			--spacing-xl: 24px;
			--radius-sm: 4px;
			--radius-md: 6px;
			--transition: 120ms ease;

			/* Group colors */
			--color-red: #e53935;
			--color-orange: #fb8c00;
			--color-yellow: #fdd835;
			--color-green: #43a047;
			--color-blue: #1e88e5;
			--color-purple: #8e24aa;
			--color-pink: #d81b60;
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			line-height: 1.5;
			height: 100vh;
			overflow: hidden;
		}

		.container {
			display: flex;
			height: 100vh;
		}

		/* Main content area */
		.main-content {
			flex: 1;
			display: flex;
			flex-direction: column;
			min-width: 0;
			padding: var(--spacing-lg);
		}

		/* Groups sidebar */
		.groups-sidebar {
			width: 220px;
			min-width: 180px;
			max-width: 480px;
			border-left: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			display: flex;
			flex-direction: column;
			background: var(--vscode-sideBar-background, var(--vscode-editor-background));
			overflow: hidden;
		}

		.groups-sidebar.size-sm .group-item {
			padding-top: 6px;
			padding-bottom: 6px;
			font-size: 0.9em;
		}

		.groups-sidebar.size-md .group-item {
			padding-top: 8px;
			padding-bottom: 8px;
			font-size: 1em;
		}

		.groups-sidebar.size-lg .group-item {
			padding-top: 10px;
			padding-bottom: 10px;
			font-size: 1.05em;
		}

		.groups-sidebar.size-xl .group-item {
			padding-top: 12px;
			padding-bottom: 12px;
			font-size: 1.1em;
		}

		.sidebar-resizer {
			width: 4px;
			cursor: col-resize;
			background: transparent;
			transition: background var(--transition);
			flex-shrink: 0;
		}

		.sidebar-resizer:hover,
		.sidebar-resizer.dragging {
			background: var(--vscode-editorGroup-border, var(--vscode-widget-border));
		}

		.groups-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: var(--spacing-md);
			border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			gap: var(--spacing-sm);
		}

		.groups-header-title {
			font-weight: 600;
			font-size: 0.85em;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			opacity: 0.8;
		}

		.groups-header-controls {
			display: inline-flex;
			align-items: center;
			gap: var(--spacing-xs);
		}

		.size-toggle {
			display: inline-flex;
			align-items: center;
			border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			border-radius: var(--radius-sm);
			overflow: hidden;
		}

		.size-toggle button {
			background: transparent;
			color: var(--vscode-foreground);
			border: none;
			padding: 2px 6px;
			font-size: 0.8em;
			cursor: pointer;
		}

		.size-toggle button.active {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}

		.groups-list {
			flex: 1;
			overflow-y: auto;
			padding: var(--spacing-sm);
		}

		.tree-guide {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 1px;
			background: var(--vscode-tree-indentGuidesStroke);
			opacity: 0.4;
		}

		.group-item {
			display: flex;
			align-items: center;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
			border-radius: var(--radius-md);
			cursor: pointer;
			transition: background var(--transition);
			margin-bottom: 2px;
			position: relative;
		}

		.group-item:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.group-item.selected {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}

		.group-item.all-prompts {
			font-weight: 500;
			margin-bottom: var(--spacing-sm);
			border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			padding-bottom: var(--spacing-md);
		}

		.group-color-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			flex-shrink: 0;
		}

		.group-name {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.group-count {
			font-size: 0.8em;
			opacity: 0.6;
		}

		.group-actions {
			display: none;
			gap: 2px;
		}

		.group-item:hover .group-actions {
			display: flex;
		}

		.group-item:hover .group-count {
			display: none;
		}

		/* Header */
		.header {
			display: flex;
			flex-direction: column;
			gap: var(--spacing-md);
			padding-bottom: var(--spacing-md);
			border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			flex-shrink: 0;
		}

		.header-row {
			display: flex;
			align-items: center;
			gap: var(--spacing-md);
		}

		/* Search */
		.search-container {
			position: relative;
			flex: 1;
		}

		.search-input {
			width: 100%;
			padding: var(--spacing-sm) var(--spacing-md);
			padding-left: 32px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: var(--radius-md);
			font-size: var(--vscode-font-size);
			font-family: var(--vscode-font-family);
			outline: none;
		}

		.search-input:focus {
			border-color: var(--vscode-focusBorder);
		}

		.search-input::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}

		.search-icon {
			position: absolute;
			left: var(--spacing-sm);
			top: 50%;
			transform: translateY(-50%);
			opacity: 0.6;
			pointer-events: none;
		}

		/* Buttons */
		.btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: var(--spacing-xs);
			padding: var(--spacing-sm) var(--spacing-md);
			border: none;
			border-radius: var(--radius-md);
			font-size: var(--vscode-font-size);
			font-family: var(--vscode-font-family);
			cursor: pointer;
			transition: background var(--transition), opacity var(--transition);
			white-space: nowrap;
		}

		.btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.btn-primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.btn-primary:hover:not(:disabled) {
			background: var(--vscode-button-hoverBackground);
		}

		.btn-secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		.btn-secondary:hover:not(:disabled) {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.btn-ghost {
			background: transparent;
			color: var(--vscode-foreground);
			padding: var(--spacing-xs);
		}

		.btn-ghost:hover:not(:disabled) {
			background: var(--vscode-toolbar-hoverBackground);
		}

		.btn-icon {
			width: 24px;
			height: 24px;
			padding: 0;
		}

		.btn-icon-sm {
			width: 20px;
			height: 20px;
			padding: 0;
		}

		/* Actions row */
		.actions {
			display: flex;
			gap: var(--spacing-sm);
			align-items: center;
		}

		.toggle-label {
			display: flex;
			align-items: center;
			gap: var(--spacing-xs);
			font-size: 0.85em;
			cursor: pointer;
			user-select: none;
		}

		.toggle-label input {
			cursor: pointer;
		}

		/* Prompt list */
		.prompt-list {
			flex: 1;
			overflow-y: auto;
			padding: var(--spacing-md) 0;
		}

		.prompt-list::-webkit-scrollbar {
			width: 8px;
		}

		.prompt-list::-webkit-scrollbar-track {
			background: transparent;
		}

		.prompt-list::-webkit-scrollbar-thumb {
			background: var(--vscode-scrollbarSlider-background);
			border-radius: 4px;
		}

		.prompt-list::-webkit-scrollbar-thumb:hover {
			background: var(--vscode-scrollbarSlider-hoverBackground);
		}

		/* Prompt item */
		.prompt-item {
			display: flex;
			align-items: flex-start;
			gap: var(--spacing-sm);
			padding: var(--spacing-md);
			border-radius: var(--radius-md);
			transition: background var(--transition);
			position: relative;
			border-left: 3px solid transparent;
		}

		.prompt-item:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.prompt-item.selected {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}

		.prompt-item.dragging {
			opacity: 0.5;
			background: var(--vscode-list-activeSelectionBackground);
		}

		.prompt-item.drag-over {
			border-top: 2px solid var(--vscode-focusBorder);
		}

		/* Drag handle - large grab area on left side */
		.drag-handle {
			cursor: grab;
			opacity: 0.3;
			padding: var(--spacing-sm) var(--spacing-md);
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			min-width: 32px;
			min-height: 100%;
			margin-left: calc(-1 * var(--spacing-md));
			margin-top: calc(-1 * var(--spacing-md));
			margin-bottom: calc(-1 * var(--spacing-md));
			border-radius: var(--radius-md) 0 0 var(--radius-md);
			transition: opacity var(--transition), background var(--transition);
		}

		.drag-handle:hover {
			opacity: 0.8;
			background: var(--vscode-list-hoverBackground);
		}

		.drag-handle:active {
			cursor: grabbing;
			opacity: 1;
		}

		.prompt-item-actions {
			display: flex;
			gap: 2px;
			flex-shrink: 0;
			opacity: 0;
			transition: opacity var(--transition);
		}

		.prompt-item:hover .prompt-item-actions,
		.prompt-item.selected .prompt-item-actions {
			opacity: 1;
		}

		/* Always-visible copy button */
		.prompt-copy-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: var(--spacing-xs);
			padding: var(--spacing-sm) var(--spacing-md);
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: var(--radius-md);
			font-size: 0.85em;
			font-family: var(--vscode-font-family);
			cursor: pointer;
			transition: background var(--transition);
			flex-shrink: 0;
			min-width: 70px;
		}

		.prompt-copy-btn:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.prompt-copy-btn .icon {
			font-size: 1.1em;
		}

		.prompt-item-content {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: var(--spacing-xs);
			cursor: pointer;
		}

		.prompt-title {
			font-weight: 500;
			display: flex;
			align-items: center;
			gap: var(--spacing-sm);
		}

		.prompt-title-text {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.prompt-preview {
			font-size: 0.9em;
			opacity: 0.7;
			overflow: hidden;
			font-family: var(--vscode-editor-font-family, monospace);
			white-space: pre-wrap;
			word-break: break-word;
		}

		.prompt-preview.markdown-preview {
			font-family: var(--vscode-font-family);
		}

		.prompt-preview.markdown-preview code {
			background: var(--vscode-textCodeBlock-background);
			padding: 2px 4px;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family, monospace);
		}

		.prompt-preview.markdown-preview pre {
			background: var(--vscode-textCodeBlock-background);
			padding: var(--spacing-sm);
			border-radius: var(--radius-sm);
			overflow-x: auto;
		}

		.prompt-preview.markdown-preview pre code {
			background: none;
			padding: 0;
		}

		.highlight {
			background-color: var(--vscode-editor-findMatchHighlightBackground);
			color: inherit;
			border-radius: 2px;
		}

		.group-item.drag-over {
			background: var(--vscode-list-hoverBackground);
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: -2px;
		}

		.group-item.drag-over-top {
			border-top: 2px solid var(--vscode-focusBorder);
		}

		.group-item.drag-over-bottom {
			border-bottom: 2px solid var(--vscode-focusBorder);
		}

		.group-item.drag-over-center {
			background: var(--vscode-list-hoverBackground);
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: -2px;
		}

		.prompt-group-badge {
			font-size: 0.75em;
			padding: 2px 8px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 10px;
			white-space: nowrap;
			flex-shrink: 0;
		}

		/* Hover tooltip */
		.prompt-tooltip {
			position: fixed;
			z-index: 1000;
			max-width: 500px;
			max-height: 400px;
			padding: var(--spacing-md);
			background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
			border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
			border-radius: var(--radius-md);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
			overflow: auto;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.9em;
			white-space: pre-wrap;
			word-break: break-word;
			pointer-events: none;
			display: none;
		}

		.prompt-tooltip.visible {
			display: block;
		}

		/* Empty state */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			padding: var(--spacing-xl);
			text-align: center;
			opacity: 0.7;
		}

		.empty-state-icon {
			font-size: 48px;
			margin-bottom: var(--spacing-md);
			opacity: 0.5;
		}

		.empty-state-text {
			margin-bottom: var(--spacing-lg);
		}

		/* Modal */
		.modal-overlay {
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 100;
			opacity: 0;
			visibility: hidden;
			transition: opacity var(--transition), visibility var(--transition);
		}

		.modal-overlay.visible {
			opacity: 1;
			visibility: visible;
		}

		.modal {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			border-radius: var(--radius-md);
			width: 600px;
			max-width: 95vw;
			min-width: 400px;
			min-height: 300px;
			max-height: 90vh;
			display: flex;
			flex-direction: column;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			resize: both;
			overflow: auto;
		}

		.modal-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: var(--spacing-md) var(--spacing-lg);
			border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
		}

		.modal-title {
			font-weight: 600;
		}

		.modal-body {
			padding: var(--spacing-lg);
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			gap: var(--spacing-md);
			flex: 1;
			min-height: 0;
		}

		.modal-footer {
			display: flex;
			justify-content: flex-end;
			gap: var(--spacing-sm);
			padding: var(--spacing-md) var(--spacing-lg);
			border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
		}

		/* Form elements */
		.form-group {
			display: flex;
			flex-direction: column;
			gap: var(--spacing-xs);
		}

		.form-label {
			font-weight: 500;
			font-size: 0.9em;
		}

		.form-input {
			padding: var(--spacing-sm) var(--spacing-md);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: var(--radius-md);
			font-size: var(--vscode-font-size);
			font-family: var(--vscode-font-family);
			outline: none;
		}

		.form-input:focus {
			border-color: var(--vscode-focusBorder);
		}

		.form-textarea {
			min-height: 200px;
			resize: none;
			font-family: var(--vscode-editor-font-family, monospace);
			line-height: 1.5;
			flex: 1;
			transition: border-color 0.15s, box-shadow 0.15s;
		}

		.form-textarea.drag-over {
			border-color: var(--vscode-focusBorder);
			box-shadow: 0 0 0 1px var(--vscode-focusBorder);
		}

		.textarea-wrapper {
			position: relative;
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}

		.file-mention-menu {
			position: absolute;
			left: 0;
			right: 0;
			top: 40px;
			max-height: 240px;
			overflow-y: auto;
			background: var(--vscode-menu-background, var(--vscode-editor-background));
			border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
			border-radius: var(--radius-md);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
			z-index: 100;
			display: none;
		}

		.file-mention-menu.visible {
			display: block;
		}

		.file-mention-item {
			display: flex;
			align-items: center;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
			cursor: pointer;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.9em;
			transition: background var(--transition);
		}

		.file-mention-item:hover,
		.file-mention-item.active {
			background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
			color: var(--vscode-menu-selectionForeground, inherit);
		}

		.file-mention-item .file-icon {
			opacity: 0.6;
		}

		.file-mention-item .file-path {
			opacity: 0.6;
			font-size: 0.85em;
			margin-left: auto;
		}

		.file-mention-empty {
			padding: var(--spacing-md);
			text-align: center;
			opacity: 0.6;
			font-size: 0.9em;
		}

		.attached-files {
			display: flex;
			flex-wrap: wrap;
			gap: var(--spacing-xs);
			margin-top: var(--spacing-sm);
		}

		.attached-files:empty {
			display: none;
		}

		.file-chip {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 4px 8px 4px 10px;
			background: var(--vscode-badge-background, rgba(255, 255, 255, 0.1));
			color: var(--vscode-badge-foreground, inherit);
			border-radius: 12px;
			font-size: 0.8em;
			font-family: var(--vscode-editor-font-family, monospace);
			max-width: 100%;
		}

		.file-chip .file-chip-icon {
			opacity: 0.7;
			flex-shrink: 0;
		}

		.file-chip .file-chip-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.file-chip .file-chip-remove {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			border: none;
			background: transparent;
			color: inherit;
			opacity: 0.6;
			cursor: pointer;
			padding: 0;
			border-radius: 50%;
			flex-shrink: 0;
			transition: opacity 0.15s, background 0.15s;
		}

		.file-chip .file-chip-remove:hover {
			opacity: 1;
			background: rgba(255, 255, 255, 0.1);
		}

		.file-chip .file-chip-remove svg {
			width: 10px;
			height: 10px;
		}

		.form-preview {
			min-height: 200px;
			padding: var(--spacing-md);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: var(--radius-md);
			font-family: var(--vscode-font-family);
			line-height: 1.6;
			flex: 1;
			overflow-y: auto;
		}

		.form-preview code {
			background: var(--vscode-textCodeBlock-background);
			padding: 2px 4px;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family, monospace);
		}

		.form-preview pre {
			background: var(--vscode-textCodeBlock-background);
			padding: var(--spacing-sm);
			border-radius: var(--radius-sm);
			overflow-x: auto;
		}

		.form-preview pre code {
			background: none;
			padding: 0;
		}

		.btn-icon.active {
			background: var(--vscode-toolbar-activeBackground, var(--vscode-list-activeSelectionBackground));
			color: var(--vscode-foreground);
		}

		/* Color picker */
		.color-picker {
			display: flex;
			gap: var(--spacing-sm);
			flex-wrap: wrap;
		}

		.color-option {
			width: 28px;
			height: 28px;
			border-radius: 50%;
			cursor: pointer;
			border: 2px solid transparent;
			transition: transform var(--transition), border-color var(--transition);
		}

		.color-option:hover {
			transform: scale(1.1);
		}

		.color-option.selected {
			border-color: var(--vscode-focusBorder);
		}

		.color-option.no-color {
			background: var(--vscode-input-background);
			border: 2px dashed var(--vscode-input-border, var(--vscode-widget-border));
		}

		/* Toast notification */
		.toast {
			position: fixed;
			bottom: var(--spacing-lg);
			left: 50%;
			transform: translateX(-50%) translateY(100px);
			background: var(--vscode-notifications-background, var(--vscode-editor-background));
			color: var(--vscode-notifications-foreground, var(--vscode-foreground));
			border: 1px solid var(--vscode-notifications-border, var(--vscode-widget-border));
			padding: var(--spacing-sm) var(--spacing-lg);
			border-radius: var(--radius-md);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
			opacity: 0;
			transition: transform 200ms ease, opacity 200ms ease;
			z-index: 200;
		}

		.toast.visible {
			transform: translateX(-50%) translateY(0);
			opacity: 1;
		}

		/* Context menu */
		.context-menu {
			position: fixed;
			background: var(--vscode-menu-background);
			border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
			border-radius: var(--radius-md);
			padding: var(--spacing-xs) 0;
			min-width: 160px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
			z-index: 150;
			display: none;
		}

		.context-menu.visible {
			display: block;
		}

		.context-menu-item {
			display: flex;
			align-items: center;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
			cursor: pointer;
			transition: background var(--transition);
		}

		.context-menu-item:hover {
			background: var(--vscode-menu-selectionBackground);
			color: var(--vscode-menu-selectionForeground);
		}

		.context-menu-item.destructive {
			color: var(--vscode-errorForeground);
		}

		.context-menu-separator {
			height: 1px;
			background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border));
			margin: var(--spacing-xs) 0;
		}

		/* SVG icons */
		.icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			vertical-align: middle;
		}

		.icon svg {
			width: 1em;
			height: 1em;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		/* Focus visible for accessibility */
		:focus-visible {
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}

		button:focus:not(:focus-visible) {
			outline: none;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="main-content">
			<div class="header">
				<div class="header-row">
					<div class="search-container">
						<span class="icon search-icon">${Icons.search}</span>
						<input type="text" class="search-input" id="searchInput" placeholder="Search prompts... (Ctrl+F)">
					</div>
					<div class="actions">
						<button class="btn btn-ghost btn-icon" id="importBtn" title="Import">
							<span class="icon">${Icons.import}</span>
						</button>
						<button class="btn btn-ghost btn-icon" id="exportBtn" title="Export">
							<span class="icon">${Icons.export}</span>
						</button>
						<button class="btn btn-primary" id="addPromptBtn">
							<span class="icon">${Icons.add}</span>
							Add
						</button>
					</div>
				</div>
			</div>

			<div class="prompt-list" id="promptList">
				<div class="empty-state" id="emptyState">
					<div class="empty-state-icon" style="font-size: 48px; width: 48px; height: 48px;">${Icons.empty}</div>
					<div class="empty-state-text">
						No prompts yet.<br>
						Create your first prompt to get started.
					</div>
					<button class="btn btn-primary" id="emptyAddBtn">
						<span class="icon">${Icons.add}</span>
						Create Prompt
					</button>
				</div>
			</div>
		</div>

		<div class="sidebar-resizer" id="sidebarResizer" title="Drag to resize"></div>
		<div class="groups-sidebar" id="groupsSidebar">
			<div class="groups-header">
				<span class="groups-header-title">Groups</span>
				<div class="groups-header-controls">
					<div class="size-toggle" id="sizeToggle" title="Group size">
						<button type="button" data-size="sm">S</button>
						<button type="button" data-size="md">M</button>
						<button type="button" data-size="lg">L</button>
							<button type="button" data-size="xl">XL</button>
					</div>
					<button class="btn btn-ghost btn-icon-sm" id="addGroupBtn" title="New Group">
						<span class="icon">${Icons.addGroup}</span>
					</button>
				</div>
			</div>
			<div class="groups-list" id="groupsList"></div>
		</div>
	</div>

	<!-- Prompt Modal -->
	<div class="modal-overlay" id="promptModal">
		<div class="modal">
			<div class="modal-header">
				<span class="modal-title" id="promptModalTitle">New Prompt</span>
				<div style="display: flex; gap: var(--spacing-xs); align-items: center;">
					<button class="btn btn-ghost btn-icon" id="promptModalPreview" title="Toggle Markdown Preview">
						<span class="icon">${Icons.eye}</span>
					</button>
					<button class="btn btn-ghost btn-icon" id="promptModalClose">
						<span class="icon">${Icons.close}</span>
					</button>
				</div>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label class="form-label" for="promptGroup">Group</label>
					<select class="form-input" id="promptGroup"></select>
				</div>
				<div class="form-group">
					<label class="form-label" for="promptTitle">Title</label>
					<input type="text" class="form-input" id="promptTitle" placeholder="Enter prompt title">
				</div>
				<div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
					<label class="form-label" for="promptContent">Content <span style="opacity: 0.5; font-weight: normal; font-size: 0.85em;">Type @ to mention files</span></label>
					<div class="textarea-wrapper">
						<textarea class="form-input form-textarea" id="promptContent" placeholder="Enter prompt content..."></textarea>
						<div class="file-mention-menu" id="fileMentionMenu"></div>
						<div class="form-preview" id="promptPreview" style="display: none;"></div>
					</div>
					<div class="attached-files" id="attachedFiles"></div>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" id="promptModalDelete" style="margin-right: auto; display: none;">Delete</button>
				<button class="btn btn-secondary" id="promptModalCancel">Cancel</button>
				<button class="btn btn-primary" id="promptModalSave">Save</button>
			</div>
		</div>
	</div>

	<!-- Group Modal -->
	<div class="modal-overlay" id="groupModal">
		<div class="modal">
			<div class="modal-header">
				<span class="modal-title" id="groupModalTitle">New Group</span>
				<button class="btn btn-ghost btn-icon" id="groupModalClose">
					<span class="icon">${Icons.close}</span>
				</button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label class="form-label" for="groupName">Group Name</label>
					<input type="text" class="form-input" id="groupName" placeholder="Enter group name">
				</div>
				<div class="form-group">
					<label class="form-label">Color</label>
					<div class="color-picker" id="colorPicker">
						<div class="color-option no-color selected" data-color="" title="No color"></div>
						<div class="color-option" data-color="red" style="background: var(--color-red);" title="Red"></div>
						<div class="color-option" data-color="orange" style="background: var(--color-orange);" title="Orange"></div>
						<div class="color-option" data-color="yellow" style="background: var(--color-yellow);" title="Yellow"></div>
						<div class="color-option" data-color="green" style="background: var(--color-green);" title="Green"></div>
						<div class="color-option" data-color="blue" style="background: var(--color-blue);" title="Blue"></div>
						<div class="color-option" data-color="purple" style="background: var(--color-purple);" title="Purple"></div>
						<div class="color-option" data-color="pink" style="background: var(--color-pink);" title="Pink"></div>
					</div>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" id="groupModalDelete" style="margin-right: auto; display: none;">Delete Group</button>
				<button class="btn btn-secondary" id="groupModalCancel">Cancel</button>
				<button class="btn btn-primary" id="groupModalSave">Save</button>
			</div>
		</div>
	</div>

	<!-- Context menu -->
	<div class="context-menu" id="contextMenu">
		<div class="context-menu-item" data-action="copy">
			<span class="icon">${Icons.copy}</span>
			Copy
		</div>
		<div class="context-menu-item" data-action="edit">
			<span class="icon">${Icons.edit}</span>
			Edit
		</div>
		<div class="context-menu-item" data-action="duplicate">
			<span class="icon">${Icons.copy}</span>
			Duplicate
		</div>
		<div class="context-menu-separator"></div>
		<div class="context-menu-item destructive" data-action="delete">
			<span class="icon">${Icons.delete}</span>
			Delete
		</div>
	</div>

	<!-- Hover tooltip -->
	<div class="prompt-tooltip" id="promptTooltip"></div>

	<!-- Toast notification -->
	<div class="toast" id="toast"></div>

	<script>
		const vscode = acquireVsCodeApi();

		// State
		let state = {
			data: { groups: [] },
			uiState: {
				selectedGroupId: null,
				searchQuery: '',
				scrollPosition: 0,
				showMarkdownPreview: false,
				collapsedGroupIds: [],
				groupsSidebarWidth: 220,
				groupsSidebarSize: 'md'
			},
			config: { showCopyNotification: true, confirmDelete: true, modalClickOutsideToClose: true },
			selectedPromptIndex: -1,
			editingPrompt: null,
			editingPromptGroupId: null,
			editingGroup: null,
			draggedPrompt: null,
			draggedPromptGroupId: null,
			draggedGroup: null
		};

		// Color map
		const colorMap = {
			red: 'var(--color-red)',
			orange: 'var(--color-orange)',
			yellow: 'var(--color-yellow)',
			green: 'var(--color-green)',
			blue: 'var(--color-blue)',
			purple: 'var(--color-purple)',
			pink: 'var(--color-pink)'
		};

		// DOM elements
		const elements = {
			searchInput: document.getElementById('searchInput'),
			addPromptBtn: document.getElementById('addPromptBtn'),
			promptList: document.getElementById('promptList'),
			emptyState: document.getElementById('emptyState'),
			emptyAddBtn: document.getElementById('emptyAddBtn'),
			groupsList: document.getElementById('groupsList'),
			addGroupBtn: document.getElementById('addGroupBtn'),
			promptModal: document.getElementById('promptModal'),
			promptModalTitle: document.getElementById('promptModalTitle'),
			promptModalClose: document.getElementById('promptModalClose'),
			promptModalPreview: document.getElementById('promptModalPreview'),
			promptGroup: document.getElementById('promptGroup'),
			promptTitle: document.getElementById('promptTitle'),
			promptContent: document.getElementById('promptContent'),
			promptPreview: document.getElementById('promptPreview'),
			fileMentionMenu: document.getElementById('fileMentionMenu'),
			attachedFiles: document.getElementById('attachedFiles'),
			promptModalDelete: document.getElementById('promptModalDelete'),
			promptModalCancel: document.getElementById('promptModalCancel'),
			promptModalSave: document.getElementById('promptModalSave'),
			groupModal: document.getElementById('groupModal'),
			groupModalTitle: document.getElementById('groupModalTitle'),
			groupModalClose: document.getElementById('groupModalClose'),
			groupName: document.getElementById('groupName'),
			colorPicker: document.getElementById('colorPicker'),
			groupModalDelete: document.getElementById('groupModalDelete'),
			groupModalCancel: document.getElementById('groupModalCancel'),
			groupModalSave: document.getElementById('groupModalSave'),
			contextMenu: document.getElementById('contextMenu'),
			promptTooltip: document.getElementById('promptTooltip'),
			toast: document.getElementById('toast'),
			importBtn: document.getElementById('importBtn'),
			exportBtn: document.getElementById('exportBtn'),
			groupsSidebar: document.getElementById('groupsSidebar'),
			sidebarResizer: document.getElementById('sidebarResizer'),
			sizeToggle: document.getElementById('sizeToggle')
		};

		const sidebarMinWidth = 180;
		const sidebarMaxWidth = 480;

		function applySidebarWidth(width) {
			if (!elements.groupsSidebar) return sidebarMinWidth;
			const clamped = Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, width));
			elements.groupsSidebar.style.width = clamped + 'px';
			return clamped;
		}

		function applyGroupSize(size) {
			if (!elements.groupsSidebar) return;
			elements.groupsSidebar.classList.remove('size-sm', 'size-md', 'size-lg', 'size-xl');
			elements.groupsSidebar.classList.add('size-' + size);
		}

		function updateSizeToggle() {
			const activeSize = state.uiState.groupsSidebarSize || 'md';
			if (!elements.sizeToggle) return;
			elements.sizeToggle.querySelectorAll('button').forEach(btn => {
				btn.classList.toggle('active', btn.dataset.size === activeSize);
			});
		}

		// Utility functions
		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function highlightText(text, query) {
			if (!query) return escapeHtml(text);
			const escapedText = escapeHtml(text);
			const escapedQuery = escapeHtml(query).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
			const regex = new RegExp(\`(\${escapedQuery})\`, 'gi');
			return escapedText.replace(regex, '<span class="highlight">$1</span>');
		}

		function simpleMarkdown(text) {
			return text
				.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
				.replace(/\`([^\`]+)\`/g, '<code>$1</code>')
				.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
				.replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
				.replace(/^- (.+)$/gm, '• $1')
				.replace(/^(#{1,3}) (.+)$/gm, (m, h, t) => '<strong>' + t + '</strong>')
				.replace(/\\n/g, '<br>');
		}

		// Get total prompt count
		function getTotalPromptCount() {
			let count = 0;
			function countPrompts(groups) {
				for (const group of groups) {
					count += group.prompts.length;
					countPrompts(group.children);
				}
			}
			countPrompts(state.data.groups);
			return count;
		}

		// Calculate preview lines based on prompt count
		function getPreviewLines() {
			const total = getTotalPromptCount();
			if (total <= 5) return 6;
			if (total <= 10) return 4;
			if (total <= 20) return 3;
			return 2;
		}

		// Flatten groups for display
		function flattenGroups(groups, depth = 0, result = []) {
			for (const group of groups) {
				result.push({ ...group, depth });
				const collapsed = state.uiState.collapsedGroupIds || [];
				if (!collapsed.includes(group.id)) {
					flattenGroups(group.children, depth + 1, result);
				}
			}
			return result;
		}

		// Get filtered prompts
		function getFilteredPrompts() {
			const { groups } = state.data;
			const { selectedGroupId, searchQuery } = state.uiState;
			const query = searchQuery.toLowerCase();
			const results = [];

			function collectPrompts(groupList, path = [], parentColor = null) {
				for (const group of groupList) {
					const currentPath = [...path, group.name];
					const groupColor = group.color || parentColor;
					const inSelectedGroup = !selectedGroupId ||
						group.id === selectedGroupId ||
						isDescendantOf(group.id, selectedGroupId);

					if (inSelectedGroup) {
						for (const prompt of group.prompts) {
							const matchesSearch = !query ||
								prompt.title.toLowerCase().includes(query) ||
								prompt.content.toLowerCase().includes(query);

							if (matchesSearch) {
								results.push({
									prompt,
									group,
									path: currentPath,
									color: groupColor
								});
							}
						}
					}
					collectPrompts(group.children, currentPath, groupColor);
				}
			}

			collectPrompts(groups);
			return results;
		}

		function isDescendantOf(groupId, parentId) {
			function check(groups) {
				for (const group of groups) {
					if (group.id === parentId) {
						return containsGroup(group.children, groupId);
					}
					if (check(group.children)) return true;
				}
				return false;
			}
			return check(state.data.groups);
		}

		function containsGroup(groups, groupId) {
			for (const group of groups) {
				if (group.id === groupId) return true;
				if (containsGroup(group.children, groupId)) return true;
			}
			return false;
		}

		function findGroup(groupId) {
			function search(groups) {
				for (const group of groups) {
					if (group.id === groupId) return group;
					const found = search(group.children);
					if (found) return found;
				}
				return null;
			}
			return search(state.data.groups);
		}

		function findPromptGroup(promptId) {
			function search(groups) {
				for (const group of groups) {
					if (group.prompts.some(p => p.id === promptId)) {
						return group;
					}
					const found = search(group.children);
					if (found) return found;
				}
				return null;
			}
			return search(state.data.groups);
		}

		// Render functions
		function render() {
			applySidebarWidth(state.uiState.groupsSidebarWidth || 220);
			applyGroupSize(state.uiState.groupsSidebarSize || 'md');
			updateSizeToggle();
			renderGroupsSidebar();
			renderPromptList();
		}

		function renderGroupsSidebar() {
			const flatGroups = flattenGroups(state.data.groups);
			let totalPrompts = getTotalPromptCount();

			let html = \`
				<div class="group-item all-prompts \${!state.uiState.selectedGroupId ? 'selected' : ''}" data-group-id="">
					<span class="group-name">All</span>
					<span class="group-count">\${totalPrompts}</span>
				</div>
			\`;

			for (const group of flatGroups) {
				const isSelected = group.id === state.uiState.selectedGroupId;
				const colorStyle = group.color ? \`background: \${colorMap[group.color]}\` : '';
				const indent = group.depth * 12;
				const hasChildren = group.children.length > 0;
				const isCollapsed = (state.uiState.collapsedGroupIds || []).includes(group.id);
				const chevronIcon = isCollapsed ? '${Icons.chevronRight}' : '${Icons.chevronDown}';
				
				const chevronStyle = \`
					width: 16px;
					height: 16px;
					margin-right: 4px;
					cursor: pointer;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					opacity: 0.7;
					visibility: \${hasChildren ? 'visible' : 'hidden'};
				\`;

				// Tree guides
				let guides = '';
				if (group.depth > 0) {
					// Add visual indicator for hierarchy
					guides = \`<span style="position: absolute; left: \${indent}px; top: 0; bottom: 0; width: 1px; border-left: 1px solid var(--vscode-tree-indentGuidesStroke); opacity: 0.4;"></span>\`;
					// Add L shape
					guides += \`<span style="position: absolute; left: \${indent}px; top: 50%; width: 8px; border-top: 1px solid var(--vscode-tree-indentGuidesStroke); opacity: 0.4;"></span>\`;
				}

				html += \`
					<div class="group-item \${isSelected ? 'selected' : ''}" data-group-id="\${group.id}" style="padding-left: \${16 + indent}px" draggable="true">
						\${guides}
						<div class="group-toggle" style="\${chevronStyle}">
							<span class="icon">\${chevronIcon}</span>
						</div>
						<div class="group-color-dot" style="\${colorStyle}"></div>
						<span class="group-name">\${escapeHtml(group.name)}</span>
						<div class="group-actions">
							<button class="btn btn-ghost btn-icon-sm edit-group-btn" title="Edit">
								<span class="icon">${Icons.edit}</span>
							</button>
						</div>
					</div>
				\`;
			}

			elements.groupsList.innerHTML = html;
		}

		function renderPromptList() {
			const prompts = getFilteredPrompts();
			const previewLines = getPreviewLines();

			if (prompts.length === 0) {
				elements.emptyState.style.display = 'flex';
				const items = elements.promptList.querySelectorAll('.prompt-item');
				items.forEach(item => item.remove());
				return;
			}

			elements.emptyState.style.display = 'none';

			let html = '';
			for (let i = 0; i < prompts.length; i++) {
				const { prompt, group, path, color } = prompts[i];
				const lines = prompt.content.split('\\n').slice(0, previewLines);
				const preview = lines.join('\\n');
				const isSelected = i === state.selectedPromptIndex;
				const colorStyle = color ? \`border-left-color: \${colorMap[color]}\` : '';
				// Apply highlighting
				const titleHtml = highlightText(prompt.title, state.uiState.searchQuery);
				const previewHtml = highlightText(preview, state.uiState.searchQuery);

				html += \`
					<div class="prompt-item \${isSelected ? 'selected' : ''}"
						 data-prompt-id="\${prompt.id}"
						 data-group-id="\${group.id}"
						 data-index="\${i}"
						 style="\${colorStyle}"
						 draggable="true"
						 tabindex="0">
						<div class="drag-handle" title="Drag to reorder">
							<span class="icon">${Icons.drag}</span>
						</div>
						<div class="prompt-item-content">
							<div class="prompt-title">
								<span class="prompt-title-text">\${titleHtml}</span>
								\${!state.uiState.selectedGroupId ? \`<span class="prompt-group-badge" style="\${color ? 'background:' + colorMap[color] : ''}">\${escapeHtml(path[path.length - 1])}</span>\` : ''}
							</div>
							<div class="prompt-preview">\${previewHtml}</div>
						</div>
						<button class="prompt-copy-btn copy-btn" title="Copy to clipboard">
							<span class="icon">${Icons.copy}</span>
							Copy
						</button>
						<div class="prompt-item-actions">
							<button class="btn btn-ghost btn-icon-sm edit-btn" title="Edit">
								<span class="icon">${Icons.edit}</span>
							</button>
							<button class="btn btn-ghost btn-icon-sm delete-btn" title="Delete">
								<span class="icon">${Icons.delete}</span>
							</button>
						</div>
					</div>
				\`;
			}

			const emptyState = elements.emptyState;
			elements.promptList.innerHTML = html;
			elements.promptList.appendChild(emptyState);
		}

		// Toast notification
		function showToast(message, duration = 2000) {
			elements.toast.textContent = message;
			elements.toast.classList.add('visible');
			setTimeout(() => {
				elements.toast.classList.remove('visible');
			}, duration);
		}

		// Prompt Modal
		let promptModalInitialState = { title: '', content: '' };
		let promptModalPreviewMode = false;

		function updatePromptPreview() {
			if (promptModalPreviewMode) {
				const content = elements.promptContent.value;
				elements.promptPreview.innerHTML = simpleMarkdown(escapeHtml(content));
				elements.promptContent.style.display = 'none';
				elements.promptPreview.style.display = 'block';
				hideMentionMenu();
				elements.promptModalPreview.classList.add('active');
			} else {
				elements.promptContent.style.display = 'block';
				elements.promptPreview.style.display = 'none';
				elements.promptModalPreview.classList.remove('active');
			}
		}

		// File mention autocomplete
		let mentionState = {
			active: false,
			query: '',
			startIndex: -1,
			selectedIndex: 0,
			results: []
		};
		let mentionSearchTimeout = null;

		function getMentionContext(text, cursorIndex) {
			const before = text.slice(0, cursorIndex);
			const atIndex = before.lastIndexOf('@');
			if (atIndex === -1) return null;
			// Check that @ is at start or after whitespace
			const prevChar = atIndex > 0 ? before[atIndex - 1] : '';
			if (prevChar && !/[\\s\\n\\r]/.test(prevChar)) return null;
			// Extract query (text after @)
			const query = before.slice(atIndex + 1);
			// If query contains whitespace, mention is complete
			if (/[\\s\\n\\r]/.test(query)) return null;
			return { query, startIndex: atIndex };
		}

		function showMentionMenu(results, selectedIndex = 0) {
			if (!elements.fileMentionMenu) return;
			mentionState.results = results;
			mentionState.selectedIndex = Math.max(0, Math.min(selectedIndex, results.length - 1));

			if (!results.length) {
				elements.fileMentionMenu.innerHTML = '<div class="file-mention-empty">No files found</div>';
				elements.fileMentionMenu.classList.add('visible');
				return;
			}

			elements.fileMentionMenu.innerHTML = results
				.map((filePath, index) => {
					const fileName = filePath.split('/').pop();
					const dirPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
					const activeClass = index === mentionState.selectedIndex ? 'active' : '';
					return '<div class="file-mention-item ' + activeClass + '" data-index="' + index + '" data-path="' + escapeHtml(filePath) + '">' +
						'<span class="file-icon">\u{1F4C4}</span>' +
						'<span class="file-name">' + escapeHtml(fileName) + '</span>' +
						(dirPath ? '<span class="file-path">' + escapeHtml(dirPath) + '</span>' : '') +
						'</div>';
				})
				.join('');
			elements.fileMentionMenu.classList.add('visible');
		}

		function hideMentionMenu() {
			if (!elements.fileMentionMenu) return;
			mentionState.active = false;
			mentionState.query = '';
			mentionState.startIndex = -1;
			mentionState.results = [];
			mentionState.selectedIndex = 0;
			elements.fileMentionMenu.classList.remove('visible');
			elements.fileMentionMenu.innerHTML = '';
			if (mentionSearchTimeout) {
				clearTimeout(mentionSearchTimeout);
				mentionSearchTimeout = null;
			}
		}

		function updateAttachedFiles() {
			if (!elements.attachedFiles || !elements.promptContent) return;

			const content = elements.promptContent.value;
			// Match @filepath patterns (filepath can contain letters, numbers, /, ., -, _)
			const mentionRegex = /@([a-zA-Z0-9_\\-\\.\\/]+)/g;
			const mentions = [];
			let match;
			while ((match = mentionRegex.exec(content)) !== null) {
				mentions.push(match[1]);
			}

			if (mentions.length === 0) {
				elements.attachedFiles.innerHTML = '';
				return;
			}

			elements.attachedFiles.innerHTML = mentions.map(filePath => {
				const fileName = filePath.split('/').pop() || filePath;
				return \`<span class="file-chip" data-path="\${filePath}">
					<span class="file-chip-icon">${Icons.folder.replace(/"/g, "'")}</span>
					<span class="file-chip-name" title="\${filePath}">\${fileName}</span>
					<button class="file-chip-remove" title="Remove">
						${Icons.close.replace(/"/g, "'")}
					</button>
				</span>\`;
			}).join('');
		}

		function removeFileMention(filePath) {
			if (!elements.promptContent) return;
			let content = elements.promptContent.value;
			// Remove @filepath with or without trailing space (simple string replace)
			content = content.split('@' + filePath + ' ').join('');
			content = content.split('@' + filePath).join('');
			elements.promptContent.value = content;
			updateAttachedFiles();
		}

		function insertMention(filePath) {
			if (!elements.promptContent) return;
			const textarea = elements.promptContent;
			const text = textarea.value;
			const cursorIndex = textarea.selectionStart;
			const startIndex = mentionState.startIndex;
			if (startIndex === -1) return;

			const before = text.slice(0, startIndex);
			const after = text.slice(cursorIndex);
			const insertion = '@' + filePath + ' ';
			const newValue = before + insertion + after;
			textarea.value = newValue;

			const newCursor = before.length + insertion.length;
			textarea.setSelectionRange(newCursor, newCursor);
			textarea.focus();
			hideMentionMenu();
		}

		function requestMentionResults(query) {
			if (mentionSearchTimeout) {
				clearTimeout(mentionSearchTimeout);
			}
			mentionSearchTimeout = setTimeout(() => {
				vscode.postMessage({ type: 'fileSearch', query });
			}, 100);
		}

		function populateGroupSelect(selectedGroupId) {
			elements.promptGroup.innerHTML = '';
			const flatGroups = flattenGroups(state.data.groups);
			
			// Add "My Prompts" (root) if no groups exist, or just let user create one?
			// Actually, if groups exist, we should list them.
			
			for (const group of flatGroups) {
				const option = document.createElement('option');
				option.value = group.id;
				// Indent name based on depth
				const prefix = '\u00A0\u00A0'.repeat(group.depth);
				option.textContent = prefix + group.name;
				if (group.id === selectedGroupId) {
					option.selected = true;
				}
				elements.promptGroup.appendChild(option);
			}
		}

		function openPromptModal(prompt = null, groupId = null) {
			state.editingPrompt = prompt;
			state.editingPromptGroupId = groupId;
			elements.promptModalTitle.textContent = prompt ? 'Edit Prompt' : 'New Prompt';
			elements.promptTitle.value = prompt ? prompt.title : '';
			elements.promptContent.value = prompt ? prompt.content : '';
			elements.promptModalDelete.style.display = prompt ? '' : 'none';

			// Populate group select
			// If creating new, use selectedGroupId from state if available, otherwise first group
			let targetGroupId = groupId;
			if (!targetGroupId) {
				targetGroupId = state.uiState.selectedGroupId;
			// If "All" is selected (null), default to first group
				if (!targetGroupId && state.data.groups.length > 0) {
					targetGroupId = state.data.groups[0].id;
				}
			}
			populateGroupSelect(targetGroupId);

			// Reset preview mode and mention menu
			promptModalPreviewMode = false;
			updatePromptPreview();
			hideMentionMenu();
			updateAttachedFiles();

			// Store initial state for change detection
			promptModalInitialState = {
				title: elements.promptTitle.value,
				content: elements.promptContent.value,
				groupId: elements.promptGroup.value
			};

			elements.promptModal.classList.add('visible');
			elements.promptTitle.focus();
		}

		function hasPromptModalChanges() {
			return elements.promptTitle.value !== promptModalInitialState.title ||
				   elements.promptContent.value !== promptModalInitialState.content ||
				   elements.promptGroup.value !== promptModalInitialState.groupId;
		}

		function closePromptModal(force = false) {
			if (!force && hasPromptModalChanges()) {
				const choice = confirm('You have unsaved changes. Discard changes?');
				if (!choice) return;
			}
			elements.promptModal.classList.remove('visible');
			state.editingPrompt = null;
			state.editingPromptGroupId = null;
			hideMentionMenu();
		}

		// Group Modal
		let groupModalInitialState = { name: '', color: '' };

		function openGroupModal(group = null) {
			state.editingGroup = group;
			elements.groupModalTitle.textContent = group ? 'Edit Group' : 'New Group';
			elements.groupName.value = group ? group.name : '';
			elements.groupModalDelete.style.display = group ? '' : 'none';

			// Set color selection
			const colorOptions = elements.colorPicker.querySelectorAll('.color-option');
			colorOptions.forEach(opt => {
				opt.classList.toggle('selected', opt.dataset.color === (group?.color || ''));
			});

			// Store initial state for change detection
			groupModalInitialState = {
				name: elements.groupName.value,
				color: group?.color || ''
			};

			elements.groupModal.classList.add('visible');
			elements.groupName.focus();
		}

		function getSelectedGroupColor() {
			const selected = elements.colorPicker.querySelector('.color-option.selected');
			return selected?.dataset.color || '';
		}

		function hasGroupModalChanges() {
			return elements.groupName.value !== groupModalInitialState.name ||
				   getSelectedGroupColor() !== groupModalInitialState.color;
		}

		function closeGroupModal(force = false) {
			if (!force && hasGroupModalChanges()) {
				const choice = confirm('You have unsaved changes. Discard changes?');
				if (!choice) return;
			}
			elements.groupModal.classList.remove('visible');
			state.editingGroup = null;
		}

		// Context menu
		let contextMenuPrompt = null;

		function showContextMenu(e, promptId, groupId) {
			e.preventDefault();
			contextMenuPrompt = { promptId, groupId };

			const menu = elements.contextMenu;
			menu.style.left = e.clientX + 'px';
			menu.style.top = e.clientY + 'px';
			menu.classList.add('visible');

			const rect = menu.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				menu.style.left = (e.clientX - rect.width) + 'px';
			}
			if (rect.bottom > window.innerHeight) {
				menu.style.top = (e.clientY - rect.height) + 'px';
			}
		}

		function hideContextMenu() {
			elements.contextMenu.classList.remove('visible');
			contextMenuPrompt = null;
		}

		// Tooltip
		let tooltipTimeout = null;

		function showTooltip(e, content) {
			clearTimeout(tooltipTimeout);
			tooltipTimeout = setTimeout(() => {
				elements.promptTooltip.textContent = content;
				elements.promptTooltip.style.left = Math.min(e.clientX + 10, window.innerWidth - 520) + 'px';
				elements.promptTooltip.style.top = Math.min(e.clientY + 10, window.innerHeight - 420) + 'px';
				elements.promptTooltip.classList.add('visible');
			}, 500);
		}

		function hideTooltip() {
			clearTimeout(tooltipTimeout);
			elements.promptTooltip.classList.remove('visible');
		}

		// Event listeners
		elements.searchInput.addEventListener('input', (e) => {
			state.uiState.searchQuery = e.target.value;
			state.selectedPromptIndex = -1;
			vscode.postMessage({ type: 'updateUIState', state: { searchQuery: e.target.value } });
			render();
		});

		elements.addPromptBtn.addEventListener('click', () => openPromptModal());
		elements.emptyAddBtn.addEventListener('click', () => openPromptModal());
		elements.addGroupBtn.addEventListener('click', () => openGroupModal());

		// Prompt modal events
		elements.promptModalClose.addEventListener('click', closePromptModal);
		elements.promptModalCancel.addEventListener('click', closePromptModal);

		elements.promptModalPreview.addEventListener('click', () => {
			promptModalPreviewMode = !promptModalPreviewMode;
			updatePromptPreview();
		});

		// File mention autocomplete event listeners
		if (elements.promptContent) {
			elements.promptContent.addEventListener('input', (e) => {
				if (promptModalPreviewMode) return;
				const text = e.target.value;
				const cursorIndex = e.target.selectionStart;
				const context = getMentionContext(text, cursorIndex);

				// Update attached files chips
				updateAttachedFiles();

				if (!context) {
					hideMentionMenu();
					return;
				}

				mentionState.active = true;
				mentionState.query = context.query;
				mentionState.startIndex = context.startIndex;
				requestMentionResults(context.query);
			});

			elements.promptContent.addEventListener('keydown', (e) => {
				if (!mentionState.active || !mentionState.results.length) return;

				if (e.key === 'ArrowDown') {
					e.preventDefault();
					mentionState.selectedIndex = Math.min(mentionState.selectedIndex + 1, mentionState.results.length - 1);
					showMentionMenu(mentionState.results, mentionState.selectedIndex);
					return;
				}

				if (e.key === 'ArrowUp') {
					e.preventDefault();
					mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0);
					showMentionMenu(mentionState.results, mentionState.selectedIndex);
					return;
				}

				if (e.key === 'Enter' && mentionState.active && mentionState.results.length) {
					e.preventDefault();
					const selected = mentionState.results[mentionState.selectedIndex];
					if (selected) {
						insertMention(selected);
					}
					return;
				}

				if (e.key === 'Escape') {
					hideMentionMenu();
				}
			});

			elements.promptContent.addEventListener('blur', () => {
				// Delay hiding to allow click on menu items
				setTimeout(() => {
					if (!elements.fileMentionMenu?.matches(':hover')) {
						hideMentionMenu();
					}
				}, 150);
			});

			// Drag and drop file references
			elements.promptContent.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				elements.promptContent.classList.add('drag-over');
			});

			elements.promptContent.addEventListener('dragleave', (e) => {
				e.preventDefault();
				elements.promptContent.classList.remove('drag-over');
			});

			elements.promptContent.addEventListener('drop', (e) => {
				e.preventDefault();
				elements.promptContent.classList.remove('drag-over');

				// Get URIs from drag data
				const uriList = e.dataTransfer.getData('text/uri-list');
				if (uriList) {
					const uris = uriList.split('\\n').filter(u => u && !u.startsWith('#'));
					if (uris.length > 0) {
						vscode.postMessage({ type: 'resolveUris', uris });
					}
				}
			});
		}

		if (elements.fileMentionMenu) {
			elements.fileMentionMenu.addEventListener('mousedown', (e) => {
				const item = e.target.closest('.file-mention-item');
				if (!item) return;
				e.preventDefault();
				const filePath = item.dataset.path;
				if (filePath) {
					insertMention(filePath);
				}
			});
		}

		if (elements.attachedFiles) {
			elements.attachedFiles.addEventListener('click', (e) => {
				const removeBtn = e.target.closest('.file-chip-remove');
				if (!removeBtn) return;
				const chip = removeBtn.closest('.file-chip');
				if (chip && chip.dataset.path) {
					removeFileMention(chip.dataset.path);
				}
			});
		}

		elements.promptModalSave.addEventListener('click', () => {
			const title = elements.promptTitle.value.trim();
			const content = elements.promptContent.value;
			const selectedGroupId = elements.promptGroup.value;

			if (!title) {
				elements.promptTitle.focus();
				return;
			}

			if (!selectedGroupId) {
				// Should not happen if groups exist, but handle it
				vscode.postMessage({ type: 'createGroup', name: 'My Prompts' });
				state.pendingPrompt = { title, content };
				closePromptModal(true);
				return;
			}

			if (state.editingPrompt) {
				// Check if group changed
				if (selectedGroupId !== state.editingPromptGroupId) {
					vscode.postMessage({
						type: 'movePrompt',
						promptId: state.editingPrompt.id,
						fromGroupId: state.editingPromptGroupId,
						toGroupId: selectedGroupId
					});
				}

				vscode.postMessage({
					type: 'updatePrompt',
					groupId: selectedGroupId, // Use new group ID
					promptId: state.editingPrompt.id,
					title,
					content
				});
			} else {
				vscode.postMessage({ type: 'createPrompt', groupId: selectedGroupId, title, content });
			}
			closePromptModal(true);
		});

		elements.promptModalDelete.addEventListener('click', () => {
			if (state.editingPrompt && state.editingPromptGroupId) {
				if (!state.config.confirmDelete || confirm('Delete this prompt?')) {
					vscode.postMessage({
						type: 'deletePrompt',
						groupId: state.editingPromptGroupId,
						promptId: state.editingPrompt.id
					});
					closePromptModal(true);
				}
			}
		});

		// Group modal events
		elements.groupModalClose.addEventListener('click', closeGroupModal);
		elements.groupModalCancel.addEventListener('click', closeGroupModal);

		elements.colorPicker.addEventListener('click', (e) => {
			const colorOption = e.target.closest('.color-option');
			if (colorOption) {
				elements.colorPicker.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
				colorOption.classList.add('selected');
			}
		});

		elements.groupModalSave.addEventListener('click', () => {
			const name = elements.groupName.value.trim();
			if (!name) {
				elements.groupName.focus();
				return;
			}

			const selectedColor = elements.colorPicker.querySelector('.color-option.selected');
			const color = selectedColor?.dataset.color || null;

			if (state.editingGroup) {
				vscode.postMessage({
					type: 'updateGroup',
					groupId: state.editingGroup.id,
					name,
					color
				});
			} else {
				vscode.postMessage({ type: 'createGroup', name, color });
			}
			closeGroupModal(true);
		});

		elements.groupModalDelete.addEventListener('click', () => {
			if (state.editingGroup) {
				vscode.postMessage({ type: 'deleteGroup', groupId: state.editingGroup.id });
				if (state.uiState.selectedGroupId === state.editingGroup.id) {
					state.uiState.selectedGroupId = null;
					vscode.postMessage({ type: 'selectGroup', groupId: null });
				}
				closeGroupModal(true);
			}
		});

		// Close modals on overlay click (if enabled in settings)
		elements.promptModal.addEventListener('mousedown', (e) => {
			if (e.target === elements.promptModal && state.config.modalClickOutsideToClose) {
				// Check if it's a click (mouseup follows mousedown on same element)
				const mouseUpHandler = (upEvent) => {
					if (upEvent.target === elements.promptModal) {
						closePromptModal();
					}
					elements.promptModal.removeEventListener('mouseup', mouseUpHandler);
				};
				elements.promptModal.addEventListener('mouseup', mouseUpHandler);
			}
		});
		
		elements.groupModal.addEventListener('mousedown', (e) => {
			if (e.target === elements.groupModal) {
				const mouseUpHandler = (upEvent) => {
					if (upEvent.target === elements.groupModal) {
						closeGroupModal();
					}
					elements.groupModal.removeEventListener('mouseup', mouseUpHandler);
				};
				elements.groupModal.addEventListener('mouseup', mouseUpHandler);
			}
		});

		// Groups sidebar events
		elements.groupsList.addEventListener('click', (e) => {
			const toggleBtn = e.target.closest('.group-toggle');
			const groupItem = e.target.closest('.group-item');

			if (toggleBtn && groupItem) {
				e.stopPropagation();
				const groupId = groupItem.dataset.groupId;
				const collapsed = state.uiState.collapsedGroupIds || [];
				const index = collapsed.indexOf(groupId);
				
				if (index === -1) {
					collapsed.push(groupId);
				} else {
					collapsed.splice(index, 1);
				}
				
				state.uiState.collapsedGroupIds = collapsed;
				vscode.postMessage({ type: 'updateUIState', state: { collapsedGroupIds: collapsed } });
				render();
				return;
			}

			const editBtn = e.target.closest('.edit-group-btn');

			if (editBtn && groupItem) {
				e.stopPropagation();
				const groupId = groupItem.dataset.groupId;
				if (groupId) {
					const group = findGroup(groupId);
					if (group) openGroupModal(group);
				}
				return;
			}

			if (groupItem) {
				const groupId = groupItem.dataset.groupId || null;
				state.uiState.selectedGroupId = groupId;
				state.selectedPromptIndex = -1;
				vscode.postMessage({ type: 'selectGroup', groupId });
				render();
			}
		});

		// Sidebar resize
		let isResizingSidebar = false;

		if (elements.sidebarResizer) {
			elements.sidebarResizer.addEventListener('mousedown', (e) => {
				isResizingSidebar = true;
				elements.sidebarResizer.classList.add('dragging');
				document.body.style.cursor = 'col-resize';
				e.preventDefault();
			});
		}

		window.addEventListener('mousemove', (e) => {
			if (!isResizingSidebar) return;
			const width = window.innerWidth - e.clientX;
			const clamped = applySidebarWidth(width);
			state.uiState.groupsSidebarWidth = clamped;
			vscode.postMessage({ type: 'updateUIState', state: { groupsSidebarWidth: clamped } });
		});

		window.addEventListener('mouseup', () => {
			if (!isResizingSidebar) return;
			isResizingSidebar = false;
			if (elements.sidebarResizer) {
				elements.sidebarResizer.classList.remove('dragging');
			}
			document.body.style.cursor = '';
		});

		// Sidebar size options
		if (elements.sizeToggle) {
			elements.sizeToggle.addEventListener('click', (e) => {
				const button = e.target.closest('button');
				if (!button) return;
				const size = button.dataset.size;
				if (!size) return;
				state.uiState.groupsSidebarSize = size;
				applyGroupSize(size);
				vscode.postMessage({ type: 'updateUIState', state: { groupsSidebarSize: size } });
				updateSizeToggle();
			});
		}

		// Groups sidebar drag & drop
		elements.groupsList.addEventListener('dragstart', (e) => {
			const groupItem = e.target.closest('.group-item');
			if (groupItem && !groupItem.classList.contains('all-prompts')) {
				state.draggedGroup = groupItem.dataset.groupId;
				e.dataTransfer.effectAllowed = 'move';
				e.stopPropagation();
			}
		});

		elements.groupsList.addEventListener('dragover', (e) => {
			e.preventDefault();
			const groupItem = e.target.closest('.group-item');
			if (!groupItem || groupItem.classList.contains('all-prompts')) return;

			// Clear previous
			document.querySelectorAll('.group-item.drag-over-top, .group-item.drag-over-bottom, .group-item.drag-over-center').forEach(el => {
				el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
			});

			if (state.draggedPrompt) {
				// Dragging prompt -> only center (nest)
				groupItem.classList.add('drag-over-center');
			} else if (state.draggedGroup) {
				// Dragging group -> check position
				if (state.draggedGroup === groupItem.dataset.groupId) return; // Can't drop on self
				if (isDescendantOf(groupItem.dataset.groupId, state.draggedGroup)) return; // Can't drop on descendant

				const rect = groupItem.getBoundingClientRect();
				const y = e.clientY - rect.top;
				const height = rect.height;
				
				if (y < height * 0.25) {
					groupItem.classList.add('drag-over-top');
				} else if (y > height * 0.75) {
					groupItem.classList.add('drag-over-bottom');
				} else {
					groupItem.classList.add('drag-over-center');
				}
			}
		});

		elements.groupsList.addEventListener('dragleave', (e) => {
			const groupItem = e.target.closest('.group-item');
			if (groupItem) {
				groupItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
			}
		});

		elements.groupsList.addEventListener('drop', (e) => {
			e.preventDefault();
			document.querySelectorAll('.group-item.drag-over-top, .group-item.drag-over-bottom, .group-item.drag-over-center').forEach(el => {
				el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
			});

			const groupItem = e.target.closest('.group-item');
			if (!groupItem || groupItem.classList.contains('all-prompts')) return;

			const targetGroupId = groupItem.dataset.groupId;

			if (state.draggedPrompt) {
				if (targetGroupId !== state.draggedPromptGroupId) {
					vscode.postMessage({
						type: 'movePrompt',
						promptId: state.draggedPrompt,
						fromGroupId: state.draggedPromptGroupId,
						toGroupId: targetGroupId
					});
				}
			} else if (state.draggedGroup) {
				if (state.draggedGroup === targetGroupId) return;
				if (isDescendantOf(targetGroupId, state.draggedGroup)) return;

				const rect = groupItem.getBoundingClientRect();
				const y = e.clientY - rect.top;
				const height = rect.height;
				
				let moveType = 'center'; // nest
				if (y < height * 0.25) moveType = 'top';
				else if (y > height * 0.75) moveType = 'bottom';

				if (moveType === 'center') {
					vscode.postMessage({
						type: 'moveGroup',
						groupId: state.draggedGroup,
						targetGroupId: targetGroupId
					});
				} else {
					// Find parent of target
					const findParent = (groups, id, parentId = null) => {
						for (let i = 0; i < groups.length; i++) {
							if (groups[i].id === id) return { parentId, index: i, group: groups[i] };
							const found = findParent(groups[i].children, id, groups[i].id);
							if (found) return found;
						}
						return null;
					};
					
					const targetInfo = findParent(state.data.groups, targetGroupId);
					if (targetInfo) {
						let newIndex = targetInfo.index;
						if (moveType === 'bottom') newIndex++;
						
						vscode.postMessage({
							type: 'moveGroup',
							groupId: state.draggedGroup,
							targetGroupId: targetInfo.parentId,
							newIndex
						});
					}
				}
			}
			
			state.draggedGroup = null;
		});

		// Prompt list events
		elements.promptList.addEventListener('click', (e) => {
			const copyBtn = e.target.closest('.copy-btn');
			const editBtn = e.target.closest('.edit-btn');
			const deleteBtn = e.target.closest('.delete-btn');
			const promptItem = e.target.closest('.prompt-item');

			if (!promptItem) return;

			const promptId = promptItem.dataset.promptId;
			const groupId = promptItem.dataset.groupId;

			if (copyBtn) {
				e.stopPropagation();
				vscode.postMessage({ type: 'copy', promptId });
				return;
			}

			if (editBtn) {
				e.stopPropagation();
				const prompts = getFilteredPrompts();
				const item = prompts.find(p => p.prompt.id === promptId);
				if (item) openPromptModal(item.prompt, groupId);
				return;
			}

			if (deleteBtn) {
				e.stopPropagation();
				vscode.postMessage({ type: 'deletePrompt', groupId, promptId });
				return;
			}

			// Click on content area - select
			const index = parseInt(promptItem.dataset.index);
			state.selectedPromptIndex = index;
			
			// Update selection visually without full re-render to preserve DOM for dblclick
			document.querySelectorAll('.prompt-item.selected').forEach(el => el.classList.remove('selected'));
			promptItem.classList.add('selected');
		});

		elements.promptList.addEventListener('dblclick', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem && !e.target.closest('.prompt-item-actions') && !e.target.closest('.drag-handle')) {
				const promptId = promptItem.dataset.promptId;
				const groupId = promptItem.dataset.groupId;
				const prompts = getFilteredPrompts();
				const item = prompts.find(p => p.prompt.id === promptId);
				if (item) openPromptModal(item.prompt, groupId);
			}
		});

		elements.promptList.addEventListener('contextmenu', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem) {
				showContextMenu(e, promptItem.dataset.promptId, promptItem.dataset.groupId);
			}
		});

		// Hover tooltip
		elements.promptList.addEventListener('mouseover', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem && !e.target.closest('.prompt-item-actions') && !e.target.closest('.drag-handle')) {
				const prompts = getFilteredPrompts();
				const item = prompts.find(p => p.prompt.id === promptItem.dataset.promptId);
				if (item) {
					showTooltip(e, item.prompt.content);
				}
			}
		});

		elements.promptList.addEventListener('mouseout', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem) {
				hideTooltip();
			}
		});

		// Drag and drop
		elements.promptList.addEventListener('dragstart', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem) {
				state.draggedPrompt = promptItem.dataset.promptId;
				state.draggedPromptGroupId = promptItem.dataset.groupId;
				promptItem.classList.add('dragging');
				e.dataTransfer.effectAllowed = 'move';
			}
		});

		elements.promptList.addEventListener('dragend', (e) => {
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem) {
				promptItem.classList.remove('dragging');
			}
			state.draggedPrompt = null;
			state.draggedPromptGroupId = null;
			document.querySelectorAll('.prompt-item.drag-over').forEach(el => el.classList.remove('drag-over'));
		});

		elements.promptList.addEventListener('dragover', (e) => {
			e.preventDefault();
			const promptItem = e.target.closest('.prompt-item');
			if (promptItem && promptItem.dataset.promptId !== state.draggedPrompt) {
				document.querySelectorAll('.prompt-item.drag-over').forEach(el => el.classList.remove('drag-over'));
				promptItem.classList.add('drag-over');
			}
		});

		elements.promptList.addEventListener('drop', (e) => {
			e.preventDefault();
			const targetItem = e.target.closest('.prompt-item');
			if (targetItem && state.draggedPrompt) {
				const targetGroupId = targetItem.dataset.groupId;
				const targetIndex = parseInt(targetItem.dataset.index);

				if (state.draggedPromptGroupId === targetGroupId) {
					// Reorder within same group
					vscode.postMessage({
						type: 'reorderPrompt',
						groupId: targetGroupId,
						promptId: state.draggedPrompt,
						newIndex: targetIndex
					});
				} else {
					// Move to different group
					vscode.postMessage({
						type: 'movePrompt',
						promptId: state.draggedPrompt,
						fromGroupId: state.draggedPromptGroupId,
						toGroupId: targetGroupId,
						newIndex: targetIndex
					});
				}
			}
			document.querySelectorAll('.prompt-item.drag-over').forEach(el => el.classList.remove('drag-over'));
		});

		// Context menu actions
		elements.contextMenu.addEventListener('click', (e) => {
			const menuItem = e.target.closest('.context-menu-item');
			if (!menuItem || !contextMenuPrompt) return;

			const action = menuItem.dataset.action;
			const { promptId, groupId } = contextMenuPrompt;

			switch (action) {
				case 'copy':
					vscode.postMessage({ type: 'copy', promptId });
					break;
				case 'edit': {
					const prompts = getFilteredPrompts();
					const item = prompts.find(p => p.prompt.id === promptId);
					if (item) openPromptModal(item.prompt, groupId);
					break;
				}
				case 'duplicate': {
					const prompts = getFilteredPrompts();
					const item = prompts.find(p => p.prompt.id === promptId);
					if (item) {
						vscode.postMessage({
							type: 'createPrompt',
							groupId,
							title: item.prompt.title + ' (Copy)',
							content: item.prompt.content
						});
					}
					break;
				}
				case 'delete':
					vscode.postMessage({ type: 'deletePrompt', groupId, promptId });
					break;
			}
			hideContextMenu();
		});

		// Hide context menu on click outside
		document.addEventListener('click', (e) => {
			if (!elements.contextMenu.contains(e.target)) {
				hideContextMenu();
			}
		});

		// Import/Export
		elements.importBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'import' });
		});

		elements.exportBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'export' });
		});

		// Keyboard navigation
		document.addEventListener('keydown', (e) => {
			if (elements.promptModal.classList.contains('visible') ||
				elements.groupModal.classList.contains('visible')) {
				if (e.key === 'Escape') {
					closePromptModal();
					closeGroupModal();
				}
				return;
			}

			const prompts = getFilteredPrompts();

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					if (state.selectedPromptIndex < prompts.length - 1) {
						state.selectedPromptIndex++;
						render();
						scrollToSelected();
					}
					break;

				case 'ArrowUp':
					e.preventDefault();
					if (state.selectedPromptIndex > 0) {
						state.selectedPromptIndex--;
						render();
						scrollToSelected();
					}
					break;

				case 'Enter':
					if (state.selectedPromptIndex >= 0 && state.selectedPromptIndex < prompts.length) {
						const { prompt } = prompts[state.selectedPromptIndex];
						vscode.postMessage({ type: 'copy', promptId: prompt.id });
					}
					break;

				case 'Escape':
					if (state.uiState.searchQuery) {
						elements.searchInput.value = '';
						state.uiState.searchQuery = '';
						vscode.postMessage({ type: 'updateUIState', state: { searchQuery: '' } });
						render();
					}
					break;

				case 'f':
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						elements.searchInput.focus();
						elements.searchInput.select();
					}
					break;

				case 'n':
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						openPromptModal();
					}
					break;
			}
		});

		function scrollToSelected() {
			const selected = elements.promptList.querySelector('.prompt-item.selected');
			if (selected) {
				selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}

		// Message handling from extension
		window.addEventListener('message', (event) => {
			const message = event.data;

			switch (message.type) {
				case 'state':
					state.data = message.data;
					state.uiState = { ...state.uiState, ...message.uiState };
					state.config = message.config || state.config;

					// Validate selectedGroupId - reset to All if group doesn't exist
					if (state.uiState.selectedGroupId) {
						const groupExists = findGroup(state.uiState.selectedGroupId);
						if (!groupExists) {
							state.uiState.selectedGroupId = null;
							vscode.postMessage({ type: 'selectGroup', groupId: null });
						}
					}

					elements.searchInput.value = state.uiState.searchQuery || '';

					if (state.pendingPrompt && state.data.groups.length > 0) {
						const groupId = state.data.groups[0].id;
						vscode.postMessage({
							type: 'createPrompt',
							groupId,
							title: state.pendingPrompt.title,
							content: state.pendingPrompt.content
						});
						state.pendingPrompt = null;
					}

					render();
					break;

				case 'copied':
					if (message.showNotification) {
						showToast(\`Copied: \${message.title}\`);
					}
					break;

				case 'error':
					showToast(\`Error: \${message.message}\`, 4000);
					break;

				case 'fileSearchResults':
					if (mentionState.active && message.query === mentionState.query) {
						showMentionMenu(message.results);
					}
					break;

				case 'resolvedPaths':
					if (message.paths.length > 0 && elements.promptContent) {
						const textarea = elements.promptContent;
						const cursorPos = textarea.selectionStart;
						const text = textarea.value;
						const before = text.slice(0, cursorPos);
						const after = text.slice(cursorPos);

						// Insert each path as @reference with newlines between multiple
						const insertion = message.paths.map(p => '@' + p).join(' ') + ' ';
						textarea.value = before + insertion + after;

						const newCursor = cursorPos + insertion.length;
						textarea.setSelectionRange(newCursor, newCursor);
						textarea.focus();
					}
					break;
			}
		});

		// Initialize
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
