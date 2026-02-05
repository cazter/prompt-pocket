import * as vscode from 'vscode';
import * as path from 'path';
import { PromptGroup, TreeNode, isPromptGroup, isPromptItem } from './types';
import { StorageService } from './storage';

export interface TreeNodeWithParent {
	node: TreeNode;
	parentGroup?: PromptGroup;
}

export class PromptTreeItem extends vscode.TreeItem {
	constructor(
		public readonly node: TreeNode,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly parentGroup?: PromptGroup,
		extensionPath?: string
	) {
		super(
			isPromptGroup(node) ? node.name : node.title,
			collapsibleState
		);

		if (isPromptItem(node)) {
			this.tooltip = node.content;
			this.description = this.truncateContent(node.content, 50);
			this.contextValue = 'prompt-item';
			if (extensionPath) {
				this.iconPath = {
					light: vscode.Uri.file(path.join(extensionPath, 'resources', 'prompt-light.svg')),
					dark: vscode.Uri.file(path.join(extensionPath, 'resources', 'prompt-dark.svg'))
				};
			} else {
				this.iconPath = new vscode.ThemeIcon('note');
			}
			this.command = {
				command: 'prompt-pocket.copyPrompt',
				title: 'Copy Prompt',
				arguments: [node]
			};
		} else {
			this.contextValue = 'prompt-group';
			if (extensionPath) {
				this.iconPath = {
					light: vscode.Uri.file(path.join(extensionPath, 'resources', 'folder-light.svg')),
					dark: vscode.Uri.file(path.join(extensionPath, 'resources', 'folder-dark.svg'))
				};
			} else {
				this.iconPath = new vscode.ThemeIcon('folder');
			}
		}
	}

	private truncateContent(content: string, maxLength: number): string {
		if (content.length <= maxLength) {
			return content;
		}
		return content.substring(0, maxLength) + '...';
	}
}

export class PromptTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

	private nodeToGroupMap = new Map<TreeNode, PromptGroup>();
	private extensionPath: string | undefined;

	constructor(private storage: StorageService, extensionPath?: string) {
		this.extensionPath = extensionPath;
	}

	refresh(): void {
		this.nodeToGroupMap.clear();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		const hasChildren = isPromptGroup(element) && (element.children.length > 0 || element.prompts.length > 0);
		const collapsibleState = hasChildren
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		const parentGroup = this.nodeToGroupMap.get(element);
		return new PromptTreeItem(element, collapsibleState, parentGroup, this.extensionPath);
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (!element) {
			const data = await this.storage.load();
			return data.groups;
		}

		if (isPromptGroup(element)) {
			// Map children and prompts to their parent group
			element.children.forEach(child => {
				this.nodeToGroupMap.set(child, element);
			});
			element.prompts.forEach(prompt => {
				this.nodeToGroupMap.set(prompt, element);
			});

			const children: TreeNode[] = [...element.children, ...element.prompts];
			return children;
		}

		return [];
	}

	async getParent(element: TreeNode): Promise<TreeNode | undefined> {
		return this.nodeToGroupMap.get(element);
	}

	getParentGroup(element: TreeNode): PromptGroup | undefined {
		return this.nodeToGroupMap.get(element);
	}
}
