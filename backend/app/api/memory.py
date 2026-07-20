"""Memory management API (US-012).

Endpoints:
- GET  /api/memory/long-term   return the long-term memory body + size stats
- PUT  /api/memory/long-term   replace the long-term memory body (50 KB cap)
- GET  /api/memory/short-term  return all short-term daily files (newest-first)
- GET  /api/memory/stats       return the dashboard summary

All access is confined to ``workspace/memory`` and ``workspace/memory.md`` via
:mod:`app.services.memory_store`; nothing outside that tree is read or written.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from starlette.status import HTTP_413_CONTENT_TOO_LARGE

from app.schemas.memory import (
    LongTermMemory,
    LongTermMemoryUpdate,
    MemoryStats,
    ShortTermFile,
    ShortTermMemory,
)
from app.services import memory_store

router = APIRouter(prefix="/memory", tags=["memory"])


def _count_non_blank(text: str) -> int:
    return sum(1 for line in text.splitlines() if line.strip())


@router.get("/long-term", response_model=LongTermMemory)
async def get_long_term_memory() -> LongTermMemory:
    """Return the long-term memory body and size stats."""
    content = memory_store.read_long_term_memory()
    return LongTermMemory(
        content=content,
        bytes=len(content.encode("utf-8")),
        max_bytes=memory_store.LONG_TERM_MEMORY_MAX_BYTES,
        items=_count_non_blank(content),
    )


@router.put("/long-term", response_model=LongTermMemory)
async def put_long_term_memory(payload: LongTermMemoryUpdate) -> LongTermMemory:
    """Replace the long-term memory body in full (subject to the 50 KB cap)."""
    try:
        memory_store.write_long_term_memory(payload.content)
    except ValueError as exc:
        raise HTTPException(
            status_code=HTTP_413_CONTENT_TOO_LARGE,
            detail=str(exc),
        ) from exc
    content = memory_store.read_long_term_memory()
    return LongTermMemory(
        content=content,
        bytes=len(content.encode("utf-8")),
        max_bytes=memory_store.LONG_TERM_MEMORY_MAX_BYTES,
        items=_count_non_blank(content),
    )


@router.get("/short-term", response_model=ShortTermMemory)
async def get_short_term_memory() -> ShortTermMemory:
    """Return all short-term daily memory files, newest-first."""
    files: list[ShortTermFile] = []
    total_items = 0
    for path in memory_store.list_short_term_files():
        content = memory_store.read_short_term_file(path)
        items = _count_non_blank(content)
        total_items += items
        files.append(
            ShortTermFile(
                date=path.stem,
                filename=path.name,
                bytes=len(content.encode("utf-8")),
                items=items,
                content=content,
            )
        )
    return ShortTermMemory(files=files, total_items=total_items)


@router.get("/stats", response_model=MemoryStats)
async def get_memory_stats() -> MemoryStats:
    """Return the dashboard memory stats summary."""
    return MemoryStats(**memory_store.memory_stats())


__all__ = ["router"]
