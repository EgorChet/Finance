#!/usr/bin/env bash
# Run on Totoshka as the assistant user. Keeps pulling Cal sync jobs.
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1090
source "$HOME/.config/totoshka/finance.env"
set +a
exec node cal-worker.mjs
