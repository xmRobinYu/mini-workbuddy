"""Tests for file upload + Agent output-file API (US-012).

Covers all acceptance criteria:
- POST /api/chat/upload accepts a file, rejects > 5 MB with 413
- uploaded files are stored under the conversation dir (when conversation_id
  supplied) or the shared uploads/ temp dir
- GET /api/conversations/{id}/outputs returns filename/size/modified_at
- GET /api/conversations/{id}/outputs/{filename} downloads the file
- outputs directory missing → empty list
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.core.config import CONVERSATIONS_DIR
from app.main import create_app
from app.services import conversations_store, file_io_store


def _reset() -> None:
    conversations_store.reset_for_test()
    file_io_store.reset_for_test()


def _client() -> TestClient:
    return TestClient(create_app())


def _make_conversation(client: TestClient, title: str | None = None) -> dict:
    body: dict[str, object] = {}
    if title is not None:
        body["title"] = title
    resp = client.post("/api/conversations", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _upload(
    client: TestClient,
    name: str,
    data: bytes,
    conversation_id: str | None = None,
):
    files = {"file": (name, io.BytesIO(data), "application/octet-stream")}
    data_form: dict[str, str] = {}
    if conversation_id is not None:
        data_form["conversation_id"] = conversation_id
    return client.post("/api/chat/upload", files=files, data=data_form)


# ── upload ─────────────────────────────────────────────────────────────────


def test_upload_stores_to_conversation_dir() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="上传测试")
        conv_id = created["id"]
        resp = _upload(client, "notes.txt", b"hello world", conversation_id=conv_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["filename"] == "notes.txt"
    assert body["size"] == len(b"hello world")
    assert conv_id in body["path"]
    # The file is physically on disk inside the conversation dir.
    stored = CONVERSATIONS_DIR / conv_id / "uploads" / body["stored_filename"]
    assert stored.is_file()
    assert stored.read_bytes() == b"hello world"


def test_upload_stores_to_temp_dir_without_conversation() -> None:
    _reset()
    with _client() as client:
        resp = _upload(client, "doc.txt", b"abc")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["path"].startswith("uploads/")
    # File exists under workspace/uploads/
    from app.core.config import WORKSPACE_DIR

    stored = WORKSPACE_DIR / body["path"]
    assert stored.is_file()
    assert stored.read_bytes() == b"abc"


def test_upload_over_5mb_returns_413() -> None:
    _reset()
    big = b"x" * (5 * 1024 * 1024 + 1)
    with _client() as client:
        resp = _upload(client, "big.bin", big)
    assert resp.status_code == 413
    # No partial file left behind in the temp uploads dir.
    from app.core.config import WORKSPACE_DIR

    uploads = WORKSPACE_DIR / "uploads"
    if uploads.exists():
        assert not any(uploads.iterdir())


def test_upload_exactly_5mb_succeeds() -> None:
    _reset()
    ok = b"x" * (5 * 1024 * 1024)
    with _client() as client:
        resp = _upload(client, "max.bin", ok)
    assert resp.status_code == 201
    assert resp.json()["size"] == len(ok)


def test_upload_no_file_returns_422() -> None:
    _reset()
    with _client() as client:
        resp = client.post("/api/chat/upload", data={})
    assert resp.status_code == 422


# ── outputs listing ────────────────────────────────────────────────────────


def _seed_output(conv_id: str, name: str, content: bytes = b"out") -> None:
    outputs_dir = CONVERSATIONS_DIR / conv_id / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    (outputs_dir / name).write_bytes(content)


def test_list_outputs_returns_file_metadata() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="输出测试")
        conv_id = created["id"]
        _seed_output(conv_id, "result.txt", b"hello output")
        resp = client.get(f"/api/conversations/{conv_id}/outputs")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    item = items[0]
    assert item["filename"] == "result.txt"
    assert item["size"] == len(b"hello output")
    assert "modified_at" in item and item["modified_at"]


def test_list_outputs_empty_when_dir_missing() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="空输出")
        conv_id = created["id"]
        resp = client.get(f"/api/conversations/{conv_id}/outputs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_outputs_empty_when_conversation_missing() -> None:
    _reset()
    with _client() as client:
        resp = client.get("/api/conversations/nonexistent/outputs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_outputs_sorted_by_filename() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="多输出")
        conv_id = created["id"]
        _seed_output(conv_id, "b.txt", b"bb")
        _seed_output(conv_id, "a.txt", b"aa")
        _seed_output(conv_id, "c.txt", b"cc")
        resp = client.get(f"/api/conversations/{conv_id}/outputs")
    names = [f["filename"] for f in resp.json()]
    assert names == ["a.txt", "b.txt", "c.txt"]


# ── outputs download ───────────────────────────────────────────────────────


def test_download_output_returns_file_bytes() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="下载测试")
        conv_id = created["id"]
        _seed_output(conv_id, "report.txt", b"report content")
        resp = client.get(f"/api/conversations/{conv_id}/outputs/report.txt")
    assert resp.status_code == 200
    assert resp.content == b"report content"


def test_download_output_missing_returns_404() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="无此文件")
        conv_id = created["id"]
        resp = client.get(f"/api/conversations/{conv_id}/outputs/nope.txt")
    assert resp.status_code == 404


def test_download_output_rejects_traversal() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="穿越测试")
        conv_id = created["id"]
        _seed_output(conv_id, "real.txt", b"real")
        resp = client.get(f"/api/conversations/{conv_id}/outputs/..%2f..%2freal.txt")
    # The sanitised basename resolves to a non-existent file → 404, never a
    # filesystem escape.
    assert resp.status_code == 404
