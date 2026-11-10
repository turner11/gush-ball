FROM ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 AS uv

# glibc variant (not alpine): the runner base is Ubuntu 20.04, glibc 2.31.
FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS node

FROM myoung34/github-runner:2.338.2@sha256:7cc183492366138ace1c9c74296fd2c6240916d98178696c38bc78e6d5810ee8

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
