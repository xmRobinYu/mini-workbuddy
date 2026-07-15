"""Pydantic schemas for file upload and Agent output files (US-012).

- ``UploadedFile`` — response for ``POST /api/chat/upload`` (server-side path +
  size of the stored upload).
- ``OutputFile`` — entry returned by ``GET /api/conversations/{id}/outputs``
  (filename, size, last-modified time).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UploadedFile(BaseModel):
    """Result of a successful upload."""

    model_config = ConfigDict(str_strip_whitespace=True)

    filename: str = Field(..., description="原始上传文件名")
    stored_filename: str = Field(
        ..., description="服务端存储后的文件名（可能含唯一前缀）"
    )
    size: int = Field(..., ge=0, description="已存储文件大小（字节）")
    path: str = Field(..., description="服务端存储相对路径（workspace 内）")
    content_type: str = Field(default="", description="MIME 类型")


class OutputFile(BaseModel):
    """A single file under a conversation's ``outputs/`` directory."""

    model_config = ConfigDict(str_strip_whitespace=True)

    filename: str = Field(..., description="文件名")
    size: int = Field(..., ge=0, description="文件大小（字节）")
    modified_at: str = Field(..., description="最后修改时间（ISO-8601 UTC）")


__all__ = ["UploadedFile", "OutputFile"]
