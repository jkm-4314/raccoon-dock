#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

gnome-extensions pack --force --extra-source=iconSize.js --extra-source=magnification.js --extra-source=glass.js --extra-source=autohide.js --extra-source=launcherIcon.js --extra-source=revealPressure.js --extra-source=icons .

cp -f "native-dock@jkm-4314.github.io.shell-extension.zip" "native-dock@jkm-4314.github.io.zip"

echo "Package ready for upload to https://extensions.gnome.org/upload/:"
echo " - native-dock@jkm-4314.github.io.shell-extension.zip"
echo " - native-dock@jkm-4314.github.io.zip"
