FROM ghcr.io/astral-sh/uv:0.13.4@sha256:9f130421e930bfbdc563c00740466603f8723158e90297d07957c2294640262b AS uv

# glibc variant (not alpine): the runner base is Ubuntu 20.04, glibc 2.31.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS node

FROM myoung34/github-runner:2.338.0@sha256:a97aa55628225bc94af2e78c40f6877a000430255af6bf0aed119a7b0b85ee8c

# Node.js 24 (Claude Code CLI + frontend tests) comes from the pinned node image and uv (backend
# tests/lint) from the pinned uv image, so nothing is piped from curl into a shell.
# git, gh and jq ship with the base image.
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --from=node /usr/local/bin/node /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install -g @anthropic-ai/claude-code

# The base image gives `runner` passwordless sudo, which would defeat RUN_AS_ROOT=false.
RUN gpasswd -d runner sudo
