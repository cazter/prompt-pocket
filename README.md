# Prompt Pocket

A Visual Studio Code extension for managing prompts.

## Features

- Placeholder for extension features

## Requirements

- Visual Studio Code version 1.85.0 or higher
- Node.js 20.x or higher

## Extension Settings

This extension contributes the following settings:

- `prompt-pocket.helloWorld`: Sample command

## Development Setup

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Visual Studio Code

### Installation

1. Clone the repository:
```bash
git clone https://github.com/cazter/prompt-pocket.git
cd prompt-pocket
```

2. Install dependencies:
```bash
npm install
```

3. Open the project in Visual Studio Code:
```bash
code .
```

### Building

Compile TypeScript to JavaScript:
```bash
npm run compile
```

Or watch for changes:
```bash
npm run watch
```

### Testing

Run tests:
```bash
npm test
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to open a new window with your extension loaded
3. Run the command `Hello World` from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)

## Project Structure

```
prompt-pocket/
├── .vscode/                 # VS Code configuration
│   ├── launch.json          # Debug configuration
│   ├── tasks.json           # Build tasks
│   ├── settings.json        # Editor settings
│   └── extensions.json      # Recommended extensions
├── src/                     # Source files
│   └── extension.ts         # Extension entry point
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

## Technologies

- **TypeScript**: Type-safe JavaScript development
- **VS Code Extension API**: Integration with VS Code
- **ESLint**: Code linting and style checking
- **Mocha**: Testing framework

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

See the [LICENSE](LICENSE) file for details.