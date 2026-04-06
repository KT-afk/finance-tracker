#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.financetracker.app.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "==> Finance Tracker Auto-start Setup"
echo "    Project: $PROJECT_DIR"

# 1. Build the app if .next doesn't exist
if [ ! -d "$PROJECT_DIR/.next" ]; then
  echo "==> Building production bundle..."
  cd "$PROJECT_DIR"
  npm run build
fi

# 2. Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# 3. Substitute the real project path into the plist
mkdir -p "$LAUNCH_AGENTS_DIR"
sed "s|FINANCE_TRACKER_PATH|$PROJECT_DIR|g" \
  "$PROJECT_DIR/$PLIST_NAME" > "$PLIST_DEST"

echo "==> Plist installed to: $PLIST_DEST"

# 4. Unload if already loaded (ignore errors)
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# 5. Load the agent
launchctl load "$PLIST_DEST"

echo ""
echo "==> Done! Finance Tracker will start at login."
echo "    Open http://localhost:3000 in your browser."
echo ""
echo "    To stop:  launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
echo "    To start: launchctl load  ~/Library/LaunchAgents/$PLIST_NAME"
echo "    Logs:     $PROJECT_DIR/logs/"
