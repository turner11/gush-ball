FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build

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

FROM caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
