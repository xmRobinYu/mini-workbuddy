"""Aggregated API router.

Module-specific routers are mounted here as features land.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.models import router as models_router
from app.api.tools import router as tools_router

api_router = APIRouter()
api_router.include_router(models_router)
api_router.include_router(tools_router)


@api_router.get("/ping", tags=["system"])
async def ping() -> dict[str, str]:
    """Lightweight endpoint for frontend connectivity checks."""
    return {"pong": "ok"}
