FROM ghcr.io/astral-sh/uv:0.13.4@sha256:9f130421e930bfbdc563c00740466603f8723158e90297d07957c2294640262b AS uv

FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

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
