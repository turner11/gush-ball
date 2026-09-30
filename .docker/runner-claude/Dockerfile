FROM myoung34/github-runner:latest

# Node.js 24 (Claude Code CLI + frontend tests) and uv (backend tests/lint).
# git, gh and jq ship with the base image.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
    && rm -rf /var/lib/apt/lists/*
