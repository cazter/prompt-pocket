#!/bin/bash

# Prompt Pocket - Complete Uninstall and Clean Script
#
# Removes the extension and all of its cached / persisted data from BOTH:
#   - Cursor (uses the Open VSX registry; ~/.cursor/extensions, etc.)
#   - VS Code (uses the Visual Studio Marketplace; ~/.vscode/extensions, etc.)
#
# It also clears the extension's entries from each editor's globalStorage
# directory and the SQLite "globalState" database, since simply uninstalling
# the extension does NOT remove user data — your prompts will reappear if you
# reinstall without cleaning.
#
# Supported on macOS and Linux. Pass --help for usage details.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Toggles (env or CLI flag). Default: clean BOTH editors.
CLEAN_CURSOR=${CLEAN_CURSOR:-true}
CLEAN_VSCODE=${CLEAN_VSCODE:-true}

# Known extension IDs to clean up. Order matters: current ID first, then legacy
# IDs from earlier development versions. All matches are removed.
EXT_IDS=("cazter.prompt-pocket" "prompt-pocket.prompt-pocket")
# Substring used for filesystem matching of extension folders (vsce installs
# them as "<publisher>.<name>-<version>", so this matches every variant).
EXT_NAME_MATCH="prompt-pocket"

for arg in "$@"; do
    case "$arg" in
        --cursor-only)  CLEAN_VSCODE=false ;;
        --vscode-only)  CLEAN_CURSOR=false ;;
        --help|-h)
            cat <<EOF
Usage: ./uninstall-clean.sh [options]

Removes Prompt Pocket and ALL of its persisted data (prompts, settings, etc.)
from both Cursor and VS Code.

Options:
  --cursor-only    Clean only Cursor; leave VS Code untouched
  --vscode-only    Clean only VS Code; leave Cursor untouched
  -h, --help       Show this help

The script will:
  1. Run the editor CLI to uninstall the extension (cursor / code)
  2. Remove any leftover extension folders from ~/.{cursor,vscode}/extensions
  3. Remove globalStorage data (your stored prompts)
  4. Delete prompt-pocket entries from the editor's globalState SQLite DB
  5. Surface any remaining JSON references for manual review

You will be asked to restart each editor at the end.
EOF
            exit 0
            ;;
    esac
done

# Print helpers
print_step()    { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_info()    { echo -e "${CYAN}ℹ${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }

# ----- Per-editor configuration ----------------------------------------------
#
# Each editor exposes:
#   <prefix>_NAME            human-readable name
#   <prefix>_CLI             CLI binary used for --uninstall-extension
#   <prefix>_EXTENSIONS_DIR  per-user extensions folder
#   <prefix>_USER_DATA       per-user app-support folder ("User")
#
# We resolve the user-data path per-OS at runtime since macOS and Linux differ.

resolve_user_data_dir() {
    # $1 = "Cursor" or "Code" (the macOS app-support folder name)
    # $2 = lowercase fallback for ~/.config on Linux ("Cursor" or "Code")
    local mac_name="$1"
    local linux_name="$2"
    case "$(uname -s)" in
        Darwin)
            echo "$HOME/Library/Application Support/$mac_name/User"
            ;;
        Linux)
            echo "$HOME/.config/$linux_name/User"
            ;;
        *)
            # Best-effort fallback (Windows users would set this manually)
            echo "$HOME/.config/$linux_name/User"
            ;;
    esac
}

CURSOR_NAME="Cursor"
CURSOR_CLI="cursor"
CURSOR_EXTENSIONS_DIR="$HOME/.cursor/extensions"
CURSOR_USER_DATA="$(resolve_user_data_dir "Cursor" "Cursor")"

VSCODE_NAME="VS Code"
VSCODE_CLI="code"
VSCODE_EXTENSIONS_DIR="$HOME/.vscode/extensions"
VSCODE_USER_DATA="$(resolve_user_data_dir "Code" "Code")"

# ----- Per-editor cleanup function -------------------------------------------

