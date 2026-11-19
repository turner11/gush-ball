FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

# glibc variant (not alpine): the runner base is Ubuntu 20.04, glibc 2.31.
FROM node:26-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS node

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
