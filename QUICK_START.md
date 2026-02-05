# Prompt Pocket - Quick Start Guide

## Installation (5 minutes)

### For Cursor Users

```bash
cd /path/to/prompt-pocket
./install.sh
```

The script handles everything automatically. Just restart Cursor when done.

### For VS Code Users

1. Open VS Code
2. Press `Cmd+Shift+P` → "Extensions: Install from VSIX"
3. Select the `.vsix` file (or build it first with `pnpm run package`)

## First Steps (2 minutes)

1. **Open Prompt Pocket**
   - Click the 📝 icon in the Activity Bar (left sidebar)

2. **Explore Sample Prompts**
   - The extension comes with example prompts
   - Click any prompt to copy it
   - Try the search feature

3. **Create Your First Prompt**
   - Right-click "💻 Coding Prompts" → "New Prompt"
   - Enter a title: "Explain Code"
   - A markdown editor opens for the content
   - Type your prompt, close the editor to save

## Essential Commands

| What You Want | How to Do It |
|---------------|--------------|
| Copy a prompt | Click it |
| Search prompts | Click search icon or `Cmd+Shift+F` |
| New group | Click `+` in toolbar |
| New prompt | Right-click group → "New Prompt" |
| Edit prompt | Right-click → "Edit Content" |
| Backup library | Click export icon → Save JSON |
| Import library | Click import icon → Select JSON |

## Pro Tips

### Organize Your Prompts

```
📁 Work
  📁 Code Review
    📝 Pull Request Review
    📝 Bug Fix Review
  📁 Documentation
    📝 API Docs Template
    📝 README Template
📁 Personal
  📁 Writing
    📝 Email Draft
    📝 Blog Post Outline
```

### Use the Search

- Press `Cmd+Shift+F` (in the Prompt Pocket view)
- Type keywords to filter
- Search matches title, content, and group names
- Press Enter to copy

### Keyboard Workflow

1. `Cmd+Shift+P` → Type "prompt pocket"
2. Select "Search Prompts" or "Copy Prompt from Prompt Pocket"
3. Type to filter → Enter to copy
4. Paste into your AI chat

### Multiline Prompts

When creating/editing prompts:
- A full markdown editor opens
- Use multiple lines, formatting, code blocks
- Close the editor to save (Cmd+W)
- Changes are saved automatically

### Backup & Sync

**Export your library:**
- Click export icon → Save `my-prompts.json`
- Store in Dropbox/iCloud/Git

**Import on another machine:**
- Click import icon → Select JSON
- Choose "Merge" to add to existing prompts

### Sample Prompts

The extension includes starter prompts:
- Code explanation template
- Debug help template
- Pull request review
- Email drafting
- Documentation template

Delete or modify them as needed!

## Common Workflows

### Daily AI Interaction

```
1. Need a prompt
2. Click Prompt Pocket icon
3. Click the prompt (copied!)
4. Paste in ChatGPT/Claude/etc
```

### Building a Prompt Library

```
1. Create groups by project/topic
2. Add prompts as you discover good ones
3. Edit and refine over time
4. Export monthly as backup
```

### Team Sharing

```
1. Export your library
2. Share JSON file with team
3. They import (choose "Merge")
4. Everyone has the same prompts
```

## Troubleshooting

**Extension not showing up?**
- Restart Cursor/VS Code completely
- Check Extensions panel → Search "Prompt Pocket"

**Prompts not saving?**
- Open Developer Tools (Help menu)
- Check console for errors
- Export as backup, then re-import

**Keyboard shortcuts not working?**
- Check for conflicts in Keyboard Shortcuts settings
- Customize as needed

## Next Steps

- Read the full [README.md](README.md) for advanced features
- Check [CHANGELOG.md](CHANGELOG.md) for what's new
- Report issues on [GitHub](https://github.com/cazter/prompt-pocket/issues)

---

**Made something cool? Share it!** Export your prompt library and share it with the community.
