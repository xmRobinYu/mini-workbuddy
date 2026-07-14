#!/usr/bin/env python3
"""
Ralph - 自主 AI Agent 循环执行器（含 Validator）
"""

import json
import sys
import subprocess
import time
import os
import argparse
import threading
from dataclasses import dataclass
from pathlib import Path

import config
import dashboard
import prd_tool
import state_store

# 配置
MAX_ITERATIONS = 100
TIMEOUT_SECONDS = 30 * 60
POLL_INTERVAL_SECONDS = 5

# Agent 选择：支持 "claude"、"codex"、"opencode"、"atomcode"
# 用法：python ralph.py [agent] [model]
# 示例：
#   python ralph.py claude claude-sonnet-4-6
#   python ralph.py codex gpt-4o
#   python ralph.py opencode deepseek-chat
#   python ralph.py atomcode deepseek-v4-flash
def _initial_agent_and_model() -> tuple[str, str | None]:
    positional = [arg for arg in sys.argv[1:] if not arg.startswith("-")]
    agent = positional[0] if positional else "codex"
    model = positional[1] if len(positional) > 1 else None
    return agent, model


AGENT, MODEL = _initial_agent_and_model()


def build_cmd(prompt: str) -> tuple[list[str], str]:
    """
    根据 AGENT 配置构建命令。
    返回 (cmd, stdin_mode) 元组：
      - cmd: 子进程命令列表
      - stdin_mode: "pipe" 表示通过 stdin 传 prompt；"arg" 表示通过命令行参数传递
    """
    if AGENT == "claude":
        cmd = ["claude", "--print", "--dangerously-skip-permissions"]
        if MODEL:
            cmd.extend(["--model", MODEL])
        # "--" 确保 prompt 不会被误解析为 flag（即使 prompt 以 "-" 开头）
        cmd.extend(["--", prompt])
        return cmd, "arg"

    if AGENT == "codex":
        cmd = ["codex", "exec", "--dangerously-bypass-approvals-and-sandbox"]
        if MODEL:
            cmd.extend(["--model", MODEL])
        cmd.append(prompt)
        return cmd, "arg"

    if AGENT == "opencode":
        cmd = ["opencode", "run"]
        if RALPH_AGENT_FILE.exists():
            cmd.extend(["--agent", str(RALPH_AGENT_FILE)])
        else:
            cmd.extend(["--agent", "build"])
        if MODEL:
            cmd.extend(["--model", MODEL])
        # opencode 的 run 子命令从 stdin 读取 prompt
        return cmd, "pipe"

    if AGENT == "atomcode":
        cmd = ["atomcode", "-p", prompt]
        if MODEL:
            cmd.extend(["--model", MODEL])
        return cmd, "arg"

    raise ValueError(f"不支持的 Agent 类型: {AGENT}")



def build_process_cmd(prompt: str) -> tuple[list[str], str]:
    """
    构建子进程命令。
    prompt 通过 stdin 传递（避免 heredoc/特殊字符被 shell 解析破坏）。
    返回 (cmd, stdin_data) 元组，stdin_data 为 None 时表示不需要通过 stdin 传数据。
    """
    cmd, _ = build_cmd(prompt)
    if AGENT == "claude":
        # claude --print 天然安全地通过命令行参数接收 prompt
        return cmd, None
    if AGENT == "opencode":
        # opencode run 从 stdin 读取 prompt
        return cmd, prompt
    if AGENT == "atomcode":
        # atomcode -p 已内嵌 prompt，无需额外 stdin
        return cmd, None
    # codex / 其他：移除 heredoc 风险的 prompt 追加，
    # 改由 agent 自己读取指令文件（CLAUDE.md / VALIDATOR.md）
    # 即 cmd 只保留 agent + 选项，不含 prompt
    return cmd, None

