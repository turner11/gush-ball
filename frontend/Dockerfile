FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build

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

FROM caddy:2-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
