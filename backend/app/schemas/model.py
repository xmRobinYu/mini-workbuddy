"""Pydantic schemas for model configuration management.

Validation rules:
- ``base_url`` must be a valid URL.
- ``context_window_tokens`` must be a positive integer.
- ``provider`` is constrained to known suppliers plus ``custom``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ModelProvider(str, Enum):
    """Supported model suppliers."""

    deepseek = "deepseek"
    alibaba = "alibaba"
    custom = "custom"


def _utcnow_iso() -> str:
    """Current UTC time in ISO-8601 with timezone, second precision."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class ModelBase(BaseModel):
    """Shared fields for create/update/read payloads."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100, description="模型显示名称")
    model: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="供应商模型名（如 deepseek-chat），调用 chat/completions 时使用",
    )
    provider: ModelProvider = Field(..., description="模型供应商")
    base_url: HttpUrl = Field(..., description="模型 API 基础 URL")
    context_window_tokens: int = Field(
        ..., gt=0, le=2_000_000, description="上下文窗口 token 数（正整数）"
    )
    is_default: bool = Field(default=False, description="是否为全局默认模型")


class ModelCreate(ModelBase):
    """Payload for POST /api/models.

    ``api_key`` is the plaintext secret supplied by the caller; it is never
    persisted to ``models.json``. ``api_key_env`` is an optional fallback
    environment-variable name used when the OS keychain is unavailable.
    """

    api_key: str = Field(..., min_length=1, description="明文 API 密钥（仅存入密钥链）")
    api_key_env: Optional[str] = Field(
        default=None, max_length=100, description="密钥环境变量名（降级方案）"
    )


class ModelUpdate(ModelBase):
    """Payload for PUT /api/models/{id}.

    All fields are required (full replacement). ``api_key`` is optional: when
    omitted the stored keychain secret is left untouched.
    """

    api_key: Optional[str] = Field(
        default=None, min_length=1, description="新密钥（可选，省略则保留原密钥）"
    )
    api_key_env: Optional[str] = Field(
        default=None, max_length=100, description="密钥环境变量名（降级方案）"
    )


class ModelRead(ModelBase):
    """Serialised model as returned by GET and stored in models.json.

    ``api_key_ref`` points into the OS keychain (``keychain://<id>``) or is
    ``null`` when falling back to ``api_key_env``. Never contains plaintext.
    """

    id: str
    api_key_ref: Optional[str] = Field(
        default=None, description="密钥链引用，格式 keychain://<ref>"
    )
    api_key_env: Optional[str] = Field(
        default=None, description="密钥环境变量名（降级方案）"
    )
    created_at: str
    updated_at: str


def now_iso() -> str:
    """Public helper returning a fresh ISO-8601 UTC timestamp."""
    return _utcnow_iso()
