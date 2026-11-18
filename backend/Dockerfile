FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app

COPY --from=stats . /stats
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

RUN useradd --create-home app
USER app

ENV UV_NO_SYNC=1

# Last, so a new commit only changes a metadata layer. sentry_sdk reads SENTRY_RELEASE itself.
ARG SOURCE_COMMIT
ENV SENTRY_RELEASE=$SOURCE_COMMIT

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
