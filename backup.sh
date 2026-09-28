#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

set -a
. ./.env
set +a

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U gush_ball -Fc gush_ball \
  | docker run --rm -i \
      -e AWS_ACCESS_KEY_ID="$OBJECT_STORAGE_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto \
      amazon/aws-cli s3 cp - "s3://$BACKUP_BUCKET/gush_ball-$(date +%F).dump" \
      --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL"
