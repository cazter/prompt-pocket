import * as assert from 'assert';
import * as vscode from 'vscode';
import { copyPromptContentWithFeedback, normalizeClipboardContent, runPromptContent } from '../../src/runActions';
import { PromptTreeItem } from '../../src/treeDataProvider';
import { PromptGroup, PromptItem, isPromptGroup, isPromptItem, validatePromptData } from '../../src/types';

suite('Prompt Pocket Extension Test Suite', () => {
	vscode.window.showInformationMessage('Running Prompt Pocket tests...');

	suite('Type Guards', () => {
		test('isPromptGroup identifies PromptGroup correctly', () => {
			const group: PromptGroup = {
				id: 'test-1',
				name: 'Test Group',
				children: [],
				prompts: []
			};

			const prompt: PromptItem = {
				id: 'test-2',
				title: 'Test Prompt',
				content: 'Test content'
			};

			assert.strictEqual(isPromptGroup(group), true);
			assert.strictEqual(isPromptGroup(prompt), false);
		});

		test('isPromptItem identifies PromptItem correctly', () => {
			const group: PromptGroup = {
				id: 'test-1',
				name: 'Test Group',
				children: [],
				prompts: []
			};

			const prompt: PromptItem = {
				id: 'test-2',
				title: 'Test Prompt',
				content: 'Test content'
			};

			assert.strictEqual(isPromptItem(prompt), true);
			assert.strictEqual(isPromptItem(group), false);
		});
	});

	suite('Data Validation', () => {
		test('validatePromptData accepts valid data', () => {
			const validData = {
				groups: [
					{
						id: 'group-1',
						name: 'Test Group',
						children: [],
						prompts: [
							{
								id: 'prompt-1',
								title: 'Test Prompt',
								content: 'Test content'
							}
						]
					}
				]
			};

			assert.strictEqual(validatePromptData(validData), true);
		});

		test('validatePromptData rejects invalid data', () => {
			const invalidData1 = {
				groups: 'not an array'
			};

			const invalidData2 = {
				groups: [
					{
						id: 'group-1',
						// Missing name
						children: [],
						prompts: []
					}
				]
			};

			const invalidData3 = {
				groups: [
					{
						id: 'group-1',
						name: 'Test',
						children: [],
						prompts: [
							{
								id: 'prompt-1',
								// Missing title
								content: 'Test'
							}
						]
					}
				]
			};

			assert.strictEqual(validatePromptData(invalidData1), false);
			assert.strictEqual(validatePromptData(invalidData2), false);
			assert.strictEqual(validatePromptData(invalidData3), false);
		});

		test('validatePromptData handles nested groups', () => {
			const validNestedData = {
				groups: [
					{
						id: 'group-1',
						name: 'Parent',
						children: [
							{
								id: 'group-2',
								name: 'Child',
								children: [],
								prompts: []
							}
						],
						prompts: []
					}
				]
			};

			assert.strictEqual(validatePromptData(validNestedData), true);
		});
	});

	suite('Extension Commands', () => {
		test('Extension is activated', async () => {
			const extension = vscode.extensions.getExtension('cazter.prompt-pocket');
			assert.ok(extension, 'Extension should be installed');
			
			await extension.activate();
			assert.ok(extension.isActive, 'Extension should be activated');
		});

		test('All commands are registered', async () => {
			const commands = await vscode.commands.getCommands(true);
			const expectedCommands = [
				'prompt-pocket.copyPrompt',
				'prompt-pocket.runPrompt',
				'prompt-pocket.createGroup',
				'prompt-pocket.createSubgroup',
				'prompt-pocket.createPrompt',
				'prompt-pocket.renameGroup',
				'prompt-pocket.renamePrompt',
				'prompt-pocket.editPrompt',
				'prompt-pocket.deleteGroup',
				'prompt-pocket.deletePrompt',
				'prompt-pocket.copyPromptFromPalette',
				'prompt-pocket.refresh',
				'prompt-pocket.export',
				'prompt-pocket.import',
				'prompt-pocket.duplicatePrompt',
				'prompt-pocket.duplicateGroup',
				'prompt-pocket.search'
			];

			for (const cmd of expectedCommands) {
				assert.ok(
					commands.includes(cmd),
					`Command ${cmd} should be registered`
				);
			}
		});
	});

	suite('ID Generation', () => {
		test('Generated IDs are unique', () => {
			const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
			
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				const id = generateId();
				assert.strictEqual(ids.has(id), false, 'ID should be unique');
				ids.add(id);
			}
		});
	});

	// Locks in the contract that clicking a prompt row in the sidebar tree opens
	// the editor (rather than silently copying to the clipboard). The Copy paths
	// are still reachable via the inline icon and the context menu; they are
	// covered by the 'All commands are registered' check above.
	suite('Tree Item Default Command', () => {
		test('Clicking a prompt tree item invokes editPrompt with the prompt as its argument', () => {
			const prompt: PromptItem = {
				id: 'click-test-prompt',
				title: 'Click me',
				content: 'content'
			};

			const item = new PromptTreeItem(prompt, vscode.TreeItemCollapsibleState.None);

			assert.ok(item.command, 'Prompt tree item should have a default click command');
			assert.strictEqual(
				item.command?.command,
				'prompt-pocket.editPrompt',
				'Clicking a prompt should open the editor (not copy to clipboard)'
			);
			assert.deepStrictEqual(
				item.command?.arguments,
				[prompt],
				'The clicked prompt should be passed as the command argument'
			);
		});

		test('Group tree items have no default click command (rows expand/collapse)', () => {
			const group: PromptGroup = {
				id: 'click-test-group',
				name: 'A group',
				children: [],
				prompts: []
			};

			const item = new PromptTreeItem(group, vscode.TreeItemCollapsibleState.None);
			assert.strictEqual(
				item.command,
				undefined,
				'Group rows should not have a click action; they expand/collapse instead'
			);
		});
	});

	// Covers the new src/runActions.ts module: the shared clipboard helper +
	// each Run strategy (clipboard happy path, copilotChat fallback,
	// insertAtCursor happy + fallback, terminal happy + reuse).
	//
	// The Copilot Chat happy path is NOT exercised here because Copilot is not
	// installed in the @vscode/test-electron host. It is verified manually in
	// a Copilot-enabled VS Code as documented in the PR description.
	suite('Run Actions', () => {
		test('normalizeClipboardContent preserves markdown structure and unwraps soft lines', () => {
			const input = '# Title\n\n- one\n- two\n\nSoft\nwrap\nparagraph.\n\n```\ncode\nblock\n```';
			const out = normalizeClipboardContent(input);
			assert.ok(out.includes('# Title'), 'heading kept on its own line');
			assert.ok(out.includes('- one\n- two'), 'list items kept on separate lines');
			assert.ok(out.includes('Soft wrap paragraph.'), 'paragraph soft-wraps collapsed to spaces');
			assert.ok(out.includes('```\ncode\nblock\n```'), 'fenced code block kept verbatim');
		});

		test('copyPromptContentWithFeedback writes the normalized content to the system clipboard', async () => {
			await copyPromptContentWithFeedback('hello world', 'Greeting', { showCopyNotification: false });
			const clip = await vscode.env.clipboard.readText();
			assert.strictEqual(clip, 'hello world');
		});

		test('runPromptContent: clipboard action copies the content and reports done', async () => {
			const result = await runPromptContent('clip-test', 'Clip', {
				runAction: 'clipboard',
				showCopyNotification: false
			});
			assert.strictEqual(result.kind, 'done');
			assert.strictEqual(result.action, 'clipboard');
			const clip = await vscode.env.clipboard.readText();
			assert.strictEqual(clip, 'clip-test');
		});

		test('runPromptContent: copilotChat reports chat success or clipboard fallback', async () => {
			const result = await runPromptContent('copilot-fallback-payload', 'CFT', {
				runAction: 'copilotChat',
				showCopyNotification: false
			});
			if (result.kind === 'fellback') {
				assert.strictEqual(result.from, 'copilotChat');
				const clip = await vscode.env.clipboard.readText();
				assert.strictEqual(clip, 'copilot-fallback-payload');
			} else {
				assert.strictEqual(result.action, 'copilotChat');
			}
		});

		test('runPromptContent: insertAtCursor inserts into the active editor when one is open', async () => {
			const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
			await vscode.window.showTextDocument(doc);
			const result = await runPromptContent('inserted-payload', 'Inserted', {
				runAction: 'insertAtCursor',
				showCopyNotification: false
			});
			assert.strictEqual(result.kind, 'done');
			assert.strictEqual(result.action, 'insertAtCursor');
			assert.strictEqual(doc.getText(), 'inserted-payload');
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		});

		test('runPromptContent: insertAtCursor falls back to clipboard when no editor is active', async () => {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			const result = await runPromptContent('insert-fallback-payload', 'IFB', {
				runAction: 'insertAtCursor',
				showCopyNotification: false
			});
			assert.strictEqual(result.kind, 'fellback');
			assert.strictEqual(result.from, 'insertAtCursor');
			const clip = await vscode.env.clipboard.readText();
			assert.strictEqual(clip, 'insert-fallback-payload');
		});

		test('runPromptContent: terminal action creates the named "Prompt Pocket" terminal and reuses it', async () => {
			// Make sure no prior Prompt Pocket terminal exists from another test.
			for (const t of vscode.window.terminals) {
				if (t.name === 'Prompt Pocket') {
					t.dispose();
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 100));

			const first = await runPromptContent('echo hi', 'Echo', {
				runAction: 'terminal',
				showCopyNotification: false
			});
			assert.strictEqual(first.kind, 'done');
			assert.strictEqual(first.action, 'terminal');

			const promptPocketTerminals = vscode.window.terminals.filter((t) => t.name === 'Prompt Pocket');
			assert.strictEqual(promptPocketTerminals.length, 1, 'one Prompt Pocket terminal should exist after first run');

			const beforeCount = vscode.window.terminals.length;
			const second = await runPromptContent('echo again', 'EchoAgain', {
				runAction: 'terminal',
				showCopyNotification: false
			});
			assert.strictEqual(second.kind, 'done');
			assert.strictEqual(vscode.window.terminals.length, beforeCount, 'second run should reuse the existing terminal');

			for (const t of vscode.window.terminals) {
				if (t.name === 'Prompt Pocket') {
					t.dispose();
				}
			}
		});
	});
});
