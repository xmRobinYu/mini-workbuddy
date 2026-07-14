#!/usr/bin/env python3
"""
Ralph Dashboard - 实时监控面板
启动一个本地 HTTP 服务，服务 dashboard.html 并提供 /api/state 接口。
"""

import json
import threading
import webbrowser
import time
import os
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import config
import psutil

SCRIPT_DIR = Path(__file__).parent.resolve()
PRD_FILE = config.get_prd_file()
RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
PROGRESS_FILE = config.get_progress_file(PRD_FILE)
HTML_FILE = SCRIPT_DIR / "dashboard.html"
PIXEL_HTML_FILE = SCRIPT_DIR / "dashboard-p.html"

_state: dict = {
    "iteration": 0,
    "max_iterations": 50,
    "phase": "idle",       # idle | developing | validating | done | error
    "current_story": None,
    "started_at": None,
    "current_story_started_at": None,
}
_state_lock = threading.Lock()


def set_state(
    iteration: int | None = None,
    phase: str | None = None,
    current_story: str | None = None,
) -> None:
    with _state_lock:
        if iteration is not None:
            _state["iteration"] = iteration
        if phase is not None:
            _state["phase"] = phase
        if current_story is not None:
            if current_story != _state.get("current_story"):
                _state["current_story_started_at"] = time.time() if current_story else None
            _state["current_story"] = current_story


def _build_api_response() -> dict:
    with _state_lock:
        s = dict(_state)

    elapsed = int(time.time() - s["started_at"]) if s["started_at"] else 0
    current_story_elapsed = int(time.time() - s["current_story_started_at"]) if s.get("current_story_started_at") else 0

    project = ""
    branch_name = ""
    stories = []
    try:
        source = RUNTIME_PRD_FILE if RUNTIME_PRD_FILE.exists() else PRD_FILE
        prd = json.loads(source.read_text(encoding="utf-8"))
        project = prd.get("project", "")
        branch_name = prd.get("branchName", "")
        stories = prd.get("userStories", [])
    except Exception:
        pass

    return {
        "runtime": {
            "iteration": s["iteration"],
            "max_iterations": s["max_iterations"],
            "phase": s["phase"],
            "current_story": s["current_story"],
            "elapsed": elapsed,
            "current_story_elapsed": current_story_elapsed,
            "completed_story_total_elapsed": sum(
                int(story.get("totalElapsedSeconds", 0) or 0)
                for story in stories
                if story.get("passes", False)
            ),
        },
        "project": project,
        "branchName": branch_name,
        "stories": stories,
    }


def _build_logs_response() -> dict:
    logs = ""
    try:
        if PROGRESS_FILE.exists():
            logs = PROGRESS_FILE.read_text(encoding="utf-8")
    except Exception:
        pass
    return {
        "logs": logs,
    }


def _build_system_response() -> dict:
    process = psutil.Process(os.getpid())
    mem = psutil.virtual_memory()
    return {
        "process": {
            "pid": process.pid,
            "cpu_percent": process.cpu_percent(interval=0.0),
            "rss_bytes": process.memory_info().rss,
        },
        "host": {
            "memory_total_bytes": mem.total,
            "memory_used_bytes": mem.used,
            "memory_percent": mem.percent,
        },
        "refreshed_at": int(time.time()),
    }


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if path == "/api/state":
            body = json.dumps(_build_api_response(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/logs":
            body = json.dumps(_build_logs_response(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/system":
            body = json.dumps(_build_system_response(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/healthz":
            body = json.dumps({"ok": True, "phase": _state.get("phase", "idle")}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path in ("/", "/index.html"):
            try:
                html = HTML_FILE.read_text(encoding="utf-8")
                html = html.replace("{PORT}", str(self.server.server_port)).replace("{AGENT}", _state.get("agent", "atomcode"))
                body = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                msg = str(e).encode()
                self.send_response(500)
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)

        elif path in ("/p", "/p.html"):
            try:
                html = PIXEL_HTML_FILE.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
            except Exception as e:
                msg = str(e).encode()
                self.send_response(500)
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args) -> None:  # suppress access logs
        pass


def start(port: int = 7333, max_iterations: int = 100, open_browser: bool = True, host: str = "127.0.0.1", agent: str = "codex") -> None:
    # 支持通过环境变量 SKILLHUB_PORT 覆盖端口
    env_port = os.environ.get("SKILLHUB_PORT")
    if env_port:
        try:
            port = int(env_port)
        except (ValueError, TypeError):
            pass

    with _state_lock:
        _state["started_at"] = time.time()
        _state["max_iterations"] = max_iterations
        _state["agent"] = agent

    server = HTTPServer((host, port), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    url = f"http://{host}:{port}" if host != "0.0.0.0" else f"http://localhost:{port}"
    print(f"🖥️  Dashboard: {url}")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ralph dashboard server")
    parser.add_argument("--job-file", dest="job_file", help="统一作业配置文件路径")
    parser.add_argument("--port", type=int, default=7333, help="dashboard port")
    parser.add_argument("--host", default="127.0.0.1", help="dashboard host")
    parser.add_argument("--agent", default="codex", help="agent label to render")
    parser.add_argument("--no-browser", action="store_true", help="do not auto-open browser")
    parser.add_argument("--prd-file", dest="prd_file", help="override prd.json path")
    parser.add_argument("--runtime-prd", dest="runtime_prd", help="override runtime prd view path")
    parser.add_argument("--progress-file", dest="progress_file", help="override progress log path")
    args = parser.parse_args()
    if args.job_file:
        config.apply_job_file(args.job_file)

    global PRD_FILE, RUNTIME_PRD_FILE, PROGRESS_FILE
    if args.job_file:
        PRD_FILE = config.get_prd_file()
        RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
        PROGRESS_FILE = config.get_progress_file(PRD_FILE)
    if args.prd_file:
        PRD_FILE = Path(args.prd_file).expanduser().resolve()
        os.environ["RALPH_PRD_FILE"] = str(PRD_FILE)
    if args.runtime_prd:
        RUNTIME_PRD_FILE = Path(args.runtime_prd).expanduser().resolve()
        os.environ["RALPH_RUNTIME_PRD_FILE"] = str(RUNTIME_PRD_FILE)
    elif args.prd_file:
        RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
    if args.progress_file:
        PROGRESS_FILE = Path(args.progress_file).expanduser().resolve()
        os.environ["RALPH_PROGRESS_FILE"] = str(PROGRESS_FILE)
    elif args.prd_file:
        PROGRESS_FILE = config.get_progress_file(PRD_FILE)

    start(
        port=args.port,
        host=args.host,
        agent=args.agent,
        open_browser=not args.no_browser,
    )

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
