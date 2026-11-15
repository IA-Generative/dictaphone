#!/usr/bin/env bash
# Builds the audio fixtures queued by the e2e-ingest deep link (simulator
# only: simulator apps can read host files). One copy per flow: the app
# deletes a recording's file once it is done with it.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p /tmp/mirai-e2e
for name in ok 401 429 virus; do
  afconvert -f m4af -d aac src/assets/sounds/start.wav "/tmp/mirai-e2e/reunion-${name}.m4a"
done
ls /tmp/mirai-e2e
