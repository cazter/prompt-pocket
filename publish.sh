#!/bin/bash

# Prompt Pocket - Marketplace Publishing Script
#
# Publishes the extension to BOTH:
#   1. Visual Studio Marketplace (used by VS Code)            — via `vsce`
#   2. Open VSX Registry          (used by Cursor, VSCodium,
#                                   Gitpod, code-server, etc.) — via `ovsx`
#
# Both registries are fed the SAME `.vsix` artifact so installs are identical
# across editors. Open VSX exists because Microsoft's Marketplace ToS
# prohibits non-Microsoft products from accessing it directly, so VS Code
# forks like Cursor pull from Open VSX instead.

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

# Toggles (env or CLI flag). Default: publish to both.
PUBLISH_VSCE=${PUBLISH_VSCE:-true}
PUBLISH_OVSX=${PUBLISH_OVSX:-true}

for arg in "$@"; do
    case "$arg" in
        --skip-vsce|--ovsx-only) PUBLISH_VSCE=false ;;
        --skip-ovsx|--vsce-only) PUBLISH_OVSX=false ;;
        --help|-h)
            cat <<EOF
Usage: ./publish.sh [options]

Options:
  --skip-ovsx, --vsce-only    Publish only to Visual Studio Marketplace
  --skip-vsce, --ovsx-only    Publish only to Open VSX (Cursor / VSCodium)
  -h, --help                  Show this help

Required environment variables:
  VSCE_PAT    Personal Access Token for Visual Studio Marketplace
  OVSX_PAT    Personal Access Token for Open VSX Registry

Either token can be omitted if the corresponding registry is skipped.
EOF
            exit 0
            ;;
    esac
done

