import * as vscode from 'vscode';
import { PromptData, PromptGroup } from './types';

const STORAGE_KEY = 'prompt-pocket-data';
const INITIALIZED_KEY = 'prompt-pocket-initialized';

const SAMPLE_DATA: PromptData = {
	groups: [
		{
			id: 'sample-feature-alpha',
			name: 'Feature Alpha',
			color: 'blue',
			children: [],
			prompts: [
				{
					id: 'sample-feature-alpha-1',
					title: 'Implement Feature',
					content: 'Help me implement [feature description].\n\nContext:\n- [Current state]\n- [Requirements]\n- [Constraints]'
				}
			]
		},
		{
			id: 'sample-agents',
			name: 'Agents',
			color: 'purple',
			children: [],
			prompts: [
				{
					id: 'sample-agents-1',
					title: 'Agent System Prompt',
					content: 'You are an AI assistant specialized in [domain].\n\nYour capabilities:\n- [Capability 1]\n- [Capability 2]\n\nGuidelines:\n- [Guideline 1]\n- [Guideline 2]'
				}
			]
		},
		{
			id: 'sample-shell-cmds',
			name: 'Shell Cmds',
			color: 'green',
			children: [],
			prompts: [
				{
					id: 'sample-shell-cmds-1',
					title: 'Git Workflow',
					content: 'Common git commands:\n\n```bash\ngit status\ngit add .\ngit commit -m "message"\ngit push origin main\n```'
				}
			]
		},
		{
			id: 'sample-misc',
			name: 'Misc',
			color: 'orange',
			children: [],
			prompts: [
				{
					id: 'sample-misc-1',
					title: 'Explain Code',
					content: 'Please explain the following code:\n\n```\n[Paste code here]\n```\n\nInclude:\n- What it does\n- How it works\n- Any potential improvements'
				}
			]
		}
	]
};

const DEFAULT_DATA: PromptData = {
	groups: []
};

