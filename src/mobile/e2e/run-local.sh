#!/usr/bin/env bash
# Runs the iOS end-to-end bench on this Mac: builds the E2E app if needed,
# starts the mock DMZ, installs the app on a simulator and plays the Maestro
# flows. Extra arguments go to `maestro test` (e.g. --include-tags ci).
#
#   yarn e2e:ios                       # every flow (microphone included)
#   yarn e2e:ios --include-tags ci     # what CI plays
#   E2E_FULL_BUILD=1 yarn e2e:ios      # force a full Xcode build
#
# The native build (about 10 min the first time) is reused as long as
# ios/, package.json and yarn.lock are unchanged; otherwise only the JS
# bundle is rebuilt (about 30 s). Needs Xcode, CocoaPods through bundler
# (Ruby >= 3.2), Java >= 17 and Maestro (`maestro` in PATH or MAESTRO_BIN).
set -euo pipefail
cd "$(dirname "$0")/.."
MOBILE_DIR="$PWD"

export MIRAI_API_URL=http://localhost:4010
export MIRAI_E2E=1
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export MAESTRO_CLI_NO_ANALYTICS=1
[ -d /opt/homebrew/opt/ruby/bin ] && export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
[ -z "${JAVA_HOME:-}" ] && JAVA_HOME="$(/usr/libexec/java_home -v 17+ 2>/dev/null || true)" && export JAVA_HOME

MAESTRO="${MAESTRO_BIN:-$(command -v maestro || echo "$HOME/.maestro-2.11.0/maestro/bin/maestro")}"
[ -x "$MAESTRO" ] || { echo "Maestro not found: set MAESTRO_BIN" >&2; exit 1; }

DERIVED="$MOBILE_DIR/ios/build-e2e"
PRODUCTS="$DERIVED/Build/Products/Release-iphonesimulator"
APP="$PRODUCTS/Assistant Transcripts.app"
HERMESC="$MOBILE_DIR/ios/Pods/hermes-engine/destroot/bin/hermesc"
KEY_FILE="$DERIVED/.native-key"
native_key() {
  { git ls-files -s -- ios package.json yarn.lock; git diff -- ios package.json yarn.lock; } | shasum | cut -d' ' -f1
}

full_build() {
  echo "▶ Full native build (arm64, Release, ad-hoc signed)"
  # pod install rewrites the machine-specific hermes-engine checksum: build
  # with the lockfile in sync with Pods, then restore the committed one.
  mkdir -p "$DERIVED"
  cp ios/Podfile.lock "$DERIVED/Podfile.lock.committed"
  trap 'cp "$DERIVED/Podfile.lock.committed" ios/Podfile.lock' EXIT
  (cd ios && bundle exec pod install)
  cp ios/Pods/Manifest.lock ios/Podfile.lock
  (cd ios && xcodebuild \
    -workspace AssistantTranscripts.xcworkspace -scheme AssistantTranscripts \
    -configuration Release -sdk iphonesimulator \
    -destination "generic/platform=iOS Simulator" -derivedDataPath "$DERIVED" \
    ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    build -quiet)
  cp "$DERIVED/Podfile.lock.committed" ios/Podfile.lock
  trap - EXIT
  native_key > "$KEY_FILE"
}

if [ -n "${E2E_FULL_BUILD:-}" ] || [ ! -d "$APP" ] || [ ! -x "$HERMESC" ] \
  || [ "$(cat "$KEY_FILE" 2>/dev/null)" != "$(native_key)" ]; then
  full_build
else
  echo "▶ Native build unchanged: rebuilding the JS bundle only"
  e2e/rebundle-app.sh "$APP" "$HERMESC"
fi

UDID="${SIMULATOR_UDID:-$(xcrun simctl list devices booted -j | jq -r '[.devices[][] | select(.name | startswith("iPhone"))][0].udid // empty')}"
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl list devices available -j | jq -r '[.devices[][] | select(.name | startswith("iPhone"))][0].udid')"
  xcrun simctl boot "$UDID"
fi
xcrun simctl bootstatus "$UDID" -b >/dev/null
echo "▶ Simulator $UDID"
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant microphone fr.gouv.mirai.audio-secure

e2e/prepare-fixture.sh >/dev/null
node e2e/mock-dmz/server.mjs > "$DERIVED/mock-dmz.log" 2>&1 &
MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -fs http://localhost:4010/healthz >/dev/null && break; sleep 0.5; done

echo "▶ Maestro (report in $DERIVED/maestro)"
"$MAESTRO" --device "$UDID" test e2e/maestro --test-output-dir "$DERIVED/maestro" "$@"
