#!/usr/bin/env bash
# Install the Cal sync schedule on this Mac (a launchd agent in your user session).
# Usage: ./install.sh [HH:MM ...]      default: 08:30 13:30 20:30
# Remove: ./install.sh --uninstall
set -euo pipefail
LABEL="com.finance.cal-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the Cal sync schedule."
  exit 0
fi

TIMES=("$@")
[ ${#TIMES[@]} -eq 0 ] && TIMES=("08:30" "13:30" "20:30")

INTERVALS=""
for t in "${TIMES[@]}"; do
  h=$((10#${t%%:*})); m=$((10#${t##*:}))
  INTERVALS+="    <dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>$m</integer></dict>"$'\n'
done

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/cal-sync.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartCalendarInterval</key>
  <array>
$INTERVALS  </array>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/finance-cal-sync.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/finance-cal-sync.out.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Cal sync scheduled at: ${TIMES[*]} (runs at the next wake if the Mac was asleep)."
echo "Log: ~/Library/Logs/finance-cal-sync.log"
