#!/bin/bash
# Runs Raccoon Dock in a throwaway headless GNOME Shell and checks that it
# works. Uses its own empty settings and extensions folder, so your desktop
# and your settings are never touched.
#
#   tests/run.sh                 run every test
#   tests/run.sh bounce monitor  run tests whose names contain these words
#   tests/run.sh --screenshots   save README screenshots to docs/
#                                (RACCOON_DOCK_WALLPAPER=file picks the wallpaper)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MODE=test
FAVORITES="'io.github.jkm_4314.RaccoonDockTest.desktop'"
if [[ "${1:-}" == "--screenshots" ]]; then
  MODE=screenshots
  FAVORITES="'firefox_firefox.desktop', 'org.gnome.Nautilus.desktop', 'org.gnome.TextEditor.desktop', 'org.gnome.Calculator.desktop', 'org.gnome.Loupe.desktop', 'snap-store_snap-store.desktop', 'org.gnome.Settings.desktop'"
  shift
  mkdir -p "$REPO/docs"
fi
TESTS="$(IFS=,; echo "$*")"

glib-compile-schemas "$REPO/schemas"

EXTENSIONS="$WORK/data/gnome-shell/extensions"
mkdir -p "$EXTENSIONS" "$WORK/data/applications" "$WORK/config/glib-2.0/settings"
ln -s "$REPO" "$EXTENSIONS/raccoon-dock@jkm-4314.github.io"
ln -s "$REPO/tests/selftest" "$EXTENSIONS/raccoon-dock-selftest@jkm-4314.github.io"

cat > "$WORK/data/applications/io.github.jkm_4314.RaccoonDockTest.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Raccoon Dock Test
Exec=gjs -m $REPO/tests/testApp.js
Icon=$REPO/icons/launcher.png
DBusActivatable=false
DESKTOP

cat > "$WORK/config/glib-2.0/settings/keyfile" <<KEYFILE
[org/gnome/shell]
enabled-extensions=['raccoon-dock@jkm-4314.github.io', 'raccoon-dock-selftest@jkm-4314.github.io']
favorite-apps=[$FAVORITES]
welcome-dialog-last-shown-version='999'
KEYFILE

# Screenshots use the system's default wallpaper unless one is given:
#   RACCOON_DOCK_WALLPAPER=~/Pictures/wall.jpg tests/run.sh --screenshots
WALLPAPER="${RACCOON_DOCK_WALLPAPER:-}"
if [[ -n "$WALLPAPER" ]]; then
  WALLPAPER="$(realpath "$WALLPAPER")"
  cat >> "$WORK/config/glib-2.0/settings/keyfile" <<KEYFILE

[org/gnome/desktop/background]
picture-uri='file://$WALLPAPER'
picture-uri-dark='file://$WALLPAPER'
KEYFILE
fi

# DISPLAY and WAYLAND_DISPLAY are dropped so the test app opens its window
# in the test shell, never on your real desktop.
env -u DISPLAY -u WAYLAND_DISPLAY \
  GSETTINGS_BACKEND=keyfile \
  XDG_CONFIG_HOME="$WORK/config" \
  XDG_DATA_HOME="$WORK/data" \
  XDG_CACHE_HOME="$WORK/cache" \
  XDG_STATE_HOME="$WORK/state" \
  RACCOON_DOCK_MODE="$MODE" \
  RACCOON_DOCK_TESTS="$TESTS" \
  RACCOON_DOCK_SHOTS="$REPO/docs" \
  timeout 90 dbus-run-session -- gnome-shell --headless --no-x11 \
  --virtual-monitor 1920x1080 --virtual-monitor 1280x720 \
  > "$WORK/shell.log" 2>&1 || true

grep -E "^RDTEST" "$WORK/shell.log" | sed 's/^RDTEST //' || true
# Only the log up to the end of the tests: shutting the shell down destroys
# the dash under the still-enabled dock, which logs noise of its own.
PROBLEMS="$(sed '/^RDTEST DONE/q' "$WORK/shell.log" | grep -E "JS ERROR|JS WARNING|Gjs-CRITICAL|needs an allocation|raccoon" \
  | grep -v "^RDTEST" | grep -iv "selftest" | sort | uniq -c || true)"
if [[ -n "$PROBLEMS" ]]; then
  echo
  echo "Shell log problems:"
  echo "$PROBLEMS"
fi

if ! grep -q "^RDTEST DONE" "$WORK/shell.log"; then
  echo "The test shell didn't finish. Last log lines:"
  tail -20 "$WORK/shell.log"
  exit 1
fi
if grep -q "^RDTEST FAIL" "$WORK/shell.log" || [[ -n "$PROBLEMS" ]]; then
  exit 1
fi
echo "All good."
