# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm install          # Install dependencies
pnpm run compile      # Compile TypeScript to out/
pnpm run watch        # Watch mode for development
pnpm run lint         # Run ESLint on src/
pnpm run test         # Run Mocha tests (requires compile first)
pnpm run package      # Create .vsix extension package
```

To test the extension: Press F5 in VS Code to launch an Extension Development Host.

## Architecture

Prompt Pocket is a VS Code extension for organizing reusable prompts. It provides two interfaces:

1. **Sidebar Tree View** — Traditional hierarchical navigation in the activity bar
2. **Editor Panel** — Search-first webview that opens as an editor tab (`Cmd+Shift+P Cmd+O`)

### Data Model

```text
PromptData
└── groups: PromptGroup[]
    ├── id, name
    ├── children: PromptGroup[]  (nested subgroups, max 2 levels)
    └── prompts: PromptItem[]
        └── id, title, content
```

### Core Components

- **`src/extension.ts`**: Entry point. Registers all commands (`prompt-pocket.*`), creates tree view and webview panel. Uses `refreshAll()` to sync both views after mutations.

- **`src/webviewPanel.ts`**: `PromptPocketPanel` class manages the editor tab interface. Handles webview lifecycle, message passing, and UI state persistence (selected group, search query).

- **`src/storage.ts`**: `StorageService` wraps VS Code's GlobalState API. Provides CRUD operations for groups and prompts. Initializes with sample data on first run.

- **`src/treeDataProvider.ts`**: `PromptTreeDataProvider` implements TreeDataProvider for the sidebar view.

- **`src/types.ts`**: Type definitions and validation. `validatePromptData()` guards imported JSON.

### Webview Communication

The panel uses postMessage for extension ↔ webview communication:

- **Webview → Extension**: `ready`, `copy`, `createPrompt`, `updatePrompt`, `deletePrompt`, `createGroup`, `selectGroup`, etc.
- **Extension → Webview**: `state` (full data + UI state), `copied`, `error`

### UI State Persistence

The webview remembers:

- `selectedGroupId` — Last selected group
- `searchQuery` — Current search filter

This lets users reopen to exactly where they left off.

### Key Design Patterns

- Webview uses VS Code CSS variables for native theme integration
- Keyboard navigation: arrows to move, Enter to copy, Ctrl+F to search
- Both tree view and panel stay in sync via `refreshAll()`
- Multiline prompt editing uses temporary markdown documents in both interfaces
