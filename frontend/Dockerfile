FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build

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

FROM caddy:2-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