# 目录配置
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = config.get_workdir()
CLAUDE_INSTRUCTION_FILE = SCRIPT_DIR / "CLAUDE.md"
VALIDATOR_INSTRUCTION_FILE = SCRIPT_DIR / "VALIDATOR.md"
PRD_FILE = config.get_prd_file()
RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
STATE_DB_FILE = config.get_state_db_file(PRD_FILE)
RALPH_AGENT_FILE = SCRIPT_DIR / "ralph-agent.json"
DASHBOARD_PORT = int(os.environ.get("RALPH_DASHBOARD_PORT", "7334"))
RUNTIME_DIR = Path(os.environ.get("RALPH_RUNTIME_DIR", Path.home() / "logs" / "skillhub")).resolve()
PID_FILE = RUNTIME_DIR / "ralph.pid"
LOG_FILE = RUNTIME_DIR / "ralph.log"
SUPERVISOR_PID_FILE = RUNTIME_DIR / "ralph-supervisor.pid"
SUPERVISOR_LOG_FILE = RUNTIME_DIR / "ralph-supervisor.log"
SUPERVISOR_STATE_FILE = RUNTIME_DIR / "ralph-supervisor-state.json"
SUPERVISOR_EVENTS_FILE = RUNTIME_DIR / "ralph-supervisor-events.jsonl"
WORKFLOW_MODE_DEVELOP_ONLY = "develop_only"
WORKFLOW_MODE_VALIDATE_ONLY = "validate_only"
WORKFLOW_MODE_DEVELOP_AND_VALIDATE = "develop_and_validate"
WORKFLOW_MODES = {
    WORKFLOW_MODE_DEVELOP_ONLY,
    WORKFLOW_MODE_VALIDATE_ONLY,
    WORKFLOW_MODE_DEVELOP_AND_VALIDATE,
}


@dataclass
class ChildProcessResult:
    exit_code: int | None = None
    timed_out: bool = False
    resolved_externally: bool = False


def _ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def _touch_runtime_file(path: Path) -> None:
    _ensure_runtime_dir()
    path.touch(exist_ok=True)


def _read_pid(path: Path) -> int | None:
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    if not raw.isdigit():
        return None
    return int(raw)


def _write_pid(path: Path, pid: int) -> None:
    _ensure_runtime_dir()
    path.write_text(f"{pid}\n", encoding="utf-8")


