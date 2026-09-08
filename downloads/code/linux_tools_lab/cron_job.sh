#!/bin/sh
# Simulate a minimal environment. This file does NOT install or schedule cron.
set -eu
printf 'HOME=%s\nPATH=%s\n' "${HOME:-not set}" "$PATH"
printf 'shell=%s\n' "$0"
/bin/pwd
/usr/bin/sha256sum /work/fixture/payload.txt
