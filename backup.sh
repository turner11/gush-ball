#!/usr/bin/env bash
# Nightly pg_dump -> R2. Runs on the Hetzner host (cron), against the Coolify-run DB container.
# Config lives outside the repo: ~/gush-ball-backup.env (chmod 600), or $BACKUP_ENV.
set -euo pipefail

set -a
. "${BACKUP_ENV:-$HOME/gush-ball-backup.env}"
set +a

f="$(mktemp)"
trap 'rm -f "$f"' EXIT

# Coolify names the container db-<resource-id>-<deploy-timestamp>, so match the stable prefix.
match="${DB_CONTAINER:-db-uk44s8kc08ggkoksoo80skcw}"
db="$(docker ps -qf "name=$match")"
[ "$(wc -w <<<"$db")" = 1 ] || { echo "expected 1 running container matching '$match', got: ${db:-none}" >&2; exit 1; }

docker exec "$db" pg_dump -U gush_ball -Fc gush_ball > "$f"

docker run --rm -i \
    -e AWS_ACCESS_KEY_ID="$BACKUP_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$BACKUP_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION=auto \
    amazon/aws-cli s3 cp - "s3://$BACKUP_BUCKET/gush_ball-$(date +%F).dump" \
    --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" \
    < "$f"