export class StorageService {
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	async load(): Promise<PromptData> {
		try {
			const stored = this.context.globalState.get<PromptData>(STORAGE_KEY);
			
			// Initialize with sample data on first run
			if (!stored) {
				const initialized = this.context.globalState.get<boolean>(INITIALIZED_KEY);
				if (!initialized) {
					await this.context.globalState.update(INITIALIZED_KEY, true);
					await this.save(SAMPLE_DATA);
					return SAMPLE_DATA;
				}
			}
			
			return stored || { ...DEFAULT_DATA };
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to load prompts: ${error instanceof Error ? error.message : String(error)}`);
			return { ...DEFAULT_DATA };
		}
	}

	async save(data: PromptData): Promise<void> {
		try {
			await this.context.globalState.update(STORAGE_KEY, data);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save prompts: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async reset(): Promise<void> {
		try {
			await this.context.globalState.update(STORAGE_KEY, undefined);
			await this.context.globalState.update(INITIALIZED_KEY, false);
			vscode.window.showInformationMessage('Prompt Pocket data has been reset.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to reset: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async addGroup(group: PromptGroup): Promise<void> {
		try {
			const data = await this.load();
			data.groups.push(group);
			await this.save(data);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to add group: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async updateGroup(groupId: string, updates: Partial<PromptGroup>): Promise<void> {
		try {
			const data = await this.load();
			const group = this.findGroup(data.groups, groupId);
			if (group) {
				Object.assign(group, updates);
				await this.save(data);
			} else {
				throw new Error('Group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update group: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async deleteGroup(groupId: string): Promise<void> {
		try {
			const data = await this.load();
			const removed = this.removeGroup(data.groups, groupId);
			if (!removed) {
				throw new Error('Group not found');
			}
			await this.save(data);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete group: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async addPromptToGroup(groupId: string, prompt: PromptGroup['prompts'][0]): Promise<void> {
		try {
			const data = await this.load();
			const group = this.findGroup(data.groups, groupId);
			if (group) {
				group.prompts.push(prompt);
				await this.save(data);
			} else {
				throw new Error('Group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to add prompt: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async updatePrompt(groupId: string, promptId: string, updates: Partial<PromptGroup['prompts'][0]>): Promise<void> {
		try {
			const data = await this.load();
			const group = this.findGroup(data.groups, groupId);
			if (group) {
				const prompt = group.prompts.find(p => p.id === promptId);
				if (prompt) {
					Object.assign(prompt, updates);
					await this.save(data);
				} else {
					throw new Error('Prompt not found');
				}
			} else {
				throw new Error('Group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update prompt: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async deletePrompt(groupId: string, promptId: string): Promise<void> {
		try {
			const data = await this.load();
			const group = this.findGroup(data.groups, groupId);
			if (group) {
				const originalLength = group.prompts.length;
				group.prompts = group.prompts.filter(p => p.id !== promptId);
				if (group.prompts.length === originalLength) {
					throw new Error('Prompt not found');
				}
				await this.save(data);
			} else {
				throw new Error('Group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete prompt: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async addSubgroup(parentGroupId: string, subgroup: PromptGroup): Promise<void> {
		try {
			const data = await this.load();
			const parentGroup = this.findGroup(data.groups, parentGroupId);
			if (parentGroup) {
				parentGroup.children.push(subgroup);
				await this.save(data);
			} else {
				throw new Error('Parent group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to add subgroup: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async reorderPrompt(groupId: string, promptId: string, newIndex: number): Promise<void> {
		try {
			const data = await this.load();
			const group = this.findGroup(data.groups, groupId);
			if (group) {
				const currentIndex = group.prompts.findIndex(p => p.id === promptId);
				if (currentIndex === -1) {
					throw new Error('Prompt not found');
				}
				const [prompt] = group.prompts.splice(currentIndex, 1);
				group.prompts.splice(newIndex, 0, prompt);
				await this.save(data);
			} else {
				throw new Error('Group not found');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to reorder prompt: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async movePromptToGroup(promptId: string, fromGroupId: string, toGroupId: string, newIndex?: number): Promise<void> {
		try {
			const data = await this.load();
			const fromGroup = this.findGroup(data.groups, fromGroupId);
			const toGroup = this.findGroup(data.groups, toGroupId);

			if (!fromGroup) {
				throw new Error('Source group not found');
			}
			if (!toGroup) {
				throw new Error('Destination group not found');
			}

			const promptIndex = fromGroup.prompts.findIndex(p => p.id === promptId);
			if (promptIndex === -1) {
				throw new Error('Prompt not found in source group');
			}

			const [prompt] = fromGroup.prompts.splice(promptIndex, 1);
			if (newIndex !== undefined) {
				toGroup.prompts.splice(newIndex, 0, prompt);
			} else {
				toGroup.prompts.push(prompt);
			}

			await this.save(data);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to move prompt: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	async reorderGroup(groupId: string, newIndex: number): Promise<void> {
		try {
			const data = await this.load();
			const currentIndex = data.groups.findIndex(g => g.id === groupId);
			if (currentIndex === -1) {
				throw new Error('Group not found');
			}
			const [group] = data.groups.splice(currentIndex, 1);
			data.groups.splice(newIndex, 0, group);
			await this.save(data);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to reorder group: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	private findGroup(groups: PromptGroup[], id: string): PromptGroup | undefined {
		for (const group of groups) {
			if (group.id === id) {
				return group;
			}
			const found = this.findGroup(group.children, id);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	private removeGroup(groups: PromptGroup[], id: string): boolean {
		const index = groups.findIndex(g => g.id === id);
		if (index !== -1) {
			groups.splice(index, 1);
			return true;
		}
		for (const group of groups) {
			if (this.removeGroup(group.children, id)) {
				return true;
			}
		}
		return false;
	}
}