def _clear_pid(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def _is_process_running(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _load_prd(path: Path | None = None) -> dict:
    target = path or PRD_FILE
    if path is not None and path != PRD_FILE:
        return json.loads(target.read_text(encoding="utf-8"))
    state_store.ensure_initialized(
        prd_path=target,
        db_path=STATE_DB_FILE,
        runtime_prd_path=RUNTIME_PRD_FILE,
    )
    return state_store.load_runtime_prd(prd_path=target, db_path=STATE_DB_FILE)


def _write_prd(prd: dict, path: Path | None = None) -> None:
    state_store.export_runtime_prd(prd, runtime_prd_path=RUNTIME_PRD_FILE)


def _get_story(prd: dict, story_id: str) -> dict | None:
    for story in prd.get("userStories", []):
        if story.get("id") == story_id:
            return story
    return None


def _update_story_fields(story_id: str, updates: dict, *, enforce_env_scope: bool = False) -> dict:
    return prd_tool.update_story_fields(
        story_id,
        updates,
        path=PRD_FILE,
        enforce_env_scope=enforce_env_scope,
        db_path=STATE_DB_FILE,
        runtime_prd_path=RUNTIME_PRD_FILE,
    )


def _story_workflow_mode(story: dict | None) -> str:
    if story is None:
        return WORKFLOW_MODE_DEVELOP_AND_VALIDATE
    mode = str(story.get("workflowMode") or WORKFLOW_MODE_DEVELOP_AND_VALIDATE).strip()
    if mode not in WORKFLOW_MODES:
        return WORKFLOW_MODE_DEVELOP_AND_VALIDATE
    return mode


def _story_needs_developer(story: dict | None) -> bool:
    return _story_workflow_mode(story) in {
        WORKFLOW_MODE_DEVELOP_ONLY,
        WORKFLOW_MODE_DEVELOP_AND_VALIDATE,
    }


def _story_needs_validator(story: dict | None) -> bool:
    return _story_workflow_mode(story) in {
        WORKFLOW_MODE_VALIDATE_ONLY,
        WORKFLOW_MODE_DEVELOP_AND_VALIDATE,
    }


def _story_requires_exclusive_runtime(story: dict | None) -> bool:
    if story is None:
        return False
    if bool(story.get("requiresExclusiveRuntime")):
        return True

    story_type = str(story.get("storyType") or "").strip()
    if story_type in {"browser-e2e", "e2e-sensitive", "real-browser", "full-e2e"}:
        return True

    commands = story.get("validationCommands") or []
    for command in commands:
        if not isinstance(command, str):
            continue
        if "playwright" in command or "agent-browser" in command:
            return True
    return False


def _exclusive_runtime_reason(story: dict | None) -> str:
    if story is None:
        return ""
    explicit_reason = str(story.get("exclusiveRuntimeReason") or "").strip()
    if explicit_reason:
        return explicit_reason
    if _story_requires_exclusive_runtime(story):
        return "story 需要独占真实浏览器或 E2E 运行时"
    return ""


def _validate_story_automation_target(
    prd: dict,
    story_id: str,
    require_exclusive_runtime: bool = False,
) -> dict:
    story = _get_story(prd, story_id)
    if story is None:
        raise ValueError(f"未找到 story: {story_id}")
    if story.get("passes", False) or story.get("blocked", False):
        raise ValueError(f"story {story_id} 已完成或已标记为 blocked")
    if require_exclusive_runtime and not _story_requires_exclusive_runtime(story):
        raise ValueError(f"story {story_id} 未声明独占运行时")
    return story


def _validate_automation_worktree_preflight(allow_dirty_worktree: bool = False) -> dict:
    result = {
        "dirty_paths": [],
        "unmerged_paths": [],
        "untracked_paths": [],
    }

    try:
        completed = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return result

    for line in completed.stdout.splitlines():
        if not line:
            continue
        status = line[:2]
        path = line[3:]
        if status == "??":
            result["untracked_paths"].append(path)
            continue
        if "U" in status or status in {"AA", "DD"}:
            result["unmerged_paths"].append(path)
            continue
        result["dirty_paths"].append(path)

    if result["unmerged_paths"]:
        raise RuntimeError(
            "preexisting_unmerged_paths: " + ", ".join(sorted(result["unmerged_paths"]))
        )
    if result["dirty_paths"] and not allow_dirty_worktree:
        raise RuntimeError(
            "dirty_worktree_baseline: " + ", ".join(sorted(result["dirty_paths"]))
        )
    return result


def _load_story_by_id(story_id: str) -> dict | None:
    try:
        return state_store.get_story(
            story_id,
            prd_path=PRD_FILE,
            db_path=STATE_DB_FILE,
        )
    except Exception:
        return None


def _story_is_resolved(story_id: str | None) -> bool:
    if not story_id:
        return False
    try:
        story = _load_story_by_id(story_id)
    except Exception:
        return False
    if story is None:
        return False
    return bool(story.get("passes", False) or story.get("blocked", False))


def _terminate_child_process(process: subprocess.Popen, label: str) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        print(f"   {label} 未在 5 秒内退出，强制 kill")
        process.kill()
        process.wait()


def _wait_for_child_process(process: subprocess.Popen,
                            label: str,
                            timeout_seconds: int,
                            story_id: str | None = None) -> ChildProcessResult:
    """
    等待子进程结束。
    返回值：是否超时。

    额外检查目标 story 是否已被外部流程标记为 passed/blocked；
    若已收口，则主动终止挂起子进程，避免 dashboard 长时间停留在旧 story。
    """
    start_time = time.time()

    while True:
        ret_code = process.poll()
        if ret_code is not None:
            if ret_code == 0:
                print(f"\n✓ {label}完成")
            else:
                print(f"\n⚠️  {label} 退出，exit_code={ret_code}")
            return ChildProcessResult(exit_code=ret_code)

        if _story_is_resolved(story_id):
            print(f"\n↺ 检测到 story {story_id} 已被外部收口，终止挂起的 {label} 子进程并推进主循环")
            _terminate_child_process(process, label)
            return ChildProcessResult(
                exit_code=process.returncode,
                resolved_externally=True,
            )

        elapsed_time = time.time() - start_time
        if elapsed_time > timeout_seconds:
            print(f"\n⚠️  {label} 超时! 已运行 {int(elapsed_time)} 秒")
            _terminate_child_process(process, label)
            return ChildProcessResult(
                exit_code=process.returncode,
                timed_out=True,
            )

        time.sleep(POLL_INTERVAL_SECONDS)


def _set_dashboard_idle() -> None:
    dashboard.set_state(phase="idle", current_story="")


def _set_dashboard_done() -> None:
    dashboard.set_state(phase="done", current_story="")


def _set_dashboard_error(current_story: str | None) -> None:
    dashboard.set_state(phase="error", current_story=current_story or "")


def _switch_story_to_develop_and_validate(story_id: str) -> bool:
    prd = _load_prd()
    story = _get_story(prd, story_id)
    if story is None:
        return False
    if story.get("passes", False) or story.get("blocked", False):
        return False
    if _story_workflow_mode(story) != WORKFLOW_MODE_VALIDATE_ONLY:
        return False

    story["workflowMode"] = WORKFLOW_MODE_DEVELOP_AND_VALIDATE
    transition_note = "[自动切换] 本轮仅验证未通过，下一轮改为开发+验证。"
    notes = str(story.get("notes") or "")
    updates = {"workflowMode": WORKFLOW_MODE_DEVELOP_AND_VALIDATE}
    if transition_note not in notes:
        updates["notes"] = f"{notes}\n{transition_note}" if notes else transition_note
    _update_story_fields(story_id, updates)
    return True


def _mark_story_attempt_failure(
    story_id: str,
    *,
    phase: str,
    reason: str,
    exit_code: int | None = None,
    max_retry_count: int = 5,
) -> None:
    story = _load_story_by_id(story_id)
    if story is None:
        return
    retry_count = int(story.get("retryCount", 0) or 0) + 1
    blocked = retry_count >= max_retry_count
    previous_notes = str(story.get("notes") or "")
    next_note = f"[{phase}失败] {reason}"
    notes = f"{previous_notes}\n{next_note}" if previous_notes else next_note
    if blocked:
        notes = f"{notes}\n[BLOCKED: 已达到最大重试次数，跳过此 story]"
    _update_story_fields(
        story_id,
        {
            "passes": False,
            "retryCount": retry_count,
            "notes": notes,
            "blocked": blocked,
        },
    )
    state_store.record_run_event(
        story_id,
        phase=phase,
        status="failed",
        message=reason,
        exit_code=exit_code,
        db_path=STATE_DB_FILE,
    )
    state_store.mark_story_phase_finished(
        story_id,
        prd_path=PRD_FILE,
        db_path=STATE_DB_FILE,
        runtime_prd_path=RUNTIME_PRD_FILE,
    )


def run_developer(iteration: int, story_id: str | None) -> ChildProcessResult:
    """
    调用开发 Agent
    返回值：是否超时
    """
    print(f"\n{'='*64}\n  迭代 {iteration}/{MAX_ITERATIONS}\n{'='*64}")

    if not CLAUDE_INSTRUCTION_FILE.exists():
        print(f"❌ 错误: {CLAUDE_INSTRUCTION_FILE} 不存在")
        return ChildProcessResult(exit_code=1)

    prompt = CLAUDE_INSTRUCTION_FILE.read_text()
    cmd, stdin_data = build_process_cmd(prompt)
    env = os.environ.copy()
    if story_id:
        env["RALPH_STORY_ID"] = story_id

    try:
        process = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            stdin=subprocess.PIPE if stdin_data is not None else None,
            env=env,
        )

        if stdin_data is not None:
            def write_stdin():
                if process.stdin:
                    process.stdin.write(stdin_data.encode("utf-8"))
                    process.stdin.close()
            t = threading.Thread(target=write_stdin)
            t.start()

        result = _wait_for_child_process(
            process,
            "开发 Agent",
            TIMEOUT_SECONDS,
            story_id=story_id,
        )
        if result.timed_out:
            print("   进程已终止，将在下一次迭代重试")
        return result

    except Exception as e:
        print(f"\n❌ 开发 Agent 错误: {e}")
        return ChildProcessResult(exit_code=1)


def run_validator(iteration: int, story_id: str | None) -> ChildProcessResult:
    """
    调用 Validator Agent，由其自行读取 progress.txt 中最后一个 story 进行验证
    """
    print(f"\n{'='*64}\n  验证迭代 {iteration} - Validator 开始工作\n{'='*64}")

    if not VALIDATOR_INSTRUCTION_FILE.exists():
        print(f"⚠️  警告: {VALIDATOR_INSTRUCTION_FILE} 不存在，跳过验证")
        return ChildProcessResult(exit_code=0)

    prompt = VALIDATOR_INSTRUCTION_FILE.read_text()
    cmd, stdin_data = build_process_cmd(prompt)
    env = os.environ.copy()
    if story_id:
        env["RALPH_STORY_ID"] = story_id

    try:
        process = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            stdin=subprocess.PIPE if stdin_data is not None else None,
            env=env,
        )

        if stdin_data is not None:
            def write_stdin():
                if process.stdin:
                    process.stdin.write(stdin_data.encode("utf-8"))
                    process.stdin.close()
            t = threading.Thread(target=write_stdin)
            t.start()

        result = _wait_for_child_process(
            process,
            "Validator",
            TIMEOUT_SECONDS * 2,
            story_id=story_id,
        )
        if result.timed_out:
            print("   Validator 进程已终止，跳过本次验证")
        return result

    except Exception as e:
        print(f"\n❌ Validator 错误: {e}")
        return ChildProcessResult(exit_code=1)


