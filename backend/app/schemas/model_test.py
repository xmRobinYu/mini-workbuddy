"""Pydantic schemas for model connection test results (US-004)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ModelTestResult(BaseModel):
    """Response body for POST /api/models/{id}/test.

    On success ``success`` is true and ``latency_ms`` reports the round-trip
    time of the lightweight OpenAI-compatible probe request. On failure
    ``success`` is false and ``error`` carries a human-readable message that
    distinguishes network timeout, authentication failure, or model-not-found.
    """

    success: bool = Field(..., description="连接是否成功")
    latency_ms: Optional[int] = Field(
        default=None, ge=0, description="连接成功时的往返延迟（毫秒）"
    )
    error: Optional[str] = Field(
        default=None, description="失败时的具体错误信息"
    )
