#!/usr/bin/env bash
# Manual DB sync between dev and prod. Target: the `db` service of COMPOSE_FILE (default
# docker-compose.yml), or the container named by DB_CONTAINER (prod under Coolify: gush-ball-db).
set -euo pipefail
cd "$(dirname "$0")"

db() { if [ -n "${DB_CONTAINER:-}" ]; then docker exec -i "$DB_CONTAINER" "$@"; else docker compose exec -T db "$@"; fi; }

case "${1:-}" in
dump)
    out="${2:-gush_ball-$(date +%F).dump}"
    tmp="$out.tmp"
    trap 'rm -f "$tmp"' EXIT
    db pg_dump -U gush_ball -Fc gush_ball > "$tmp"
    mv "$tmp" "$out"
    echo "wrote $out"
    ;;
import)
    file="${2:-}"
    [ -f "$file" ] || { echo "import: file '$file' not found" >&2; exit 1; }
    if [ "${FORCE:-}" != 1 ]; then
        read -r -p "This WIPES the DB of ${DB_CONTAINER:-${COMPOSE_FILE:-docker-compose.yml}}. Type yes: " a
        [ "$a" = yes ] || { echo aborted >&2; exit 1; }
    fi
    db pg_restore -U gush_ball -d gush_ball --clean --if-exists --no-owner < "$file"
    ;;
*)
    echo "usage: [DB_CONTAINER=gush-ball-db] $0 dump [file] | import <file>" >&2
    exit 1
    ;;
esac