clean_editor() {
    local name="$1"
    local cli="$2"
    local ext_dir="$3"
    local user_data="$4"
    local global_storage="$user_data/globalStorage"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Cleaning $name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    print_info "Extensions dir: $ext_dir"
    print_info "User data dir:  $user_data"

    # 1. Uninstall via CLI for every known extension ID
    print_step "Uninstalling via $cli CLI..."
    if command -v "$cli" &> /dev/null; then
        local any_uninstalled=false
        for ext_id in "${EXT_IDS[@]}"; do
            if "$cli" --list-extensions 2>/dev/null | grep -qx "$ext_id"; then
                "$cli" --uninstall-extension "$ext_id" >/dev/null 2>&1 \
                    && print_success "  Uninstalled $ext_id" \
                    || print_warning "  Failed to uninstall $ext_id"
                any_uninstalled=true
            fi
        done
        $any_uninstalled || print_info "  No installed prompt-pocket extension found"
    else
        print_warning "  '$cli' CLI not found on PATH; skipping CLI uninstall"
        print_info "  (Filesystem cleanup below will still remove the extension)"
    fi

    # 2. Remove leftover extension folders (covers manual VSIX installs and
    #    cases where the CLI uninstall left orphan files).
    print_step "Removing extension folders from $ext_dir..."
    if [ -d "$ext_dir" ]; then
        local found=false
        while IFS= read -r dir; do
            [ -z "$dir" ] && continue
            print_info "  Removing $dir"
            rm -rf "$dir"
            found=true
        done < <(find "$ext_dir" -maxdepth 1 -type d -name "*${EXT_NAME_MATCH}*" 2>/dev/null)
        $found && print_success "  Done" || print_info "  No matching folders"
    else
        print_info "  Extensions directory does not exist (skipping)"
    fi

    # 3. Remove globalStorage data (where your prompts are persisted)
    print_step "Removing globalStorage data..."
    if [ -d "$global_storage" ]; then
        local found=false
        for ext_id in "${EXT_IDS[@]}"; do
            if [ -d "$global_storage/$ext_id" ]; then
                print_info "  Removing $global_storage/$ext_id"
                rm -rf "$global_storage/$ext_id"
                found=true
            fi
        done
        $found && print_success "  Done" || print_info "  No globalStorage folder found"
    else
        print_info "  globalStorage directory does not exist (skipping)"
    fi

    # 4. Clear globalState entries from the editor's SQLite state DB
    print_step "Clearing globalState entries from state.vscdb..."
    local state_db="$global_storage/state.vscdb"
    if [ -f "$state_db" ]; then
        if command -v sqlite3 &> /dev/null; then
            local matches
            matches=$(sqlite3 "$state_db" \
                "SELECT key FROM ItemTable WHERE key LIKE '%prompt-pocket%' OR key LIKE '%cazter.prompt-pocket%';" \
                2>/dev/null || true)
            if [ -n "$matches" ]; then
                echo "$matches" | sed 's/^/  - /'
                sqlite3 "$state_db" \
                    "DELETE FROM ItemTable WHERE key LIKE '%prompt-pocket%' OR key LIKE '%cazter.prompt-pocket%';" \
                    2>/dev/null \
                    && print_success "  Deleted globalState entries" \
                    || print_warning "  sqlite3 delete failed (DB locked? Close $name first)"
            else
                print_info "  No prompt-pocket entries found"
            fi
        else
            print_warning "  sqlite3 not installed (install with: brew install sqlite or apt install sqlite3)"
        fi
    else
        print_info "  state.vscdb not found at $state_db"
    fi

    # 5. Surface any remaining JSON references for manual review
    print_step "Scanning for any remaining JSON references..."
    if [ -d "$user_data" ]; then
        local refs
        refs=$(grep -rl "prompt-pocket" "$user_data" --include="*.json" 2>/dev/null | head -10 || true)
        if [ -n "$refs" ]; then
            print_warning "  Found references in (review manually if needed):"
            echo "$refs" | sed 's/^/    /'
        else
            print_success "  No remaining JSON references"
        fi
    fi
}

# ----- Main -------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Prompt Pocket - Complete Uninstall${NC}"
    echo -e "${BLUE}  Targets: $( [ "$CLEAN_CURSOR" = "true" ] && echo -n "Cursor " )$( [ "$CLEAN_VSCODE" = "true" ] && echo -n "VS Code" )${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$CLEAN_CURSOR" != "true" ] && [ "$CLEAN_VSCODE" != "true" ]; then
        print_error "Both editors skipped — nothing to do."
        exit 1
    fi

    print_warning "This will permanently delete all stored Prompt Pocket prompts and settings."
    print_warning "If you want a backup, export your prompts first via the panel toolbar."
    echo ""
    read -p "$(echo -e ${YELLOW}Continue? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Cancelled."
        exit 0
    fi

    [ "$CLEAN_CURSOR" = "true" ] && clean_editor "$CURSOR_NAME" "$CURSOR_CLI" "$CURSOR_EXTENSIONS_DIR" "$CURSOR_USER_DATA"
    [ "$CLEAN_VSCODE" = "true" ] && clean_editor "$VSCODE_NAME" "$VSCODE_CLI" "$VSCODE_EXTENSIONS_DIR" "$VSCODE_USER_DATA"

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Uninstall Complete${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    print_warning "IMPORTANT: Fully quit each affected editor (Cmd+Q on macOS) and reopen"
    print_warning "for changes to take effect. Reload Window is NOT enough — the SQLite"
    print_warning "globalState is cached in memory until the editor process exits."
    echo ""
}

main
