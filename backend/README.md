# Mini-WorkBuddy Backend

FastAPI backend for the Mini-WorkBuddy AI office agent workbench.

## Setup

```bash
uv sync
```

## Development

```bash
uv run uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Testing

```bash
uv run pytest
uv run mypy app
```

## Project layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py    # Paths and constants
│   │   └── workspace.py # Workspace bootstrap
│   └── api/
│       └── router.py    # Aggregated API router
├── tests/
└── pyproject.toml
```
