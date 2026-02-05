export interface PromptItem {
	id: string;
	title: string;
	content: string;
}

/** Available group colors */
export type GroupColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | null;

export interface PromptGroup {
	id: string;
	name: string;
	color?: GroupColor;
	children: PromptGroup[];
	prompts: PromptItem[];
}

export interface PromptData {
	groups: PromptGroup[];
}

export type TreeNode = PromptGroup | PromptItem;

export function isPromptGroup(node: TreeNode): node is PromptGroup {
	return 'children' in node || 'prompts' in node;
}

export function isPromptItem(node: TreeNode): node is PromptItem {
	return 'content' in node && !('children' in node);
}

/**
 * Validate imported prompt data structure
 */
export function validatePromptData(data: unknown): data is PromptData {
	if (!data || typeof data !== 'object') {
		return false;
	}

	const d = data as Record<string, unknown>;
	
	if (!Array.isArray(d.groups)) {
		return false;
	}

	const validateGroup = (group: unknown): group is PromptGroup => {
		if (!group || typeof group !== 'object') {
			return false;
		}

		const g = group as Record<string, unknown>;
		
		if (typeof g.id !== 'string' || typeof g.name !== 'string') {
			return false;
		}

		if (!Array.isArray(g.children) || !Array.isArray(g.prompts)) {
			return false;
		}

		// Validate all children
		if (!g.children.every(validateGroup)) {
			return false;
		}

		// Validate all prompts
		return g.prompts.every((p: unknown) => {
			if (!p || typeof p !== 'object') {
				return false;
			}
			const prompt = p as Record<string, unknown>;
			return typeof prompt.id === 'string' 
				&& typeof prompt.title === 'string' 
				&& typeof prompt.content === 'string';
		});
	};

	return d.groups.every(validateGroup);
}
