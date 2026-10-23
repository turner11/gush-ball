# Same pinned image as the db service in docker-compose.prod.yml, so pg_dump matches the server version.
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
RUN apk add --no-cache aws-cli
COPY backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["backup.sh"]
