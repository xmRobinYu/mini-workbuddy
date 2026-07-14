"""Chat file-upload API (US-012).

Endpoints:
- POST /api/chat/upload   receive a single file upload (≤ 5 MB)

Uploaded bytes are stored under the conversation's directory when a
``conversation_id`` form field is provided, otherwise under a shared
``workspace/uploads/`` temp directory. Files exceeding 5 MB return 413.
"""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, UploadFile, status

from app.schemas.file_io import UploadedFile
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


__all__ = ["router"]
