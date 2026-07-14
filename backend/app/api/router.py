"""Aggregated API router.

Module-specific routers will be mounted here as features land. For now we expose
placeholder health routes so the OpenAPI docs render and the frontend can verify
connectivity.
"""

from __future__ import annotations

from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/ping", tags=["system"])
async def ping() -> dict[str, str]:
    """Lightweight endpoint for frontend connectivity checks."""
    return {"pong": "ok"}
