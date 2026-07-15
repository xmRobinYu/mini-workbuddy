"""Chat API — file upload (US-012) + SSE send (US-016).

Endpoints:
- POST /api/chat/upload   receive a single file upload (≤ 5 MB)
- POST /api/chat/send     stream Agent reply events back over SSE

Uploaded bytes are stored under the conversation's directory when a
``conversation_id`` form field is provided, otherwise under a shared
``workspace/uploads/`` temp directory. Files exceeding 5 MB return 413.

The SSE ``/send`` endpoint drives the Agent loop (see
:mod:`app.services.agent_loop`) and streams ``thinking`` / ``content`` /
``tool_call`` / ``tool_result`` / ``done`` / ``error`` events to the client,
emitting a ``: heartbeat`` comment every 15 s and terminating the loop when
the client disconnects.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.schemas.chat import ChatSendRequest
from app.schemas.file_io import UploadedFile
from app.services import sse_events
from app.services.agent_loop import HEARTBEAT_INTERVAL, run_agent_loop
from app.services.file_io_store import MAX_UPLOAD_BYTES, store_upload

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post(
    "/upload",
    response_model=UploadedFile,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    file: UploadFile,
    conversation_id: str | None = Form(default=None),
) -> UploadedFile:
    """Store an uploaded file and return its server-side metadata."""
    try:
        result = store_upload(file, conversation_id=conversation_id)
    except ValueError as exc:
        msg = str(exc)
        if "超过限制" in msg:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"文件过大：单文件上限 {MAX_UPLOAD_BYTES} 字节",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=msg
        )
    return UploadedFile.model_validate(result)


@router.post("/send")
async def send_message(payload: ChatSendRequest, request: Request) -> StreamingResponse:
    """Stream Agent reply events back to the client as SSE.

    Returns a ``text/event-stream`` response. The generator interleaves Agent
    events with 15 s heartbeat comment lines and stops as soon as the client
    disconnects (the in-flight Agent loop is cancelled at the next yield).
    """
    return StreamingResponse(
        _sse_stream(request, payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering (nginx)
            "Connection": "keep-alive",
        },
    )


async def _sse_stream(request: Request, payload: ChatSendRequest) -> AsyncIterator[str]:
    """Interleave Agent events with 15 s heartbeats; stop on disconnect.

    A background task pulls heartbeat tokens from a queue at the heartbeat
    cadence; the main generator drains the queue between Agent events so
    heartbeats are emitted even while the model is producing a long round.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def agent_producer() -> None:
        try:
            async for event in run_agent_loop(
                request=request,
                conversation_id=payload.conversation_id,
                agent_id=payload.agent_id,
                message=payload.message,
                uploaded_file_paths=payload.uploaded_file_paths,
            ):
                await queue.put(event)
        except Exception as exc:  # noqa: BLE001 — never let the producer die silently
            await queue.put(sse_events.error_event(f"内部错误：{exc}"))
            await queue.put(sse_events.done_event())
        finally:
            await queue.put(None)  # sentinel: producer finished

    async def heartbeat_producer() -> None:
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await queue.put(sse_events.heartbeat_line())
        except asyncio.CancelledError:
            return

    producer = asyncio.create_task(agent_producer())
    heartbeat = asyncio.create_task(heartbeat_producer())
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                item = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if item is None:
                break
            yield item
    finally:
        for task in (producer, heartbeat):
            task.cancel()
        for task in (producer, heartbeat):
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


__all__ = ["router"]
