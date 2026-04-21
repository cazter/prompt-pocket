#!/bin/bash

# Prompt Pocket - Idempotent Local Installation Script
#
# Compiles, packages, and installs the extension into Cursor and/or VS Code
# from the local source tree. Useful for testing pre-release builds without
# going through a marketplace.
#
# By default this prompts you for which editor(s) to install into. You can
# also pass flags or env vars to skip the prompt — see --help.
#
# Re-runnable: existing installs are uninstalled first so re-running picks up
# new code automatically.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ----- Defaults / flag parsing -----------------------------------------------

# Tri-state: "" = ask the user, "true"/"false" = explicit
INSTALL_CURSOR="${INSTALL_CURSOR:-}"
INSTALL_VSCODE="${INSTALL_VSCODE:-}"
KEEP_VSIX="${KEEP_VSIX:-}"  # "" = ask, "true"/"false" = explicit
ASSUME_YES=false

for arg in "$@"; do
    case "$arg" in
        --cursor-only)  INSTALL_CURSOR=true;  INSTALL_VSCODE=false ;;
        --vscode-only)  INSTALL_CURSOR=false; INSTALL_VSCODE=true ;;
        --both)         INSTALL_CURSOR=true;  INSTALL_VSCODE=true ;;
        --keep-vsix)    KEEP_VSIX=true ;;
        --no-keep-vsix) KEEP_VSIX=false ;;
        -y|--yes)       ASSUME_YES=true ;;
        --help|-h)
            cat <<EOF
Usage: ./install.sh [options]

Builds the extension from source and installs it locally into Cursor and/or
VS Code. By default, prompts for which editor(s) to target.

Options:
  --cursor-only      Install into Cursor only (skip prompt)
  --vscode-only      Install into VS Code only (skip prompt)
  --both             Install into both editors (skip prompt)
  --keep-vsix        Keep the built .vsix after install (skip prompt)
  --no-keep-vsix     Delete the .vsix after install (skip prompt)
  -y, --yes          Assume "yes" to all prompts (uses --both, --keep-vsix)
  -h, --help         Show this help

Environment variables (override defaults, ignored if a flag is also passed):
  INSTALL_CURSOR=true|false
  INSTALL_VSCODE=true|false
  KEEP_VSIX=true|false
EOF
            exit 0
            ;;
    esac
done

if $ASSUME_YES; then
    [ -z "$INSTALL_CURSOR" ] && INSTALL_CURSOR=true
    [ -z "$INSTALL_VSCODE" ] && INSTALL_VSCODE=true
    [ -z "$KEEP_VSIX" ]      && KEEP_VSIX=true
fi

