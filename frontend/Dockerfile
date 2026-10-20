FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# After npm ci so the deps cache survives. Vite inlines VITE_* from the process env.
ARG VITE_SENTRY_DSN
ARG SOURCE_COMMIT
ENV VITE_SENTRY_RELEASE=$SOURCE_COMMIT
RUN npm run build

FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