def get_current_story_id() -> str | None:
    """返回 prd.json 中第一个 passes=False 且 blocked=False 的 story ID"""
    try:
        return state_store.get_current_story_id(prd_path=PRD_FILE, db_path=STATE_DB_FILE)
    except Exception:
        pass
    return None


def get_target_story_id(explicit_story_id: str | None = None) -> str | None:
    env_story_id = os.environ.get("RALPH_STORY_ID")
    if explicit_story_id:
        return explicit_story_id
    if env_story_id:
        return env_story_id
    return get_current_story_id()


def all_stories_resolved() -> bool:
    """
    检查 prd.json，判断是否所有 story 都已完成或被 blocked
    """
    try:
        return state_store.all_stories_resolved(prd_path=PRD_FILE, db_path=STATE_DB_FILE)
    except Exception as e:
        print(f"⚠️  读取 prd.json 失败: {e}")
        return False


def format_duration(seconds: float) -> str:
    """将秒数格式化为易读的时间字符串"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}小时 {m}分钟 {s}秒"
    elif m > 0:
        return f"{m}分钟 {s}秒"
    else:
        return f"{s}秒"


def _write_supervisor_state(status: str, pid: int | None = None) -> None:
    _ensure_runtime_dir()
    payload = {
        "mode": "compat-noop",
        "status": status,
        "pid": pid,
        "updatedAt": int(time.time()),
    }
    SUPERVISOR_STATE_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    _touch_runtime_file(SUPERVISOR_LOG_FILE)
    _touch_runtime_file(SUPERVISOR_EVENTS_FILE)


def _detach_process() -> int:
    _ensure_runtime_dir()
    running_pid = _read_pid(PID_FILE)
    if _is_process_running(running_pid):
        print(f"Ralph 已在后台运行，pid={running_pid}")
        return 0

    child_args = [
        sys.executable,
        str(Path(__file__).resolve()),
        *[arg for arg in sys.argv[1:] if arg != "--detach"],
    ]
    with LOG_FILE.open("ab") as log_file:
        process = subprocess.Popen(
            child_args,
            cwd=str(PROJECT_ROOT),
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=os.environ.copy(),
        )
    _write_pid(PID_FILE, process.pid)
    _write_supervisor_state("running", pid=process.pid)
    print(f"Ralph 已后台启动，pid={process.pid}")
    return 0


def _print_status() -> int:
    pid = _read_pid(PID_FILE)
    running = _is_process_running(pid)
    supervisor_pid = _read_pid(SUPERVISOR_PID_FILE)
    supervisor_running = _is_process_running(supervisor_pid)

    print(f"runtime_dir: {RUNTIME_DIR}")
    if running:
        print(f"ralph: running (pid={pid})")
    else:
        print("ralph: stopped")
        if pid is not None:
            _clear_pid(PID_FILE)

    if supervisor_running:
        print(f"supervisor: running (pid={supervisor_pid})")
    elif SUPERVISOR_STATE_FILE.exists():
        print("supervisor: compat-noop")
    else:
        print("supervisor: stopped")
        if supervisor_pid is not None:
            _clear_pid(SUPERVISOR_PID_FILE)
    return 0


def _stop_process_from_pid_file(path: Path, label: str) -> bool:
    pid = _read_pid(path)
    if not _is_process_running(pid):
        _clear_pid(path)
        return False

    assert pid is not None
    try:
        os.kill(pid, 15)
    except OSError:
        _clear_pid(path)
        return False

    deadline = time.time() + 10
    while time.time() < deadline:
        if not _is_process_running(pid):
            _clear_pid(path)
            print(f"{label} 已停止，pid={pid}")
            return True
        time.sleep(0.2)

    try:
        os.kill(pid, 9)
    except OSError:
        pass
    _clear_pid(path)
    print(f"{label} 已强制停止，pid={pid}")
    return True


def _stop_processes() -> int:
    stopped_supervisor = _stop_process_from_pid_file(SUPERVISOR_PID_FILE, "Ralph supervisor")
    stopped_ralph = _stop_process_from_pid_file(PID_FILE, "Ralph")
    if not stopped_supervisor and not stopped_ralph:
        print("Ralph 未在运行")
    _write_supervisor_state("stopped")
    return 0


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="Ralph - 自主 AI Agent 循环执行器")
    parser.add_argument("--job-file", dest="job_file", help="统一作业配置文件路径")
    parser.add_argument("--status", action="store_true", help="输出 Ralph 当前状态")
    parser.add_argument("--stop", action="store_true", help="停止后台 Ralph 进程")
    parser.add_argument("--detach", action="store_true", help="以后台模式启动 Ralph")
    parser.add_argument("--supervise", action="store_true", help="兼容旧入口，当前作为 no-op 接受")
    parser.add_argument("--remote", action="store_true", help="允许远程访问 Dashboard (绑定 0.0.0.0)")
    parser.add_argument("--story-id", dest="story_id", help="只处理指定 story")
    parser.add_argument("--prd-file", dest="prd_file", help="指定 Ralph 使用的 prd.json 路径")
    parser.add_argument("--workdir", dest="workdir", help="指定代码开发工作目录")
    parser.add_argument("--dashboard-port", dest="dashboard_port", type=int, default=DASHBOARD_PORT, help="Dashboard 端口")
    parser.add_argument("--health-url", dest="health_url", help="兼容旧入口的健康检查 URL")
    parser.add_argument("--probe-interval", dest="probe_interval", type=int, help="兼容旧入口的探活间隔")
    parser.add_argument("--probe-timeout", dest="probe_timeout", type=int, help="兼容旧入口的探活超时")
    parser.add_argument("--failure-threshold", dest="failure_threshold", type=int, help="兼容旧入口的故障阈值")
    parser.add_argument("--max-concurrent-dev", dest="max_concurrent_dev", type=int, help="兼容自动化入口的开发并发参数")
    parser.add_argument("--max-concurrent-validation", dest="max_concurrent_validation", type=int, help="兼容自动化入口的验证并发参数")
    parser.add_argument("agent", nargs="?", help="Agent 类型: claude, codex, opencode, atomcode")
    parser.add_argument("model", nargs="?", help="模型名称")
    args = parser.parse_args()
    if args.job_file:
        config.apply_job_file(args.job_file)

    if args.status:
        raise SystemExit(_print_status())
    if args.stop:
        raise SystemExit(_stop_processes())
    if args.detach:
        raise SystemExit(_detach_process())

    global AGENT, MODEL
    AGENT = args.agent if args.agent else "codex"
    MODEL = args.model
    global PRD_FILE, RUNTIME_PRD_FILE, STATE_DB_FILE, PROJECT_ROOT
    if args.prd_file:
        PRD_FILE = Path(args.prd_file).expanduser().resolve()
        RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
        STATE_DB_FILE = config.get_state_db_file(PRD_FILE)
        os.environ["RALPH_PRD_FILE"] = str(PRD_FILE)
        os.environ["RALPH_RUNTIME_PRD_FILE"] = str(RUNTIME_PRD_FILE)
        os.environ["RALPH_STATE_DB_FILE"] = str(STATE_DB_FILE)
        os.environ["RALPH_PROGRESS_FILE"] = str(config.get_progress_file(PRD_FILE))
    if args.workdir:
        PROJECT_ROOT = Path(args.workdir).expanduser().resolve()
        os.environ["RALPH_WORKDIR"] = str(PROJECT_ROOT)
    elif os.environ.get("RALPH_WORKDIR"):
        PROJECT_ROOT = config.get_workdir()

    if os.environ.get("RALPH_AGENT_NAME") and not args.agent:
        AGENT = os.environ["RALPH_AGENT_NAME"]
    if os.environ.get("RALPH_MODEL_NAME") and not args.model:
        MODEL = os.environ["RALPH_MODEL_NAME"]

    host = "0.0.0.0" if args.remote else "127.0.0.1"

    agent_info = f"Agent: {AGENT}"
    if MODEL:
        agent_info += f", Model: {MODEL}"
    if args.story_id:
        agent_info += f", Story: {args.story_id}"
    print(f"启动 Ralph - 最大迭代次数: {MAX_ITERATIONS}, {agent_info}")
    total_start_time = time.time()
    _ensure_runtime_dir()
    _write_pid(PID_FILE, os.getpid())
    if args.supervise:
        _write_supervisor_state("running", pid=os.getpid())

    try:
        dashboard.start(port=args.dashboard_port, max_iterations=MAX_ITERATIONS, host=host, open_browser=False, agent=AGENT)

        for i in range(1, MAX_ITERATIONS + 1):
            try:
                current_story = get_target_story_id(args.story_id)
                if current_story is None:
                    _set_dashboard_done()
                    elapsed = time.time() - total_start_time
                    print("✅ 当前没有待处理的 story")
                    print(f"⏱️  总运行时间: {format_duration(elapsed)}")
                    sys.exit(0)

                story = _load_story_by_id(current_story)
                if story is None:
                    raise ValueError(f"未找到 story: {current_story}")

                workflow_mode = _story_workflow_mode(story)
                print(f"当前 story: {current_story}, workflowMode={workflow_mode}")

                if _story_needs_developer(story):
                    state_store.mark_story_phase_started(
                        current_story,
                        phase="develop",
                        prd_path=PRD_FILE,
                        db_path=STATE_DB_FILE,
                        runtime_prd_path=RUNTIME_PRD_FILE,
                    )
                    dashboard.set_state(iteration=i, phase="developing", current_story=current_story)
                    developer_result = run_developer(i, current_story)
                    if developer_result.timed_out:
                        state_store.mark_story_phase_finished(
                            current_story,
                            prd_path=PRD_FILE,
                            db_path=STATE_DB_FILE,
                            runtime_prd_path=RUNTIME_PRD_FILE,
                        )
                        _set_dashboard_idle()
                        print("⏭️  开发 Agent 超时，跳过本轮后续步骤，下一次迭代继续处理...")
                        time.sleep(2)
                        continue
                    if not developer_result.resolved_externally and developer_result.exit_code not in (0, None):
                        _set_dashboard_error(current_story)
                        print(f"⚠️  开发 Agent 异常退出，记录当前 story 失败并继续 (exit_code={developer_result.exit_code})")
                        _mark_story_attempt_failure(
                            current_story,
                            phase="develop",
                            reason=f"开发 Agent 异常退出 (exit_code={developer_result.exit_code})",
                            exit_code=developer_result.exit_code,
                        )
                        _set_dashboard_idle()
                        time.sleep(2)
                        continue
                else:
                    print(f"⏭️  story {current_story} 配置为 validate_only，跳过开发阶段")

                refreshed_story = _load_story_by_id(current_story)
                if refreshed_story is not None and (refreshed_story.get("passes", False) or refreshed_story.get("blocked", False)):
                    state_store.mark_story_phase_finished(
                        current_story,
                        mark_complete=bool(refreshed_story.get("passes", False)),
                        prd_path=PRD_FILE,
                        db_path=STATE_DB_FILE,
                        runtime_prd_path=RUNTIME_PRD_FILE,
                    )
                    print(f"↺ story {current_story} 已在开发阶段外部收口，跳过后续验证阶段")
                    _set_dashboard_idle()
                    next_story = get_target_story_id(args.story_id)
                    if next_story is None or all_stories_resolved():
                        _set_dashboard_done()
                        elapsed = time.time() - total_start_time
                        print("✅ 所有任务已完成或已标记为 BLOCKED!")
                        print(f"⏱️  总运行时间: {format_duration(elapsed)}")
                        sys.exit(0)
                    continue

                if _story_needs_validator(story):
                    state_store.mark_story_phase_started(
                        current_story,
                        phase="validate",
                        prd_path=PRD_FILE,
                        db_path=STATE_DB_FILE,
                        runtime_prd_path=RUNTIME_PRD_FILE,
                    )
                    dashboard.set_state(phase="validating", current_story=current_story)
                    validator_result = run_validator(i, current_story)
                    if validator_result.timed_out:
                        state_store.mark_story_phase_finished(
                            current_story,
                            prd_path=PRD_FILE,
                            db_path=STATE_DB_FILE,
                            runtime_prd_path=RUNTIME_PRD_FILE,
                        )
                        _set_dashboard_idle()
                        print("⏭️  Validator 超时，下一次迭代继续处理...")
                        time.sleep(2)
                        continue
                    if not validator_result.resolved_externally and validator_result.exit_code not in (0, None):
                        _set_dashboard_error(current_story)
                        print(f"⚠️  Validator 异常退出，记录当前 story 失败并继续 (exit_code={validator_result.exit_code})")
                        _mark_story_attempt_failure(
                            current_story,
                            phase="validate",
                            reason=f"Validator 异常退出 (exit_code={validator_result.exit_code})",
                            exit_code=validator_result.exit_code,
                        )
                        _set_dashboard_idle()
                        time.sleep(2)
                        continue

                    if workflow_mode == WORKFLOW_MODE_VALIDATE_ONLY:
                        refreshed_story = _load_story_by_id(current_story)
                        if (
                            refreshed_story is not None
                            and not refreshed_story.get("passes", False)
                            and not refreshed_story.get("blocked", False)
                            and _switch_story_to_develop_and_validate(current_story)
                        ):
                            print(f"↺ story {current_story} 验证未通过，已切换为 develop_and_validate")
                    refreshed_story = _load_story_by_id(current_story)
                    if refreshed_story is not None:
                        state_store.mark_story_phase_finished(
                            current_story,
                            mark_complete=bool(refreshed_story.get("passes", False)),
                            prd_path=PRD_FILE,
                            db_path=STATE_DB_FILE,
                            runtime_prd_path=RUNTIME_PRD_FILE,
                        )
                else:
                    print(f"⏭️  story {current_story} 配置为 develop_only，跳过验证阶段")
                    state_store.mark_story_phase_finished(
                        current_story,
                        mark_complete=bool(story.get("passes", False)),
                        prd_path=PRD_FILE,
                        db_path=STATE_DB_FILE,
                        runtime_prd_path=RUNTIME_PRD_FILE,
                    )

                _set_dashboard_idle()
                if all_stories_resolved():
                    _set_dashboard_done()
                    elapsed = time.time() - total_start_time
                    print("✅ 所有任务已完成或已标记为 BLOCKED!")
                    print(f"⏱️  总运行时间: {format_duration(elapsed)}")
                    sys.exit(0)

            except KeyboardInterrupt:
                elapsed = time.time() - total_start_time
                print(f"\n\n⚠️  用户中断")
                print(f"⏱️  总运行时间: {format_duration(elapsed)}")
                sys.exit(130)

        elapsed = time.time() - total_start_time
        print(f"\n已达到最大迭代次数 ({MAX_ITERATIONS})")
        print(f"⏱️  总运行时间: {format_duration(elapsed)}")
        sys.exit(1)
    finally:
        _clear_pid(PID_FILE)
        if args.supervise:
            _write_supervisor_state("stopped")


if __name__ == "__main__":
    main()
