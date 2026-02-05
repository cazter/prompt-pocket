#!/bin/bash

# Prompt Pocket - Complete Uninstall and Clean Script for Cursor
# This script removes the extension and all its cached/stored data

set -e

echo "=== Prompt Pocket Complete Uninstall (Cursor) ==="
echo ""

# Extension identifier
EXT_ID="prompt-pocket.prompt-pocket"
EXT_NAME="prompt-pocket"

# Cursor paths (macOS)
CURSOR_EXTENSIONS="$HOME/.cursor/extensions"
CURSOR_USER_DATA="$HOME/Library/Application Support/Cursor/User"
CURSOR_GLOBAL_STORAGE="$CURSOR_USER_DATA/globalStorage"
CURSOR_STATE_DB="$CURSOR_USER_DATA/globalStorage/state.vscdb"

echo "Step 1: Checking Cursor paths..."
echo "  Extensions dir: $CURSOR_EXTENSIONS"
echo "  User data dir: $CURSOR_USER_DATA"
echo "  State DB: $CURSOR_STATE_DB"
echo ""

echo "Step 2: Uninstalling extension via Cursor CLI..."
if command -v cursor &> /dev/null; then
    cursor --uninstall-extension "$EXT_ID" 2>/dev/null || echo "  Extension not installed or already uninstalled"
else
    echo "  Warning: 'cursor' CLI not found. Skipping CLI uninstall."
fi

echo ""
echo "Step 3: Removing extension files from ~/.cursor/extensions/..."
if [ -d "$CURSOR_EXTENSIONS" ]; then
    # List what we're about to remove
    find "$CURSOR_EXTENSIONS" -maxdepth 1 -type d -name "*${EXT_NAME}*" 2>/dev/null | while read dir; do
        echo "  Removing: $dir"
        rm -rf "$dir"
    done
    echo "  Done"
else
    echo "  Extensions directory not found"
fi

echo ""
echo "Step 4: Removing global storage data..."
if [ -d "$CURSOR_GLOBAL_STORAGE/$EXT_ID" ]; then
    rm -rf "$CURSOR_GLOBAL_STORAGE/$EXT_ID"
    echo "  Removed: $CURSOR_GLOBAL_STORAGE/$EXT_ID"
else
    echo "  No globalStorage folder found for extension"
fi

echo ""
echo "Step 5: Clearing globalState from Cursor state database..."
if [ -f "$CURSOR_STATE_DB" ]; then
    echo "  Found state database: $CURSOR_STATE_DB"
    if command -v sqlite3 &> /dev/null; then
        echo "  Current prompt-pocket entries:"
        sqlite3 "$CURSOR_STATE_DB" "SELECT key FROM ItemTable WHERE key LIKE '%prompt-pocket%';" 2>/dev/null || true

        echo "  Deleting entries..."
        sqlite3 "$CURSOR_STATE_DB" "DELETE FROM ItemTable WHERE key LIKE '%prompt-pocket%';" 2>/dev/null && echo "  Deleted!" || echo "  No entries found or delete failed"
    else
        echo "  Warning: sqlite3 not found. Install with: brew install sqlite3"
    fi
else
    echo "  State database not found at: $CURSOR_STATE_DB"
    echo "  Searching for state database..."
    find "$HOME/Library/Application Support/Cursor" -name "state.vscdb" 2>/dev/null | head -5
fi

echo ""
echo "Step 6: Checking for any remaining references..."
echo "  Searching in Cursor data directories..."
grep -r "prompt-pocket" "$CURSOR_USER_DATA" --include="*.json" -l 2>/dev/null | head -10 || echo "  No JSON references found"

echo ""
echo "=== Uninstall Complete ==="
echo ""
echo "IMPORTANT: Please restart Cursor completely (Cmd+Q) for changes to take effect."
echo ""
echo "To reinstall for development:"
echo "  1. Restart Cursor"
echo "  2. Open this project folder"
echo "  3. Press F5 to launch Extension Development Host"
echo ""
