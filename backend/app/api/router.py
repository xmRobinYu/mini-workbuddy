"""Aggregated API router.

Module-specific routers are mounted here as features land.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.agents import router as agents_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.models import router as models_router
from app.api.skills import router as skills_router
from app.api.tools import router as tools_router

api_router = APIRouter()
api_router.include_router(models_router)
api_router.include_router(tools_router)
api_router.include_router(agents_router)
api_router.include_router(skills_router)
api_router.include_router(conversations_router)
api_router.include_router(chat_router)


@api_router.get("/ping", tags=["system"])
async def ping() -> dict[str, str]:
    """Lightweight endpoint for frontend connectivity checks."""
    return {"pong": "ok"}
