"""Tests for atomic and concurrent JSONL event persistence (US-019)."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

from app.core.config import CONVERSATIONS_DIR
from app.services import conversations_store


def _event(index: int) -> dict[str, object]:
    return {
        "role": "user",
        "type": "message",
        "timestamp": f"2026-07-16T00:00:{index:02d}+00:00",
        "data": {"index": index},
    }


def test_append_event_atomically_preserves_events_and_normalizes_fields(
    monkeypatch,
) -> None:
    conversations_store.reset_for_test()
    conversation_id = "atomic-events"
    rename_calls: list[tuple[object, object]] = []
    original_rename = conversations_store.os.rename

    def track_rename(source: object, destination: object) -> None:
        rename_calls.append((source, destination))
        original_rename(source, destination)

    monkeypatch.setattr(conversations_store.os, "rename", track_rename)

    conversations_store.append_event(conversation_id, _event(1))
    conversations_store.append_event(conversation_id, _event(2))

    jsonl_path = CONVERSATIONS_DIR / conversation_id / f"{conversation_id}.jsonl"
    tmp_path = jsonl_path.with_suffix(".jsonl.tmp")
    events = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]

    assert [event["data"]["index"] for event in events] == [1, 2]
    assert not tmp_path.exists()
    assert rename_calls == [(tmp_path, jsonl_path), (tmp_path, jsonl_path)]
    for event in events:
        assert set(event) >= {
            "role",
            "type",
            "timestamp",
            "data",
            "reasoning",
            "tool_call_id",
        }
        assert event["reasoning"] == ""
        assert event["tool_call_id"] == ""


def test_append_event_preserves_corrupt_lines_for_safe_reading() -> None:
    conversations_store.reset_for_test()
    conversation_id = conversations_store.create_conversation("损坏行")["id"]
    directory = CONVERSATIONS_DIR / conversation_id
    jsonl_path = directory / f"{conversation_id}.jsonl"
    jsonl_path.write_text('{"role": "user"}\nnot valid json\n', encoding="utf-8")

    conversations_store.append_event(conversation_id, _event(1))

    detail = conversations_store.get_conversation(conversation_id)
    assert detail is not None
    assert len(detail["events"]) == 2


def test_concurrent_appends_to_one_conversation_are_complete_and_valid() -> None:
    conversations_store.reset_for_test()
    conversation_id = "shared-conversation"

    with ThreadPoolExecutor(max_workers=16) as executor:
        list(
            executor.map(
                lambda index: conversations_store.append_event(
                    conversation_id, _event(index)
                ),
                range(100),
            )
        )

    jsonl_path = CONVERSATIONS_DIR / conversation_id / f"{conversation_id}.jsonl"
    events = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]

    assert len(events) == 100
    assert {event["data"]["index"] for event in events} == set(range(100))


def test_concurrent_appends_to_separate_conversations_stay_isolated() -> None:
    conversations_store.reset_for_test()

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [
            executor.submit(conversations_store.append_event, conversation_id, _event(index))
            for conversation_id in ("first-conversation", "second-conversation")
            for index in range(50)
        ]
        for future in futures:
            future.result()

    for conversation_id in ("first-conversation", "second-conversation"):
        jsonl_path = CONVERSATIONS_DIR / conversation_id / f"{conversation_id}.jsonl"
        events = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]
        assert len(events) == 50
        assert {event["data"]["index"] for event in events} == set(range(50))
