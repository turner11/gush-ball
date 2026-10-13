FROM ghcr.io/astral-sh/uv:0.12.23 AS uv

FROM python:3.14-slim

COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app

COPY --from=stats . /stats
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

RUN useradd --create-home app
USER app

ENV UV_NO_SYNC=1

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