# Function to print colored output
print_step()    { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_info()    { echo -e "${CYAN}ℹ${NC} $1"; }

# ----- Token checks -----------------------------------------------------------

check_vsce_pat() {
    if [ -z "$VSCE_PAT" ]; then
        print_error "VSCE_PAT environment variable not set"
        echo ""
        echo "To publish to the Visual Studio Marketplace, you need a Personal Access Token:"
        echo "  1. Go to https://dev.azure.com"
        echo "  2. User Settings → Personal Access Tokens → New Token"
        echo "  3. Name: 'VS Code Marketplace'"
        echo "  4. Organization: 'All accessible organizations'"
        echo "  5. Scopes: 'Marketplace' → 'Manage'"
        echo ""
        echo "Then export it:"
        echo "  export VSCE_PAT='your-token-here'"
        echo ""
        echo "Tip: pass --skip-vsce to skip this registry."
        exit 1
    fi
}

check_ovsx_pat() {
    if [ -z "$OVSX_PAT" ]; then
        print_error "OVSX_PAT environment variable not set"
        echo ""
        echo "To publish to Open VSX (used by Cursor, VSCodium, Gitpod, code-server, etc.):"
        echo "  1. Go to https://open-vsx.org and sign in with GitHub or Eclipse account"
        echo "  2. Click your avatar → Settings → 'Publisher Agreement' (sign it once per account)"
        echo "  3. Click your avatar → Settings → 'Namespaces' → create namespace '$PUBLISHER'"
        echo "     (must exactly match the 'publisher' field in package.json)"
        echo "  4. Click your avatar → Settings → 'Access Tokens' → 'Generate New Token'"
        echo ""
        echo "Then export it:"
        echo "  export OVSX_PAT='your-token-here'"
        echo ""
        echo "Tip: pass --skip-ovsx to skip this registry."
        exit 1
    fi
}

# ----- Publisher / namespace verification -------------------------------------

check_vsce_publisher() {
    print_step "Verifying VS Marketplace publisher registration..."
    if ! vsce publishers list 2>/dev/null | grep -q "$PUBLISHER"; then
        print_warning "Publisher '$PUBLISHER' may not be registered on the Visual Studio Marketplace"
        echo ""
        echo "To register a publisher:"
        echo "  1. Go to https://marketplace.visualstudio.com/manage"
        echo "  2. Sign in with the same account you used for the PAT"
        echo "  3. Click 'Create publisher' and use publisher ID: '$PUBLISHER'"
        echo ""
        read -p "$(echo -e ${YELLOW}Have you registered this publisher? [y/N]:${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Please register the publisher first"
            exit 1
        fi
    else
        print_success "VS Marketplace publisher verified"
    fi
}

# ----- Version verification ---------------------------------------------------

verify_version_vsce() {
    print_step "Checking VS Marketplace version..."
    local current
    current=$(vsce show "$PUBLISHER.$EXTENSION_NAME" --json 2>/dev/null \
        | node -p "JSON.parse(require('fs').readFileSync(0, 'utf-8')).versions[0].version" 2>/dev/null \
        || echo "none")

    if [ "$current" != "none" ]; then
        print_info "VS Marketplace current: $current — new: $EXTENSION_VERSION"
        if [ "$current" = "$EXTENSION_VERSION" ]; then
            print_error "Version $EXTENSION_VERSION is already published to the VS Marketplace"
            echo "Bump the version in package.json before re-running."
            exit 1
        fi
    else
        print_info "First publication to the VS Marketplace"
    fi
    print_success "Version $EXTENSION_VERSION OK for VS Marketplace"
}

verify_version_ovsx() {
    print_step "Checking Open VSX version..."
    local current
    current=$(curl -fsSL "https://open-vsx.org/api/$PUBLISHER/$EXTENSION_NAME" 2>/dev/null \
        | node -p "JSON.parse(require('fs').readFileSync(0, 'utf-8')).version" 2>/dev/null \
        || echo "none")

    if [ "$current" != "none" ] && [ "$current" != "undefined" ]; then
        print_info "Open VSX current: $current — new: $EXTENSION_VERSION"
        if [ "$current" = "$EXTENSION_VERSION" ]; then
            print_warning "Version $EXTENSION_VERSION is already published to Open VSX"
            print_warning "Will skip Open VSX publish step."
            PUBLISH_OVSX=false
            return
        fi
    else
        print_info "First publication to Open VSX (or namespace not yet created)"
    fi
    print_success "Version $EXTENSION_VERSION OK for Open VSX"
}

# ----- Tooling checks ---------------------------------------------------------

ensure_vsce() {
    if ! command -v vsce &> /dev/null; then
        print_warning "vsce not found globally; using local devDependency via pnpm exec"
        VSCE_CMD="pnpm exec vsce"
    else
        VSCE_CMD="vsce"
    fi
}

ensure_ovsx() {
    if ! command -v ovsx &> /dev/null; then
        print_warning "ovsx not found globally; using local devDependency via pnpm exec"
        OVSX_CMD="pnpm exec ovsx"
    else
        OVSX_CMD="ovsx"
    fi
}

# ----- Main workflow ----------------------------------------------------------

main() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Prompt Pocket - Marketplace Publishing${NC}"
    echo -e "${BLUE}  Targets: $( [ "$PUBLISH_VSCE" = "true" ] && echo -n "VS Marketplace " )$( [ "$PUBLISH_OVSX" = "true" ] && echo -n "Open VSX (Cursor/VSCodium)" )${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ "$PUBLISH_VSCE" != "true" ] && [ "$PUBLISH_OVSX" != "true" ]; then
        print_error "Both registries skipped — nothing to do."
        exit 1
    fi

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

    # Step 3: Install dependencies (also brings in vsce/ovsx via devDependencies)
    print_step "Installing dependencies..."
    pnpm install --frozen-lockfile
    print_success "Dependencies installed"

    # Step 4: Tooling resolution
    [ "$PUBLISH_VSCE" = "true" ] && ensure_vsce
    [ "$PUBLISH_OVSX" = "true" ] && ensure_ovsx

    # Step 5: Token checks
    [ "$PUBLISH_VSCE" = "true" ] && check_vsce_pat
    [ "$PUBLISH_OVSX" = "true" ] && check_ovsx_pat

    # Step 6: Publisher / version verification
    [ "$PUBLISH_VSCE" = "true" ] && check_vsce_publisher
    [ "$PUBLISH_VSCE" = "true" ] && verify_version_vsce
    [ "$PUBLISH_OVSX" = "true" ] && verify_version_ovsx

    # Step 7: Lint
    print_step "Running linter..."
    if ! pnpm run lint; then
        print_error "Linting failed. Please fix errors before publishing."
        exit 1
    fi
    print_success "Linting passed"

    # Step 8: Compile
    print_step "Compiling TypeScript..."
    pnpm run compile
    print_success "TypeScript compiled"

    # Step 9: Tests (skipped — requires display server)
    print_step "Running tests..."
    print_warning "Skipping tests (requires display server)"

    # Step 10: Pre-publish checklist
    echo ""
    print_warning "Pre-publish checklist:"
    echo "  - [ ] CHANGELOG.md updated for version $EXTENSION_VERSION"
    echo "  - [ ] README.md reflects all current features"
    echo "  - [ ] package.json version is correct: $EXTENSION_VERSION"
    echo "  - [ ] All changes committed to git"
    echo ""
    read -p "$(echo -e ${YELLOW}Continue with publishing? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Publishing cancelled"
        exit 0
    fi

    # Step 11: Package extension (build the .vsix once, push to both registries)
    print_step "Packaging extension..."
    VSIX_FILE="${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix"
    if [ -f "$VSIX_FILE" ]; then
        rm "$VSIX_FILE"
        print_warning "Removed existing $VSIX_FILE"
    fi
    # Use vsce to build the package; if vsce-only is disabled we still need the
    # .vsix for ovsx, so we install vsce on demand for the build step.
    if [ -z "$VSCE_CMD" ]; then
        ensure_vsce
    fi
    $VSCE_CMD package --no-dependencies
    print_success "Extension packaged: $VSIX_FILE"

    # Step 12: Publish to Visual Studio Marketplace
    if [ "$PUBLISH_VSCE" = "true" ]; then
        echo ""
        print_step "Publishing to Visual Studio Marketplace..."
        print_info "Publishing $PUBLISHER.$EXTENSION_NAME@$EXTENSION_VERSION..."
        $VSCE_CMD publish --packagePath "$VSIX_FILE" -p "$VSCE_PAT"
        print_success "Published to Visual Studio Marketplace"
    fi

    # Step 13: Publish to Open VSX (Cursor / VSCodium / etc.)
    if [ "$PUBLISH_OVSX" = "true" ]; then
        echo ""
        print_step "Publishing to Open VSX Registry..."
        print_info "Publishing $PUBLISHER.$EXTENSION_NAME@$EXTENSION_VERSION..."
        # ovsx publish reads the .vsix metadata; -p supplies the PAT.
        if ! $OVSX_CMD publish "$VSIX_FILE" -p "$OVSX_PAT"; then
            print_error "Open VSX publish failed."
            print_warning "If this is your first publish, ensure the namespace '$PUBLISHER' exists at:"
            print_warning "  https://open-vsx.org/user-settings/namespaces"
            exit 1
        fi
        print_success "Published to Open VSX (available in Cursor / VSCodium within minutes)"
    fi

    # Step 14: Git tag
    echo ""
    read -p "$(echo -e ${YELLOW}Create git tag v${EXTENSION_VERSION}? [Y/n]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        if git rev-parse "v${EXTENSION_VERSION}" >/dev/null 2>&1; then
            print_warning "Tag v${EXTENSION_VERSION} already exists locally — skipping tag creation"
        else
            git tag "v${EXTENSION_VERSION}"
            print_success "Git tag created: v${EXTENSION_VERSION}"
        fi

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
    [ "$PUBLISH_VSCE" = "true" ] && echo "  - VS Code:           https://marketplace.visualstudio.com/items?itemName=$PUBLISHER.$EXTENSION_NAME"
    [ "$PUBLISH_OVSX" = "true" ] && echo "  - Cursor / VSCodium: https://open-vsx.org/extension/$PUBLISHER/$EXTENSION_NAME"
    echo "  - Allow ~5–15 minutes for marketplace caches to refresh."
    echo "  - Create a GitHub release: https://github.com/cazter/prompt-pocket/releases/new"
    echo ""
    print_info "Install in VS Code: code --install-extension $PUBLISHER.$EXTENSION_NAME"
    print_info "Install in Cursor:  cursor --install-extension $PUBLISHER.$EXTENSION_NAME"
    echo ""
}

main
