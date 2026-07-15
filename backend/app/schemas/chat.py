"""Pydantic schemas for the SSE chat send endpoint (US-016).

The ``POST /api/chat/send`` endpoint accepts a user message plus the
conversation / agent context and returns an SSE stream of agent events.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ChatSendRequest(BaseModel):
    """Payload for POST /api/chat/send.

    Fields:
    - ``conversation_id``: target conversation (must already exist).
    - ``message``: the user's text message.
    - ``agent_id``: the Agent whose configuration drives the loop.
    - ``uploaded_file_paths``: optional list of server-side upload paths
      (as returned by ``POST /api/chat/upload``) to attach as context.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    conversation_id: str = Field(..., min_length=1, description="目标会话 id")
    message: str = Field(..., min_length=1, description="用户消息文本")
    agent_id: str = Field(..., min_length=1, description="执行 Agent id")
    uploaded_file_paths: Optional[list[str]] = Field(
        default=None, description="已上传文件的服务端相对路径列表（可选）"
    )


__all__ = ["ChatSendRequest"]
