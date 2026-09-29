#!/usr/bin/env bash
# Manual DB sync between dev and prod. Target stack: COMPOSE_FILE (default docker-compose.yml).
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-}" in
dump)
    out="${2:-gush_ball-$(date +%F).dump}"
    tmp="$out.tmp"
    trap 'rm -f "$tmp"' EXIT
    docker compose exec -T db pg_dump -U gush_ball -Fc gush_ball > "$tmp"
    mv "$tmp" "$out"
    echo "wrote $out"
    ;;
import)
    file="${2:-}"
    [ -f "$file" ] || { echo "import: file '$file' not found" >&2; exit 1; }
    if [ "${FORCE:-}" != 1 ]; then
        read -r -p "This WIPES the DB of ${COMPOSE_FILE:-docker-compose.yml}. Type yes: " a
        [ "$a" = yes ] || { echo aborted >&2; exit 1; }
    fi
    docker compose exec -T db pg_restore -U gush_ball -d gush_ball --clean --if-exists --no-owner < "$file"
    ;;
*)
    echo "usage: [COMPOSE_FILE=docker-compose.prod.yml] $0 dump [file] | import <file>" >&2
    exit 1
    ;;
esac
