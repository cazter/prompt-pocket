# Prompt Pocket 📝

<div align="center">

A lightweight, fast, and beautifully integrated VS Code extension for organizing and quickly copying reusable prompts. Perfect for AI interactions, code snippets, templates, and frequently used text.

**[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Development](#development)**

</div>

---

## ✨ Features

### Core Functionality
- **📁 Hierarchical Organization**: Organize prompts into groups and subgroups with unlimited nesting
- **📋 One-Click Copy**: Click any prompt to instantly copy it to your clipboard
- **✏️ Multiline Editing**: Full editor support for creating and editing multiline prompts
- **🔍 Quick Search**: Fast search across all prompts with fuzzy matching
- **⌨️ Keyboard Shortcuts**: Access prompts without touching your mouse

### Data Management
- **💾 Import/Export**: Backup and share your prompt libraries as JSON files
- **🔄 Duplicate**: Quickly duplicate prompts or entire groups
- **🎯 Sample Library**: Pre-loaded with useful example prompts to get started
- **☁️ Local Storage**: All data stored securely in VS Code's GlobalState (no cloud, no tracking)

### User Experience
- **🎨 Native VS Code UI**: Clean, theme-aware interface that feels built-in
- **⚡ Lightning Fast**: Minimal dependencies, instant startup
- **🔒 Private**: No telemetry, no accounts, no syncing—100% local
- **♿ Accessible**: Full keyboard navigation and screen reader support

## 📦 Installation

### Option 1: Using the Install Script (Recommended for Cursor)

For Cursor IDE users, we provide an idempotent installation script:

```bash
cd prompt-pocket
./install.sh
```

The script will:
- Install dependencies
- Compile TypeScript
- Package the extension
- Install to Cursor
- Can be run repeatedly to update the extension

### Option 2: Manual Installation

1. **Build the extension:**
   ```bash
   pnpm install
   pnpm run compile
   pnpm run package
   ```

2. **Install the .vsix file:**
   - Open VS Code/Cursor
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Extensions: Install from VSIX"
   - Select the generated `.vsix` file

3. **Reload the editor**

### Option 3: From VS Code Marketplace (Coming Soon)

Once published, you'll be able to install directly:

1. Open VS Code/Cursor
2. Go to Extensions (`Cmd+Shift+X`)
3. Search for "Prompt Pocket"
4. Click Install

### Option 4: Development Mode

Press `F5` in VS Code to open an Extension Development Host window with the extension loaded.

## 🚀 Quick Start

### First Time Setup

1. **Open Prompt Pocket**: Click the 📝 icon in the Activity Bar (left sidebar)
2. **Explore Sample Prompts**: The extension comes with helpful examples
3. **Create Your First Prompt**:
   - Click the `+` button to create a new group
   - Right-click the group → "New Prompt"
   - Enter a title and your prompt content (multiline editor will open)
   - Close the editor to save

### Daily Workflow

**Copy a Prompt:**
- Click any prompt in the tree
- Or use `Cmd+Shift+P` → "Copy Prompt from Prompt Pocket"
- Or press the configured keyboard shortcut

**Search Prompts:**
- Click the search icon in the toolbar
- Or use "Search Prompts" from the title menu
- Type to filter, press Enter to copy

**Organize:**
- Drag and drop to reorder (coming soon)
- Duplicate prompts to reuse templates
- Export/import to share with team or backup

## 📖 Usage Guide

### Managing Groups

| Action | How To |
|--------|--------|
| Create Group | Click `+` in toolbar |
| Create Subgroup | Right-click group → "New Subgroup" |
| Rename Group | Right-click → "Rename" |
| Duplicate Group | Right-click → "Duplicate Group" |
| Delete Group | Right-click → "Delete" |

### Managing Prompts

| Action | How To |
|--------|--------|
| Create Prompt | Right-click group → "New Prompt" |
| Edit Prompt | Right-click → "Edit Content" (opens full editor) |
| Rename Prompt | Right-click → "Rename" |
| Duplicate Prompt | Right-click → "Duplicate Prompt" |
| Copy Prompt | Click the prompt |
| Delete Prompt | Right-click → "Delete" |

### Import/Export

**Export Your Library:**
1. Click the export icon in the toolbar
2. Choose a location to save the JSON file
3. Your entire prompt library is saved

**Import Prompts:**
1. Click the import icon in the toolbar
2. Select a JSON file
3. Choose "Merge" (add to existing) or "Replace" (overwrite all)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` `Ctrl+P` | Quick copy from palette |
| `Ctrl+Shift+F` (in view) | Search prompts |

## ⚙️ Configuration

Prompt Pocket works out of the box with zero configuration. All data is stored locally in VS Code's GlobalState storage.

### Storage Location

Your prompts are stored in VS Code's global state, which persists across sessions but is specific to your VS Code/Cursor installation. To backup or share your prompts, use the **Export** feature.

### Data Format

Exported JSON files follow this structure:

```json
{
  "groups": [
    {
      "id": "unique-id",
      "name": "Group Name",
      "children": [],
      "prompts": [
        {
          "id": "unique-id",
          "title": "Prompt Title",
          "content": "Prompt content here..."
        }
      ]
    }
  ]
}
```

## 🛠️ Development

### Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: 9.x or higher
- **VS Code**: 1.85.0 or higher

### Setup

```bash
# Clone the repository
git clone https://github.com/cazter/prompt-pocket.git
cd prompt-pocket

# Install dependencies
pnpm install

# Open in VS Code
code .
```

### Build Commands

```bash
# Compile TypeScript
pnpm run compile

# Watch for changes
pnpm run watch

# Lint code
pnpm run lint

# Run tests
pnpm run test

# Package extension
pnpm run package

# Publish to marketplace (requires setup)
pnpm run publish
```

### Publishing to Marketplace

See [PUBLISH_QUICKSTART.md](PUBLISH_QUICKSTART.md) for a quick guide or [PUBLISHING.md](PUBLISHING.md) for comprehensive documentation.

### Development Workflow

1. **Make Changes**: Edit TypeScript files in `src/`
2. **Compile**: Run `pnpm run compile` (or use watch mode)
3. **Test**: Press `F5` to launch Extension Development Host
4. **Debug**: Set breakpoints and inspect in the debug console
5. **Package**: Run `pnpm run package` to create `.vsix` file

### Running Tests

```bash
# Run all tests
pnpm test

# The test suite includes:
# - Type guard tests
# - Data validation tests
# - Command registration tests
# - ID generation tests
```

## Project Structure

```
prompt-pocket/
├── .vscode/                 # VS Code configuration
│   ├── launch.json          # Debug configuration
│   ├── tasks.json           # Build tasks
│   ├── settings.json        # Editor settings
│   └── extensions.json      # Recommended extensions
├── resources/               # Extension resources
│   └── icon.svg             # Activity bar icon
├── src/                     # Source files
│   ├── extension.ts         # Extension entry point and command handlers
│   ├── types.ts             # TypeScript type definitions
│   ├── storage.ts           # Storage service for persistence
│   └── treeDataProvider.ts  # Tree view data provider
├── test/                    # Test files
│   ├── suite/               # Test suite
│   │   ├── index.ts         # Test runner configuration
│   │   └── extension.test.ts # Sample tests
│   └── runTest.ts           # Test entry point
├── out/                     # Compiled output (generated)
├── .eslintrc.json          # ESLint configuration
├── .gitignore              # Git ignore rules
├── .vscodeignore           # VS Code packaging ignore rules
├── package.json            # Extension manifest and dependencies
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## Architecture

### Data Model

The extension uses a simple hierarchical structure:

- **PromptGroup**: Contains groups, subgroups, and prompts
- **PromptItem**: Individual prompt with title and content
- Data is stored using VS Code's `GlobalState` API for persistence

### Key Components

1. **StorageService** (`src/storage.ts`): Handles all data persistence using VS Code GlobalState
2. **PromptTreeDataProvider** (`src/treeDataProvider.ts`): Provides tree view data and handles UI updates
3. **Extension Activation** (`src/extension.ts`): Registers commands, views, and context menus

### Design Decisions

- **Native TreeView API**: Uses VS Code's built-in TreeView for native feel and performance
- **GlobalState Storage**: Simple, reliable local storage without file I/O complexity
- **No Webviews**: Avoids React/framework overhead for better performance
- **Minimal Dependencies**: Only TypeScript and VS Code API dependencies

## 🏗️ Architecture

### Technology Stack

- **TypeScript**: Type-safe development
- **VS Code Extension API**: Native TreeView integration
- **ESLint**: Code quality and style enforcement
- **Mocha**: Testing framework
- **pnpm**: Fast, efficient package management

### Project Structure

```
prompt-pocket/
├── src/
│   ├── extension.ts        # Extension entry point & command handlers
│   ├── storage.ts          # Data persistence layer
│   ├── treeDataProvider.ts # TreeView implementation
│   └── types.ts            # TypeScript type definitions
├── test/
│   └── suite/
│       ├── extension.test.ts # Test suite
│       └── index.ts         # Test runner
├── resources/
│   └── icon.svg            # Activity bar icon
├── install.sh              # Installation script for Cursor
└── package.json            # Extension manifest

### Key Design Decisions

1. **No Webviews**: Uses native TreeView API for performance and consistency
2. **GlobalState Storage**: Simple, reliable local persistence
3. **Minimal Dependencies**: Only TypeScript and VS Code API
4. **Multiline Editing**: Opens temporary markdown documents for better UX
5. **Validation**: Strict type checking and data validation on import

## 🐛 Troubleshooting

**Extension not appearing after installation:**
- Restart VS Code/Cursor completely
- Check that the extension is enabled: Extensions panel → Search "Prompt Pocket"

**Prompts not saving:**
- Check VS Code console for errors: Help → Toggle Developer Tools
- Try exporting prompts as backup, then re-import

**Keyboard shortcuts not working:**
- Check for conflicts: Preferences → Keyboard Shortcuts → Search for "prompt-pocket"
- Customize shortcuts as needed

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs**: Open an issue with details and reproduction steps
2. **Suggest Features**: Share ideas for improvements
3. **Submit PRs**: Fork, create a feature branch, and submit a pull request
4. **Improve Docs**: Help make the documentation clearer

### Development Guidelines

- Follow existing code style (enforced by ESLint)
- Add tests for new features
- Update README for user-facing changes
- Keep commits focused and well-described

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with ❤️ for developers who work with AI and need quick access to their prompt libraries.

Inspired by the need for a lightweight, privacy-focused prompt manager that feels native to VS Code.

---

<div align="center">

**[⬆ Back to Top](#prompt-pocket-)**

Made with TypeScript and the VS Code Extension API

</div>
