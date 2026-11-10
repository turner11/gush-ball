FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# After npm ci so the deps cache survives. Vite inlines VITE_* from the process env.
ARG VITE_SENTRY_DSN
ARG VITE_HOME_SLIDE_MS
ARG VITE_CONTACT_EMAIL
ARG SOURCE_COMMIT
ENV VITE_SENTRY_RELEASE=$SOURCE_COMMIT
RUN npm run build

FROM caddy:2-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
