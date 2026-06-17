# Changelog

All notable changes to the Prompt Pocket extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Sidebar tree click now opens a prompt for editing instead of copying it to the clipboard.** This is a behavior change for existing users: previously a single click on a prompt row copied its content silently. The new behavior matches the broader VS Code / Cursor convention of "select an item to open it." Copy is still one click away via the inline `$(copy)` icon that appears on row hover, the right-click context menu's **Copy Prompt** action, the Command Palette entries (`Copy Prompt from Prompt Pocket` and `Search Prompts`), and the editor panel's Enter-to-copy. The editor panel (`Cmd+Alt+P` / `Ctrl+Alt+P`) is intentionally unchanged so its search-first / copy-on-Enter workflow continues to work as before.
- **Prompt-content editor now opens in the active editor column (no split), live-autosaves as you type, reuses the same tab on repeat clicks, and no longer shows the "Editing prompt: …" toast or VS Code's "Save? Don't Save?" close dialog.** The editor is backed by a real cache file under the extension's `globalStorageUri` (`edit-cache/<safe-title>.<id>.md`), so the tab behaves like any normal saved file: no dirty marker, no save-on-close prompt, clean `Cmd+W`. Edits are debounced ~300ms and flushed through to both the cache file (via `doc.save()`) and the persisted prompt in globalState — the sidebar tree and editor panel stay in sync with the buffer in real time without `Cmd/Ctrl+S`. Clicking the same prompt twice focuses the existing tab instead of stacking new ones. Saves are serialized so concurrent debounced flushes can't race on globalState. To revert an accidental edit, undo (`Cmd/Ctrl+Z`) inside the document; the undo state is autosaved like any other edit. This change applies to all three editor paths: clicking a prompt in the tree, the context-menu **Edit Content** action, and the **New Prompt** flow. **Note**: in the New Prompt flow the prompt is now created the moment you confirm the title (with empty content) and then live-filled as you type. Cancelling by closing the editor immediately leaves an empty-content prompt to delete. Cache files for deleted/renamed prompts currently linger in globalStorage as a small disk cost (typically <10KB each); cleanup is tracked as a follow-up.

## [0.2.0] - 2026-06-08

### Added
- **Copy confirmation feedback.** Copying a prompt from the panel now gives an immediate in-row cue: the Copy button briefly morphs to a checkmark + "Copied", and the row gently flashes before fading back. The feedback fires for all copy paths (the row's Copy button, the right-click context menu, and pressing Enter on a selected row) and self-expires after ~1.3s. Rapid repeat-copies of the same row reset cleanly without leaving a stuck "Copied" label.
- **Full breadcrumb path on prompts.** Prompt rows now show the complete group ancestry (e.g. `Prompts › Feature Alpha`) instead of just the direct parent group, rendered as a compact chip with a group-colored dot, muted ancestors, and an emphasized leaf. Deep paths collapse the middle (`root › … › leaf`) and the full path is always available via hover tooltip, so the row layout never overflows.

### Changed
- The webview `copied` message now carries the originating `promptId` so feedback can target the exact row that was copied.
- The in-row copy feedback shows regardless of the `promptPocket.showCopyNotification` setting; that setting continues to gate only the toast notification.
- Copy feedback respects `prefers-reduced-motion` (the button still swaps its label, but the scale pop and row flash are suppressed).

## [0.1.9] - 2026-04-21

### Added
- **Pinned prompts.** Any prompt can now be pinned so it always stays at the top of the panel — independent of search filtering and group navigation. Pinned items appear in a quiet `PINNED · n` section above the regular list, separated by a thin divider, and continue to show their originating group badge so it's clear where each one actually lives.
- **Inline pin toggle.** A new pin button sits in each row's action cluster alongside Edit and Delete. The icon is outlined when unpinned (hover-revealed like the other actions) and filled when pinned (always visible so unpinning is one click away). A small dimmed pin glyph also appears next to the title of pinned rows so they remain identifiable if they ever scroll.
- New `togglePinned` storage method and webview message handler that flip the boolean on the prompt itself (`PromptItem.pinned`); existing data is forward-compatible because the field is optional and treated as `false` when absent.

## [0.1.8] - 2026-04-21

### Fixed
- **Folder drag-and-drop now works.** Dragging a folder from the Cursor / VS Code Explorer (with `Shift` held) into a prompt modal now resolves correctly to an `@folder/path` reference. Previously the drop event was silently dropped because the URI sat in Cursor-specific keys (`resourceurls`, `codefiles`, plain `text/plain` absolute paths) that the drop handler did not parse.
- **Multi-file drops insert one reference per line** instead of joining all paths on a single line with spaces. Single-file drops still get a trailing space so typing flow is preserved.
- Drop handler now also dispatches an `input` event after inserting references so dirty-tracking and the mention menu pick up the change.
- Workspace-root URI drops no longer silently disappear; they now resolve to the workspace folder name.

### Added
- New **"Prompt Pocket" Output channel** (View → Output → "Prompt Pocket") that surfaces drag-and-drop diagnostics. Stays silent during normal use; only auto-reveals when a drop reaches the modal but no URIs can be extracted, or when a drag arrives with unrecognized MIME types — making it easy to capture the data needed to file a bug if Cursor changes its drag format again.

### Changed
- Drop detection now accepts every known Cursor / VS Code drag MIME type: `text/uri-list`, `Files`, `application/vnd.code.uri-list`, every `application/vnd.code.tree.*` view, plus the lowercase `codeeditors`, `codefiles`, and `resourceurls` payloads used internally for tabs and files / folders.
- JSON payload extractor now accepts both URIs and absolute filesystem paths (POSIX or Windows), converting bare paths to `file://` URIs before resolution.

## [0.1.7] - 2026-04-21

### Fixed
- Activity Bar icon now displays the Prompt Pocket hexagon logo instead of an empty white placeholder; replaced the unsupported PNG reference with a properly themed `currentColor` SVG that adapts to dark and light themes automatically.

### Changed
- Upgraded the editor tab icon (shown when the Prompt Pocket panel is open) from a low-resolution PNG to per-theme SVG variants (`resources/icon-light.svg`, `resources/icon-dark.svg`) for crisp rendering at any DPI, with brand colors tuned for legibility on both light and dark tab backgrounds.

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
[0.1.7]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.7
[0.1.8]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.8
[0.1.9]: https://github.com/cazter/prompt-pocket/releases/tag/v0.1.9
[0.2.0]: https://github.com/cazter/prompt-pocket/releases/tag/v0.2.0
