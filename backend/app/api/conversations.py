"""Conversation management CRUD + search API (US-011).

Endpoints:
- GET    /api/conversations                list all conversations (summary)
- POST   /api/conversations                create a new conversation
- GET    /api/conversations/search         search by title or content
- GET    /api/conversations/{id}           return a conversation's full events
- PUT    /api/conversations/{id}           rename a conversation
- DELETE /api/conversations/{id}           delete the conversation + outputs/

The ``search`` route is declared before ``/{id}`` so FastAPI does not bind the
literal ``search`` path segment to the ``{id}`` parameter.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.conversation import (
    ConversationCreate,
    ConversationDetail,
    ConversationRename,
    ConversationSummary,
)
from app.services.conversations_store import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
    search_conversations,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _summary(record: dict[str, object]) -> ConversationSummary:
    return ConversationSummary.model_validate(record)


@router.get("", response_model=list[ConversationSummary])
async def list_conversations_endpoint() -> list[ConversationSummary]:
    """Return all conversations (title + timestamps), newest-first."""
    return [_summary(c) for c in list_conversations()]


@router.get("/search", response_model=list[ConversationSummary])
async def search_conversations_endpoint(
    keyword: str = Query(..., description="按标题或内容过滤的关键词"),
) -> list[ConversationSummary]:
    """Return conversations whose title or JSONL content matches ``keyword``."""
    return [_summary(c) for c in search_conversations(keyword)]


@router.post(
    "",
    response_model=ConversationSummary,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation_endpoint(
    payload: ConversationCreate,
) -> ConversationSummary:
    """Create a new conversation (generates UUID id + on-disk directory)."""
    return _summary(create_conversation(payload.title))


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_endpoint(conversation_id: str) -> ConversationDetail:
    """Return a conversation's full ordered interaction records."""
    record = get_conversation(conversation_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在"
        )
    return ConversationDetail.model_validate(record)


@router.put("/{conversation_id}", response_model=ConversationSummary)
async def rename_conversation_endpoint(
    conversation_id: str, payload: ConversationRename
) -> ConversationSummary:
    """Rename a conversation's title."""
    updated = rename_conversation(conversation_id, payload.title)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在"
        )
    return _summary(updated)


@router.delete(
    "/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_conversation_endpoint(conversation_id: str) -> None:
    """Delete a conversation's JSONL, meta and outputs/ directory."""
    deleted = delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在"
        )


__all__ = ["router"]
