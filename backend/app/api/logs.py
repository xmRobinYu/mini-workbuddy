"""Log projection API (US-013).

Endpoints:
- GET /api/logs   project execution events from conversation JSONL into log
                  rows, with type/q/level/status/limit filters

Logs are read-only projections (see :mod:`app.services.logs_store`); this
endpoint never writes back to the conversations store, so it cannot corrupt
chat history.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.log import LogList, LogRead
from app.services.logs_store import project_logs

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=LogList)
async def list_logs(
    type: str | None = Query(
        default=None, description="按类别过滤：model/tool/agent/skill"
    ),
    q: str | None = Query(
        default=None, description="按事件名/详情/输出等模糊过滤"
    ),
    level: str | None = Query(
        default=None, description="按级别过滤：info/warn/error"
    ),
    status: str | None = Query(
        default=None, description="按状态过滤：ok/error"
    ),
    limit: int | None = Query(
        default=None, ge=0, description="返回行数上限（默认 200，最大 1000）"
    ),
) -> LogList:
    """Return backend-projected execution logs from conversation JSONL."""
    rows: list[LogRead] = project_logs(
        type=type,
        q=q,
        level=level,
        status=status,
        limit=limit,
    )
    return LogList(items=rows, total=len(rows), limit=limit if limit is not None else 200)


__all__ = ["router"]
