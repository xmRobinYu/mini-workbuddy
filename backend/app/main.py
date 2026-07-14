"""FastAPI application entrypoint for Mini-WorkBuddy backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import CORS_ORIGINS
from app.core.workspace import ensure_workspace


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialise workspace on startup."""
    ensure_workspace()
    yield


def create_app() -> FastAPI:
    """Application factory used by uvicorn and tests."""
    app = FastAPI(
        title="Mini-WorkBuddy API",
        description="轻量级 AI 办公智能体工作台后端 API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        """Simple liveness probe."""
        return {"status": "ok"}

    return app


app = create_app()
