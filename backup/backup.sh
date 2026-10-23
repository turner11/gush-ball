#!/bin/sh
# The `backup` service in docker-compose.prod.yml: pg_dump -> private R2 bucket, once on start (every deploy) and then
# nightly at 03:00 UTC. A failed run retries every 5 minutes until it succeeds. .github/workflows/backup-check.yml
# restores the newest dump every morning and fails (GitHub emails you) if it is missing, stale or broken.
set -eu
: "${BACKUP_BUCKET:?}" "${OBJECT_STORAGE_ENDPOINT_URL:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"

f=/tmp/gush_ball.dump

backup() {
    # Timestamped key: a deploy's on-start backup never overwrites the nightly one.
    key="gush_ball-$(date -u +%Y-%m-%dT%H%M).dump"
    pg_dump -h db -U gush_ball -Fc gush_ball > "$f" &&
        pg_restore --list "$f" > /dev/null &&
        aws s3 cp "$f" "s3://$BACKUP_BUCKET/$key" --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" --only-show-errors &&
        echo "backup: uploaded $key ($(wc -c < "$f") bytes)"
}

while :; do
    until backup; do
        echo "backup: FAILED, retrying in 5 minutes" >&2
        sleep 300
    done
    rm -f "$f"
    # Seconds until the next 03:00 UTC, in 1..86400.
    now=$(( $(date -u +%s) % 86400 ))
    sleep $(( (3 * 3600 - now + 86399) % 86400 + 1 ))
done
