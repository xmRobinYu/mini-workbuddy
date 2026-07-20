"""Pydantic schemas for the memory management API (US-012).

The memory store is a file-only surface under ``workspace/memory`` (short-term
daily files) and ``workspace/memory.md`` (long-term). These schemas model the
read/replace responses used by the memory page.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LongTermMemory(BaseModel):
    """Body of GET /api/memory/long-term."""

    model_config = ConfigDict(str_strip_whitespace=False)

    content: str = Field(default="", description="长期记忆全文（memory.md）")
    bytes: int = Field(..., ge=0, description="文件大小（字节）")
    max_bytes: int = Field(..., ge=1, description="长期记忆字节上限")
    items: int = Field(..., ge=0, description="非空行数")


class LongTermMemoryUpdate(BaseModel):
    """Payload for PUT /api/memory/long-term (full body replacement)."""

    model_config = ConfigDict(str_strip_whitespace=False)

    content: str = Field(default="", description="新的长期记忆全文")


class ShortTermFile(BaseModel):
    """A single short-term daily memory file."""

    model_config = ConfigDict(str_strip_whitespace=True)

    date: str = Field(..., description="文件日期 YYYY-MM-DD（来自文件名）")
    filename: str = Field(..., description="文件名")
    bytes: int = Field(..., ge=0, description="文件大小（字节）")
    items: int = Field(..., ge=0, description="非空行数")
    content: str = Field(default="", description="文件全文")


class ShortTermMemory(BaseModel):
    """Body of GET /api/memory/short-term (list of daily files, newest-first)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    files: list[ShortTermFile] = Field(default_factory=list)
    total_items: int = Field(..., ge=0, description="所有短期文件非空行合计")


class MemoryStats(BaseModel):
    """Body of GET /api/memory/stats (dashboard summary)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    long_term_bytes: int = Field(..., ge=0)
    long_term_max_bytes: int = Field(..., ge=1)
    long_term_items: int = Field(..., ge=0)
    short_term_files: int = Field(..., ge=0)
    short_term_items: int = Field(..., ge=0)
    archived_items: int = Field(..., ge=0)


__all__ = [
    "LongTermMemory",
    "LongTermMemoryUpdate",
    "ShortTermFile",
    "ShortTermMemory",
    "MemoryStats",
]