# Print helpers
print_step()    { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_info()    { echo -e "${CYAN}ℹ${NC} $1"; }

# ----- Editor CLI discovery --------------------------------------------------

# Common install locations per editor (macOS first, then *nix fallbacks).
CURSOR_CLI_PATHS=(
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    "/usr/local/bin/cursor"
    "$HOME/.cursor/bin/cursor"
    "$HOME/.local/bin/cursor"
)
VSCODE_CLI_PATHS=(
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    "/usr/local/bin/code"
    "/usr/bin/code"
    "$HOME/.local/bin/code"
)

# Resolve a usable CLI binary for an editor: returns the path, or empty if not
# found. Falls back to whatever is on $PATH.
find_editor_cli() {
    local cli_name="$1"; shift
    local paths=("$@")
    for p in "${paths[@]}"; do
        [ -x "$p" ] && { echo "$p"; return 0; }
    done
    if command -v "$cli_name" &> /dev/null; then
        command -v "$cli_name"
        return 0
    fi
    return 1
}

# ----- Editor selection ------------------------------------------------------

prompt_editor_selection() {
    # Probe what's actually installed so we can show a smarter prompt.
    local cursor_cli vscode_cli cursor_status vscode_status
    cursor_cli="$(find_editor_cli "cursor" "${CURSOR_CLI_PATHS[@]}" || true)"
    vscode_cli="$(find_editor_cli "code"   "${VSCODE_CLI_PATHS[@]}"   || true)"

    cursor_status=$([ -n "$cursor_cli" ] && echo "detected" || echo "not detected")
    vscode_status=$([ -n "$vscode_cli" ] && echo "detected" || echo "not detected")

    echo ""
    print_info "Where would you like to install Prompt Pocket?"
    echo "    1) Cursor only          (CLI $cursor_status)"
    echo "    2) VS Code only         (CLI $vscode_status)"
    echo "    3) Both Cursor and VS Code  (default)"
    echo "    4) Cancel"
    echo ""

    local choice
    read -p "$(echo -e ${YELLOW}Select [1-4, default=3]:${NC} )" -r choice
    case "$choice" in
        1)        INSTALL_CURSOR=true;  INSTALL_VSCODE=false ;;
        2)        INSTALL_CURSOR=false; INSTALL_VSCODE=true ;;
        3|"")     INSTALL_CURSOR=true;  INSTALL_VSCODE=true ;;
        4|q|Q)    print_warning "Cancelled."; exit 0 ;;
        *)        print_error "Invalid selection: '$choice'"; exit 1 ;;
    esac
}

# ----- Install into one editor -----------------------------------------------

install_into_editor() {
    local name="$1"
    local cli_name="$2"
    local cli_path="$3"
    local vsix_file="$4"
    local full_ext_id="$5"

    echo ""
    echo -e "${BLUE}━━ Installing into $name ━━${NC}"

    if [ -z "$cli_path" ]; then
        print_error "$name CLI ('$cli_name') not found in standard locations or on PATH."
        echo ""
        echo "  To install manually instead:"
        echo "    1. Open $name"
        echo "    2. Cmd+Shift+P (macOS) or Ctrl+Shift+P (Win/Linux)"
        echo "    3. Run 'Extensions: Install from VSIX...'"
        echo "    4. Select: $(pwd)/$vsix_file"
        return 1
    fi
    print_success "$name CLI: $cli_path"

    print_step "Checking for existing installation..."
    if "$cli_path" --list-extensions 2>/dev/null | grep -qx "$full_ext_id"; then
        print_warning "Existing $full_ext_id found, uninstalling..."
        "$cli_path" --uninstall-extension "$full_ext_id" >/dev/null 2>&1 || true
        print_success "Uninstalled existing version"
    else
        print_info "No existing installation"
    fi

    print_step "Installing $vsix_file into $name..."
    "$cli_path" --install-extension "$vsix_file" --force
    print_success "$name install complete"
    return 0
}

