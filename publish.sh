#!/bin/bash

# Prompt Pocket - VS Code Marketplace Publishing Script
# This script handles the complete publishing workflow to the VS Code Marketplace

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Extension details
EXTENSION_NAME=$(node -p "require('./package.json').name")
EXTENSION_VERSION=$(node -p "require('./package.json').version")
PUBLISHER=$(node -p "require('./package.json').publisher")

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

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Function to check if PAT is configured
check_pat() {
    if [ -z "$VSCE_PAT" ]; then
        print_error "VSCE_PAT environment variable not set"
        echo ""
        echo "To publish to the VS Code Marketplace, you need a Personal Access Token (PAT)."
        echo ""
        echo "Setup instructions:"
        echo "  1. Go to https://dev.azure.com"
        echo "  2. Create an organization (if you don't have one)"
        echo "  3. Go to User Settings > Personal Access Tokens"
        echo "  4. Click 'New Token'"
        echo "  5. Name: 'VS Code Marketplace'"
        echo "  6. Organization: 'All accessible organizations'"
        echo "  7. Scopes: 'Marketplace' > 'Manage'"
        echo "  8. Click 'Create'"
        echo ""
        echo "Then set the token as an environment variable:"
        echo "  export VSCE_PAT='your-token-here'"
        echo ""
        echo "Or add it to your ~/.bashrc or ~/.zshrc:"
        echo "  echo 'export VSCE_PAT=\"your-token-here\"' >> ~/.bashrc"
        echo ""
        exit 1
    fi
}

# Function to check if publisher is registered
check_publisher() {
    print_step "Verifying publisher registration..."
    
    if ! vsce publishers list 2>/dev/null | grep -q "$PUBLISHER"; then
        print_warning "Publisher '$PUBLISHER' may not be registered"
        echo ""
        echo "To register a publisher:"
        echo "  1. Go to https://marketplace.visualstudio.com/manage"
        echo "  2. Sign in with the same account you used for the PAT"
        echo "  3. Click 'Create publisher'"
        echo "  4. Use publisher ID: '$PUBLISHER'"
        echo ""
        read -p "$(echo -e ${YELLOW}Have you registered this publisher? [y/N]:${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Please register the publisher first"
            exit 1
        fi
    else
        print_success "Publisher verified"
    fi
}

# Function to verify version
verify_version() {
    print_step "Checking version..."
    
    # Try to get the current published version
    CURRENT_VERSION=$(vsce show "$PUBLISHER.$EXTENSION_NAME" --json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0, 'utf-8')).versions[0].version" 2>/dev/null || echo "none")
    
    if [ "$CURRENT_VERSION" != "none" ]; then
        print_info "Current published version: $CURRENT_VERSION"
        print_info "New version to publish: $EXTENSION_VERSION"
        
        # Simple version comparison
        if [ "$CURRENT_VERSION" = "$EXTENSION_VERSION" ]; then
            print_error "Version $EXTENSION_VERSION is already published"
            echo ""
            echo "Please update the version in package.json:"
            echo "  - Patch (bug fix): npm version patch"
            echo "  - Minor (new feature): npm version minor"
            echo "  - Major (breaking change): npm version major"
            echo ""
            exit 1
        fi
    else
        print_info "This appears to be the first publication"
    fi
    
    print_success "Version $EXTENSION_VERSION is ready to publish"
}

# Main publishing workflow
main() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Prompt Pocket - VS Code Marketplace Publishing${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Step 1: Verify we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Run this script from the extension root."
        exit 1
    fi

    # Step 2: Check for pnpm
    print_step "Checking for pnpm..."
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed"
        exit 1
    fi
    print_success "pnpm found"

    # Step 3: Check for vsce
    print_step "Checking for vsce..."
    if ! command -v vsce &> /dev/null; then
        print_warning "vsce not found, installing..."
        pnpm add -g @vscode/vsce
        print_success "vsce installed"
    else
        print_success "vsce found"
    fi

    # Step 4: Check PAT
    check_pat

    # Step 5: Verify publisher
    check_publisher

    # Step 6: Verify version
    verify_version

    # Step 7: Clean install
    print_step "Installing dependencies..."
    pnpm install --frozen-lockfile
    print_success "Dependencies installed"

    # Step 8: Lint
    print_step "Running linter..."
    if ! pnpm run lint; then
        print_error "Linting failed. Please fix errors before publishing."
        exit 1
    fi
    print_success "Linting passed"

    # Step 9: Compile
    print_step "Compiling TypeScript..."
    pnpm run compile
    print_success "TypeScript compiled"

    # Step 10: Run tests
    print_step "Running tests..."
    print_warning "Skipping tests (requires display server)"
    # Uncomment if you have headless test setup:
    # if ! pnpm run test; then
    #     print_error "Tests failed. Please fix before publishing."
    #     exit 1
    # fi
    # print_success "Tests passed"

    # Step 11: Show changelog prompt
    echo ""
    print_warning "Pre-publish checklist:"
    echo "  - [ ] CHANGELOG.md updated for version $EXTENSION_VERSION"
    echo "  - [ ] README.md reflects all current features"
    echo "  - [ ] package.json version is correct: $EXTENSION_VERSION"
    echo "  - [ ] All changes committed to git"
    echo "  - [ ] Tests pass locally"
    echo ""
    read -p "$(echo -e ${YELLOW}Continue with publishing? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Publishing cancelled"
        exit 0
    fi

    # Step 12: Package extension
    print_step "Packaging extension..."
    VSIX_FILE="${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix"
    if [ -f "$VSIX_FILE" ]; then
        rm "$VSIX_FILE"
        print_warning "Removed existing $VSIX_FILE"
    fi
    vsce package --no-dependencies
    print_success "Extension packaged: $VSIX_FILE"

    # Step 13: Publish
    print_step "Publishing to VS Code Marketplace..."
    echo ""
    print_info "Publishing $PUBLISHER.$EXTENSION_NAME@$EXTENSION_VERSION..."
    echo ""
    
    vsce publish --packagePath "$VSIX_FILE" -p "$VSCE_PAT"
    
    print_success "Published successfully!"

    # Step 14: Create git tag
    echo ""
    read -p "$(echo -e ${YELLOW}Create git tag v${EXTENSION_VERSION}? [Y/n]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        git tag "v${EXTENSION_VERSION}"
        print_success "Git tag created: v${EXTENSION_VERSION}"
        
        read -p "$(echo -e ${YELLOW}Push tag to remote? [Y/n]:${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            git push origin "v${EXTENSION_VERSION}"
            print_success "Tag pushed to remote"
        fi
    fi

    # Step 15: Keep VSIX file?
    echo ""
    read -p "$(echo -e ${YELLOW}Keep $VSIX_FILE file? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        rm "$VSIX_FILE"
        print_success "Cleaned up $VSIX_FILE"
    fi

    # Success summary
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Publishing Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    print_success "Extension published: $PUBLISHER.$EXTENSION_NAME@$EXTENSION_VERSION"
    echo ""
    echo "Next steps:"
    echo "  1. Check marketplace: https://marketplace.visualstudio.com/items?itemName=$PUBLISHER.$EXTENSION_NAME"
    echo "  2. Extension will be available in ~5-10 minutes"
    echo "  3. Create GitHub release: https://github.com/cazter/prompt-pocket/releases/new"
    echo "  4. Announce the release!"
    echo ""
    print_info "Users can install with: code --install-extension $PUBLISHER.$EXTENSION_NAME"
    echo ""
}

# Run main function
main
