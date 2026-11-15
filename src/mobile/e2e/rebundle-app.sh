#!/usr/bin/env bash
# Replaces the JS bundle of an already built iOS app (Release, Hermes) and
# re-signs it ad hoc, keeping its entitlements. Lets the e2e bench reuse a
# native build when only JavaScript changed (seconds instead of a full
# Xcode build). Same steps as react-native-xcode.sh for a Release build.
#
#   e2e/rebundle-app.sh <path/to/App.app> <path/to/hermesc>
#
# MIRAI_API_URL / MIRAI_E2E must be set as for the original build: they are
# inlined into the bundle.
set -euo pipefail
APP="$1"
HERMESC="$2"
cd "$(dirname "$0")/.."

[ -d "$APP" ] || { echo "No app at $APP" >&2; exit 1; }
[ -x "$HERMESC" ] || { echo "No hermesc at $HERMESC" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

node node_modules/react-native/cli.js bundle \
  --entry-file index.js \
  --platform ios \
  --dev false \
  --minify false \
  --reset-cache \
  --bundle-output "$WORK/main.jsbundle" \
  --assets-dest "$APP"

"$HERMESC" -emit-binary -max-diagnostic-width=80 -O \
  -out "$APP/main.jsbundle" "$WORK/main.jsbundle"

# The bundle is a sealed resource: re-sign, keeping identifier and the
# entitlements Xcode embedded (Keychain access on the simulator).
codesign --force --sign - --preserve-metadata=identifier,entitlements,flags "$APP"
codesign --verify --deep --strict "$APP"
echo "Rebundled $APP"
