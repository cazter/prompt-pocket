# Contributing to Prompt Pocket

First off, thank you for considering contributing to Prompt Pocket! It's people like you that make this tool better for everyone.

## Code of Conduct

This project adheres to a simple principle: **Be respectful and constructive**. We're all here to build something useful together.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if applicable**
- **Include your environment details** (OS, VS Code/Cursor version, extension version)

Use the bug report template in `.github/ISSUE_TEMPLATE/bug_report.md`.

### Suggesting Features

Feature suggestions are welcome! Use the feature request template in `.github/ISSUE_TEMPLATE/feature_request.md`.

Before submitting:
- Check if the feature has already been suggested
- Provide a clear use case
- Explain why this feature would be useful to most users
- Consider if it aligns with the project's goal of being lightweight and focused

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Make your changes**:
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation
3. **Test your changes**:
   - Run `pnpm run compile` to check for TypeScript errors
   - Run `pnpm run lint` to check code style
   - Test in Extension Development Host (press F5)
4. **Commit your changes**:
   - Use clear, descriptive commit messages
   - Reference issues when applicable (e.g., "Fixes #123")
5. **Push to your fork** and submit a pull request
6. **Fill out the PR template** completely

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/prompt-pocket.git
cd prompt-pocket

# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Watch for changes (recommended during development)
pnpm run watch

# Run tests
pnpm test

# Lint code
pnpm run lint
```

## Development Workflow

1. **Branch naming**: Use descriptive names like `feature/search-improvements` or `fix/save-error`
2. **Make changes**: Edit TypeScript files in `src/`
3. **Test frequently**: Press F5 to test in Extension Development Host
4. **Lint before committing**: Run `pnpm run lint`
5. **Update CHANGELOG.md**: Add your changes under "Unreleased"

## Code Style Guidelines

### TypeScript

- **Use TypeScript features**: Leverage types, interfaces, and type guards
- **Strict mode**: All code should pass strict TypeScript checks
- **Async/await**: Prefer async/await over promises when possible
- **Error handling**: Always handle errors gracefully with try/catch
- **Comments**: Add comments for complex logic, not obvious code

### Naming Conventions

- **Files**: kebab-case (e.g., `tree-data-provider.ts`)
- **Classes**: PascalCase (e.g., `StorageService`)
- **Functions**: camelCase (e.g., `loadPrompts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STORAGE_KEY`)
- **Interfaces**: PascalCase (e.g., `PromptGroup`)

### File Organization

```typescript
// 1. Imports (grouped)
import * as vscode from 'vscode';
import { LocalModule } from './local';

// 2. Constants
const STORAGE_KEY = 'prompt-pocket-data';

// 3. Interfaces/Types
interface MyInterface {
    // ...
}

// 4. Classes/Functions
export class MyClass {
    // ...
}

// 5. Helper functions (private)
function helperFunction() {
    // ...
}
```

### VS Code Extension Best Practices

- **Use native APIs**: Prefer TreeView over webviews for performance
- **Handle errors**: Show user-friendly error messages
- **Dispose resources**: Always dispose of event listeners and resources
- **Async operations**: Use async for I/O operations
- **Context**: Store state in proper VS Code contexts (GlobalState, WorkspaceState)

## Testing

- **Add tests for new features**: Update `test/suite/extension.test.ts`
- **Test manually**: Use Extension Development Host (F5)
- **Test edge cases**: Empty states, large datasets, invalid input
- **Check different themes**: Test with light and dark themes

## Documentation

- **Update README.md**: For user-facing changes
- **Update CHANGELOG.md**: For all changes (features, fixes, improvements)
- **Add JSDoc comments**: For public APIs and complex functions
- **Code comments**: Explain *why*, not *what*

## Project Structure

```
prompt-pocket/
├── src/
│   ├── extension.ts        # Extension activation and command handlers
│   ├── storage.ts          # Data persistence layer
│   ├── treeDataProvider.ts # TreeView data provider
│   └── types.ts            # TypeScript type definitions
├── test/
│   └── suite/
│       └── extension.test.ts # Test suite
├── resources/
│   └── icon.svg            # Activity bar icon
└── package.json            # Extension manifest
```

### Key Files

- **extension.ts**: Command registration, main logic
- **storage.ts**: All data persistence operations
- **treeDataProvider.ts**: TreeView implementation
- **types.ts**: Shared type definitions and validators
- **package.json**: Extension manifest (commands, menus, metadata)

## Review Process

1. **Automated checks**: Ensure CI passes (TypeScript compile, lint, tests)
2. **Code review**: Maintainer will review your code
3. **Feedback**: Address any requested changes
4. **Merge**: Once approved, your PR will be merged

## Release Process

Releases are handled by maintainers:

1. Update version in `package.json`: `npm version [patch|minor|major]`
2. Update `CHANGELOG.md` with release date and changes
3. Run `./publish.sh` to publish to marketplace
4. Create GitHub release with release notes
5. Announce on relevant channels

See [PUBLISHING.md](PUBLISHING.md) for detailed publishing instructions.

## Questions?

- **General questions**: Open a discussion or issue
- **Security issues**: Email directly (see package.json)
- **Feature ideas**: Open a feature request

## Recognition

Contributors will be:
- Listed in release notes
- Credited in the README (for significant contributions)
- Thanked publicly in release announcements

Thank you for contributing to Prompt Pocket! 🎉
