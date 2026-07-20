#!/usr/bin/env python3
"""Local OpenAI-compatible tool-loop mock for US-011 browser verification."""

from __future__ import annotations

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

OUTPUT_PATH_PATTERN = re.compile(r"conversations/[\w-]+/outputs/[\w.-]+")


def _chunk(delta: dict[str, Any], finish_reason: str | None = None) -> str:
    payload = {"choices": [{"delta": delta, "finish_reason": finish_reason}]}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _tool_call_chunk(
    *, name: str, arguments: dict[str, Any], call_id: str
) -> list[str]:
    return [
        _chunk(
            {
                "tool_calls": [
                    {
                        "index": 0,
                        "id": call_id,
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(arguments)},
                    }
                ]
            }
        ),
        _chunk({}, "tool_calls"),
    ]


class OpenAIStreamingMockHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", "0"))
        request_body = json.loads(self.rfile.read(content_length) or b"{}")
        messages = request_body.get("messages", [])
        user_text = "\n".join(
            message.get("content", "")
            for message in messages
            if message.get("role") == "user" and isinstance(message.get("content"), str)
        )
        output_match = OUTPUT_PATH_PATTERN.search(user_text)
        output_path = (
            output_match.group(0)
            if output_match
            else "conversations/unknown/outputs/browser-closed-loop.txt"
        )
        tool_result_count = sum(
            message.get("role") == "tool" for message in messages
        )

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        if tool_result_count == 0:
            chunks = _tool_call_chunk(
                name="write_file",
                arguments={"path": output_path, "content": "浏览器闭环产物。\n"},
                call_id="write-browser-output",
            )
        elif tool_result_count == 1:
            chunks = _tool_call_chunk(
                name="read_file",
                arguments={"path": output_path},
                call_id="read-browser-output",
            )
        elif tool_result_count == 2:
            chunks = _tool_call_chunk(
                name="execute_command",
                arguments={"command": "printf browser-closed-loop", "working_dir": "."},
                call_id="run-browser-output",
            )
        else:
            chunks = [
                _chunk({"content": "已写入、读取并校验浏览器闭环产物。"}),
                _chunk({}, "stop"),
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
    print(f"US-011 SSE mock listening on http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
