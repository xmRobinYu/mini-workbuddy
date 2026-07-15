#!/usr/bin/env python3
"""Local OpenAI-compatible streaming mock for US-017 browser verification."""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def _chunk(delta: dict[str, Any], finish_reason: str | None = None) -> str:
    payload = {"choices": [{"delta": delta, "finish_reason": finish_reason}]}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


class OpenAIStreamingMockHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", "0"))
        request_body = json.loads(self.rfile.read(content_length) or b"{}")
        messages = request_body.get("messages", [])
        has_tool_result = any(message.get("role") == "tool" for message in messages)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        if has_tool_result:
            chunks = [
                _chunk({"content": "已读取文件，"}),
                _chunk({"content": "总结完成。"}),
                _chunk({}, "stop"),
            ]
        else:
            chunks = [
                _chunk({"content": "我先读取文件。"}),
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_us017_read",
                                "type": "function",
                                "function": {
                                    "name": "read_file",
                                    "arguments": '{"path":"real.txt"}',
                                },
                            }
                        ]
                    }
                ),
                _chunk({}, "tool_calls"),
            ]

        for chunk in chunks:
            self.wfile.write(chunk.encode("utf-8"))
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), OpenAIStreamingMockHandler)
    print(f"US-017 SSE mock listening on http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
