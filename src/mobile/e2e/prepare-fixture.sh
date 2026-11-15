#!/usr/bin/env bash
# Builds the audio fixture queued by the e2e-ingest deep link (simulator only:
# simulator apps can read host files).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p /tmp/mirai-e2e
afconvert -f m4af -d aac src/assets/sounds/start.wav /tmp/mirai-e2e/reunion-e2e.m4a
echo /tmp/mirai-e2e/reunion-e2e.m4a
