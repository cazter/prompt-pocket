import * as assert from 'assert';
import * as vscode from 'vscode';
import { StorageService } from '../../src/storage';
import { PromptGroup, PromptItem, validatePromptData } from '../../src/types';

suite('Prompt Pocket Extension Test Suite', () => {
	vscode.window.showInformationMessage('Running Prompt Pocket tests...');

	suite('Type Guards', () => {
		test('isPromptGroup identifies PromptGroup correctly', () => {
			const { isPromptGroup } = require('../../src/types');
			
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
			const { isPromptItem } = require('../../src/types');
			
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
			const extension = vscode.extensions.getExtension('prompt-pocket.prompt-pocket');
			assert.ok(extension, 'Extension should be installed');
			
			await extension.activate();
			assert.ok(extension.isActive, 'Extension should be activated');
		});

		test('All commands are registered', async () => {
			const commands = await vscode.commands.getCommands(true);
			const expectedCommands = [
				'prompt-pocket.copyPrompt',
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
});
