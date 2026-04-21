# Changelog

All notable changes to the Prompt Pocket extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-04-21

### Added
- Drag-and-drop files or folders anywhere in the prompt modal to insert them as `@reference` paths, with a full-modal drop overlay highlighting the active drop target.
- Unsaved-changes confirm dialog (Save / Discard / Cancel) when closing prompt or group modals with pending edits.
- Inline hint under the prompt content label explaining the `Shift`-drag requirement for VS Code Explorer drops.

### Changed
- Default prompt and group modal size is now `80vw` x `80vh` (still resizable within sensible min/max bounds).
- Drop handling now parses `text/uri-list` per spec (`\r?\n` line splitting, comment filtering) and falls back to `dataTransfer.files` for OS-level drops.
- Rewrote `README.md` for marketplace readers: added Getting Started, Using Prompt Pocket, File References, Keyboard Shortcuts, Settings, Import / Export, and Privacy sections; removed source-install and developer build instructions.

### Fixed
- `Cmd/Ctrl+N` no longer pops the New Prompt modal when refocusing the Prompt Pocket tab; the shortcut is now gated on the webview actually having focus (`document.hasFocus()`).
- Modal close buttons no longer accidentally bypass the unsaved-changes dialog by passing the click event as the `force` argument.

## [0.1.5] - 2026-02-26

### Changed
- Updated clipboard normalization to preserve intentional formatting (lists, spacing, paragraphs) while still unwrapping likely soft-wrapped line breaks.

## [0.1.4] - 2026-02-26

### Added
- Added `promptPocket.enableFileReferences` setting to disable `@` file linking in the prompt editor.
- Added a prompt modal toggle to show/hide referenced item chips (`@files` and domains).
- Added an inline clear (`X`) button for quickly clearing prompt search.

### Changed
- Improved export flow to default to a new timestamped JSON filename.
- Copy operations now normalize prompt text to remove hard line breaks before writing to clipboard.

### Fixed
- Fixed modal resizing so the resize cursor state does not get stuck after drag-resize.

## [0.1.0] - 2026-02-04

### Added
- ✨ **Multiline Editing**: Full editor support for creating and editing prompts (replaces single-line input boxes)
- 🔍 **Search & Filter**: Quick search across all prompts with fuzzy matching
- 💾 **Import/Export**: Backup and share prompt libraries as JSON files
- 🔄 **Duplicate**: Duplicate individual prompts or entire groups with all children
- 🎯 **Sample Library**: Pre-loaded example prompts for first-time users
- ⌨️ **Keyboard Shortcuts**: Quick access shortcuts for common actions
- 🛡️ **Data Validation**: Robust validation for imported data to prevent corruption
- 🐛 **Error Handling**: Comprehensive error handling with user-friendly messages
- 📦 **Installation Script**: Idempotent `install.sh` script for easy Cursor installation
- ✅ **Test Suite**: Comprehensive tests for type guards, validation, and commands
- 📚 **Enhanced Documentation**: Complete README with usage guide and troubleshooting

### Changed
- 🎨 **Improved UX**: Prompt content editing now uses full VS Code editor instead of input box
- 📝 **Better Metadata**: Updated package.json with proper publisher, keywords, and categories
- 🔧 **Build Script**: Cleaned up build scripts and removed invalid references

### Fixed
- 🐛 Fixed multiline prompt editing (was using single-line input box)
- 🛠️ Fixed package.json clean script (removed non-existent directories)
- ✏️ Fixed missing publisher field in package.json

## [0.0.1] - Initial Release

### Added
- 📁 Hierarchical prompt organization with groups and subgroups
- 📋 One-click copy to clipboard
- ✏️ Create, rename, edit, and delete prompts and groups
- 🗂️ TreeView integration with VS Code sidebar
- 💾 Local storage using VS Code GlobalState
- 🎨 Native VS Code UI with theme support
- ⚡ Fast startup with minimal dependencies
- 🔧 Command palette integration
- 🎯 Context menus for all actions
- 📱 Activity bar icon and view container

---

[0.1.0]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.0
[0.0.1]: https://github.com/cazter/prompt-pocket/releases/tag/v0.0.1
[0.1.4]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.4
[0.1.5]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.5
[0.1.6]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.6