# ----- Main ------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Prompt Pocket - Local Build & Install${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Run this from the extension root."
        exit 1
    fi

    local extension_name extension_version publisher vsix_file full_ext_id
    extension_name=$(node -p "require('./package.json').name")
    extension_version=$(node -p "require('./package.json').version")
    publisher=$(node -p "require('./package.json').publisher")
    vsix_file="${extension_name}-${extension_version}.vsix"
    full_ext_id="${publisher}.${extension_name}"

    print_info "Building $full_ext_id v$extension_version"

    # Decide editors before building so we can fail fast if user cancels.
    if [ -z "$INSTALL_CURSOR" ] && [ -z "$INSTALL_VSCODE" ]; then
        prompt_editor_selection
    else
        # Fill any unset side as false so logic below is well-defined.
        [ -z "$INSTALL_CURSOR" ] && INSTALL_CURSOR=false
        [ -z "$INSTALL_VSCODE" ] && INSTALL_VSCODE=false
    fi

    if [ "$INSTALL_CURSOR" != "true" ] && [ "$INSTALL_VSCODE" != "true" ]; then
        print_error "No editor selected — nothing to do."
        exit 1
    fi

    # ---- Build pipeline ----
    print_step "Checking for pnpm..."
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed. Install it with: npm install -g pnpm"
        exit 1
    fi
    print_success "pnpm found"

    print_step "Installing dependencies..."
    pnpm install --silent
    print_success "Dependencies installed"

    print_step "Compiling TypeScript..."
    pnpm run compile
    print_success "TypeScript compiled"

    print_step "Checking for vsce..."
    # Prefer the locally-installed devDependency over a global install so we
    # use the version the project was tested against.
    local vsce_cmd=""
    if pnpm exec vsce --version >/dev/null 2>&1; then
        vsce_cmd="pnpm exec vsce"
        print_success "vsce found (local devDependency)"
    elif command -v vsce &> /dev/null; then
        vsce_cmd="vsce"
        print_success "vsce found (global)"
    else
        print_warning "vsce not found, installing globally..."
        pnpm add -g @vscode/vsce
        vsce_cmd="vsce"
        print_success "vsce installed"
    fi

    print_step "Packaging extension..."
    [ -f "$vsix_file" ] && rm "$vsix_file" && print_warning "Removed stale $vsix_file"
    $vsce_cmd package --no-dependencies
    print_success "Packaged: $vsix_file"

    # ---- Resolve CLIs and install ----
    local cursor_cli="" vscode_cli=""
    [ "$INSTALL_CURSOR" = "true" ] && cursor_cli="$(find_editor_cli "cursor" "${CURSOR_CLI_PATHS[@]}" || true)"
    [ "$INSTALL_VSCODE" = "true" ] && vscode_cli="$(find_editor_cli "code"   "${VSCODE_CLI_PATHS[@]}"   || true)"

    local cursor_ok=true vscode_ok=true
    if [ "$INSTALL_CURSOR" = "true" ]; then
        install_into_editor "Cursor" "cursor" "$cursor_cli" "$vsix_file" "$full_ext_id" || cursor_ok=false
    fi
    if [ "$INSTALL_VSCODE" = "true" ]; then
        install_into_editor "VS Code" "code" "$vscode_cli" "$vsix_file" "$full_ext_id" || vscode_ok=false
    fi

    # ---- VSIX cleanup ----
    echo ""
    if [ -z "$KEEP_VSIX" ]; then
        read -p "$(echo -e ${YELLOW}Keep the built ${vsix_file}? [y/N]:${NC} )" -n 1 -r
        echo
        [[ $REPLY =~ ^[Yy]$ ]] && KEEP_VSIX=true || KEEP_VSIX=false
    fi
    if [ "$KEEP_VSIX" != "true" ] && [ -f "$vsix_file" ]; then
        rm "$vsix_file"
        print_success "Removed $vsix_file"
    elif [ -f "$vsix_file" ]; then
        print_info "Kept $vsix_file"
    fi

    # ---- Summary ----
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Installation Summary${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    [ "$INSTALL_CURSOR" = "true" ] && { $cursor_ok && print_success "Cursor:  installed v$extension_version" || print_error  "Cursor:  install FAILED"; }
    [ "$INSTALL_VSCODE" = "true" ] && { $vscode_ok && print_success "VS Code: installed v$extension_version" || print_error  "VS Code: install FAILED"; }
    echo ""
    echo "Next steps:"
    echo "  1. Reload the affected editor(s) (Cmd+Shift+P → 'Developer: Reload Window')"
    echo "     or fully restart for icon / activation event changes"
    echo "  2. Look for the Prompt Pocket icon in the Activity Bar"
    echo "  3. Cmd+Alt+P (or Ctrl+Alt+P) to open the panel"
    echo ""

    # Non-zero exit if any selected install failed, so CI/scripts catch it.
    if { [ "$INSTALL_CURSOR" = "true" ] && ! $cursor_ok; } || { [ "$INSTALL_VSCODE" = "true" ] && ! $vscode_ok; }; then
        exit 2
    fi
}

main
