#!/usr/bin/env bash
# Keeps one ephemeral self-hosted runner registered: a fresh container per job.
# Run on the dev machine, never the Hetzner prod host. Needs `gh auth login` as a repo admin.
set -u
cd "$(dirname "$0")"

while true; do
  token="$(gh api -X POST repos/turner11/gush-ball/actions/runners/registration-token --jq .token)" &&
    RUNNER_TOKEN="$token" docker compose -f docker-compose.runners.yml run --rm --build runner-claude
  sleep 30  # also avoids a hot spin while offline or on a bad token
done
