#!/usr/bin/env bash
# Deploy Infinite Dash to Fly. Needs flyctl, plus FLY_APP_NAME and FLY_DEPLOY_TOKEN in .env.
# The first deploy also creates the "data" volume (see fly.toml).
set -euo pipefail
cd "$(dirname "$0")"

set -a; source .env; set +a
export FLY_API_TOKEN="$FLY_DEPLOY_TOKEN"

# One machine only: SQLite and the widgets live on its volume.
fly deploy -a "$FLY_APP_NAME" --ha=false
