#!/bin/bash

# Prompt Pocket - Idempotent Installation Script for Cursor
# This script compiles, packages, and installs the extension to Cursor
# Can be run multiple times to update the extension

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Extension details
EXTENSION_NAME="prompt-pocket"
EXTENSION_VERSION=$(node -p "require('./package.json').version")
PUBLISHER=$(node -p "require('./package.json').publisher")
VSIX_FILE="${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix"

# Cursor CLI paths (common locations)
CURSOR_CLI_PATHS=(
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    "/usr/local/bin/cursor"
    "$HOME/.cursor/bin/cursor"
)

# Function to print colored output
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

# Function to find Cursor CLI
find_cursor_cli() {
    for path in "${CURSOR_CLI_PATHS[@]}"; do
        if [ -f "$path" ]; then
            echo "$path"
            return 0
        fi
    done
    return 1
}

# Main installation process
main() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Prompt Pocket - Installation Script for Cursor${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the extension root directory."
        exit 1
    fi

    # Step 1: Check for pnpm
    print_step "Checking for pnpm..."
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed. Please install it first:"
        echo "  npm install -g pnpm"
        exit 1
    fi
    print_success "pnpm found"

    # Step 2: Install dependencies
    print_step "Installing dependencies..."
    pnpm install --silent
    print_success "Dependencies installed"

    # Step 3: Compile TypeScript
    print_step "Compiling TypeScript..."
    pnpm run compile
    print_success "TypeScript compiled"

    # Step 4: Check for vsce (VS Code Extension Manager)
    print_step "Checking for vsce..."
    if ! command -v vsce &> /dev/null; then
        print_warning "vsce not found, installing globally..."
        pnpm add -g @vscode/vsce
        print_success "vsce installed"
    else
        print_success "vsce found"
    fi

    # Step 5: Package extension
    print_step "Packaging extension..."
    if [ -f "$VSIX_FILE" ]; then
        rm "$VSIX_FILE"
        print_warning "Removed existing $VSIX_FILE"
    fi
    
    vsce package --no-dependencies
    print_success "Extension packaged as $VSIX_FILE"

    # Step 6: Find Cursor CLI
    print_step "Locating Cursor CLI..."
    CURSOR_CLI=$(find_cursor_cli)
    
    if [ -z "$CURSOR_CLI" ]; then
        print_warning "Cursor CLI not found in standard locations."
        print_warning "Trying to use 'cursor' from PATH..."
        
        if command -v cursor &> /dev/null; then
            CURSOR_CLI="cursor"
            print_success "Found cursor in PATH"
        else
            print_error "Could not find Cursor CLI. Please ensure Cursor is installed."
            echo ""
            echo "To install the extension manually:"
            echo "  1. Open Cursor"
            echo "  2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)"
            echo "  3. Type 'Extensions: Install from VSIX'"
            echo "  4. Select: $(pwd)/$VSIX_FILE"
            exit 1
        fi
    else
        print_success "Found Cursor CLI at: $CURSOR_CLI"
    fi

    # Step 7: Uninstall existing version (if any)
    print_step "Checking for existing installation..."
    FULL_EXTENSION_ID="${PUBLISHER}.${EXTENSION_NAME}"
    
    if "$CURSOR_CLI" --list-extensions | grep -q "$FULL_EXTENSION_ID"; then
        print_warning "Existing installation found, uninstalling..."
        "$CURSOR_CLI" --uninstall-extension "$FULL_EXTENSION_ID" 2>/dev/null || true
        print_success "Uninstalled existing version"
    else
        print_success "No existing installation found"
    fi

    # Step 8: Install extension
    print_step "Installing extension to Cursor..."
    "$CURSOR_CLI" --install-extension "$VSIX_FILE"
    print_success "Extension installed successfully!"

    # Step 9: Cleanup (optional)
    read -p "$(echo -e ${YELLOW}Do you want to keep the .vsix file? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        rm "$VSIX_FILE"
        print_success "Cleaned up $VSIX_FILE"
    fi

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    print_success "Prompt Pocket v${EXTENSION_VERSION} is now installed in Cursor"
    echo ""
    echo "Next steps:"
    echo "  1. Restart Cursor (or reload window: Cmd+Shift+P > 'Reload Window')"
    echo "  2. Look for the Prompt Pocket icon in the Activity Bar (left sidebar)"
    echo "  3. Start organizing your prompts!"
    echo ""
    print_warning "Note: If you don't see the extension, try restarting Cursor completely."
    echo ""
}

# Run main function
main
