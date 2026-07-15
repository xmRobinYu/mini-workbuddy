import importlib.util
import json
import sys
import tempfile
import unittest
from subprocess import CompletedProcess
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

spec = importlib.util.spec_from_file_location("ralph_module", SCRIPT_DIR / "ralph.py")
ralph = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(ralph)

dashboard_spec = importlib.util.spec_from_file_location("ralph_dashboard_module", SCRIPT_DIR / "dashboard.py")
dashboard_module = importlib.util.module_from_spec(dashboard_spec)
assert dashboard_spec.loader is not None
dashboard_spec.loader.exec_module(dashboard_module)


def _seed_runtime_state(tmpdir: str, prd_payload: dict) -> tuple[Path, Path, Path]:
    prd_path = Path(tmpdir) / "prd.json"
    db_path = Path(tmpdir) / "ralph_state.db"
    runtime_path = Path(tmpdir) / "prd.runtime.json"
    prd_path.write_text(
        json.dumps(prd_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    ralph.state_store.ensure_initialized(
        prd_path=prd_path,
        db_path=db_path,
        runtime_prd_path=runtime_path,
    )
    return prd_path, db_path, runtime_path


class RalphSequentialFlowTest(unittest.TestCase):
    def test_supervised_child_args_preserve_runtime_options(self) -> None:
        with patch.object(
            sys,
            "argv",
            ["ralph.py", "codex", "--remote", "--detach", "--supervise"],
        ):
            args = ralph._supervised_child_args()

        self.assertEqual(args[0], sys.executable)
        self.assertEqual(args[2:], ["codex", "--remote"])

    def test_supervisor_stops_after_normal_child_completion(self) -> None:
        class FakeChild:
            pid = 4321

            def wait(self) -> int:
                return 0

        with tempfile.TemporaryDirectory() as tmpdir:
            runtime_dir = Path(tmpdir)
            with (
                patch.object(ralph, "RUNTIME_DIR", runtime_dir),
                patch.object(ralph, "PID_FILE", runtime_dir / "ralph.pid"),
                patch.object(ralph, "SUPERVISOR_PID_FILE", runtime_dir / "ralph-supervisor.pid"),
                patch.object(ralph, "SUPERVISOR_STATE_FILE", runtime_dir / "ralph-supervisor-state.json"),
                patch.object(ralph, "SUPERVISOR_LOG_FILE", runtime_dir / "ralph-supervisor.log"),
                patch.object(ralph, "SUPERVISOR_EVENTS_FILE", runtime_dir / "ralph-supervisor-events.jsonl"),
                patch.object(ralph.subprocess, "Popen", return_value=FakeChild()) as popen,
            ):
                result = ralph._run_supervisor()

            state = json.loads((runtime_dir / "ralph-supervisor-state.json").read_text(encoding="utf-8"))

        self.assertEqual(result, 0)
        self.assertEqual(popen.call_count, 1)
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["mode"], "supervisor")

    def test_get_current_story_id_returns_first_unresolved_story(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path, db_path, runtime_path = _seed_runtime_state(
                tmpdir,
                {
                    "project": "SkillHub",
                    "branchName": "branch",
                    "userStories": [
                        {"id": "US-001", "passes": True, "blocked": False},
                        {"id": "US-002", "passes": False, "blocked": False},
                        {"id": "US-003", "passes": False, "blocked": False},
                    ],
                },
            )
            with (
                patch.object(ralph, "PRD_FILE", prd_path),
                patch.object(ralph, "STATE_DB_FILE", db_path),
                patch.object(ralph, "RUNTIME_PRD_FILE", runtime_path),
            ):
                self.assertEqual(ralph.get_current_story_id(), "US-002")

    def test_story_is_resolved_checks_passes_or_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path, db_path, runtime_path = _seed_runtime_state(
                tmpdir,
                {
                    "project": "SkillHub",
                    "branchName": "branch",
                    "userStories": [
                        {"id": "US-001", "passes": True, "blocked": False},
                        {"id": "US-002", "passes": False, "blocked": True},
                        {"id": "US-003", "passes": False, "blocked": False},
                    ],
                },
            )
            with (
                patch.object(ralph, "PRD_FILE", prd_path),
                patch.object(ralph, "STATE_DB_FILE", db_path),
                patch.object(ralph, "RUNTIME_PRD_FILE", runtime_path),
            ):
                self.assertTrue(ralph._story_is_resolved("US-001"))
                self.assertTrue(ralph._story_is_resolved("US-002"))
                self.assertFalse(ralph._story_is_resolved("US-003"))

    def test_load_prd_accepts_explicit_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path = Path(tmpdir) / "prd.json"
            prd_path.write_text(json.dumps({"project": "SkillHub"}), encoding="utf-8")

            data = ralph._load_prd(prd_path)

        self.assertEqual(data["project"], "SkillHub")

    def test_switch_story_to_develop_and_validate_uses_story_scoped_update(self) -> None:
        with patch.object(
            ralph,
            "_load_prd",
            return_value={
                "userStories": [
                    {
                        "id": "US-009",
                        "passes": False,
                        "blocked": False,
                        "workflowMode": "validate_only",
                        "notes": "existing",
                    }
                ]
            },
        ), patch.object(ralph, "_update_story_fields") as update_story_fields:
            changed = ralph._switch_story_to_develop_and_validate("US-009")

        self.assertTrue(changed)
        update_story_fields.assert_called_once()
        self.assertEqual(update_story_fields.call_args.args[0], "US-009")
        self.assertEqual(
            update_story_fields.call_args.args[1]["workflowMode"],
            "develop_and_validate",
        )
        self.assertIn("自动切换", update_story_fields.call_args.args[1]["notes"])

    def test_validate_story_automation_target_rejects_resolved_story(self) -> None:
        prd = {
            "userStories": [
                {"id": "US-001", "passes": True, "blocked": False},
                {"id": "US-002", "passes": False, "blocked": False},
            ]
        }

        story = ralph._validate_story_automation_target(prd, "US-002")
        self.assertEqual(story["id"], "US-002")

        with self.assertRaises(ValueError):
            ralph._validate_story_automation_target(prd, "US-001")

    def test_exclusive_runtime_reason_detects_e2e_story(self) -> None:
        story = {
            "id": "US-E2E",
            "storyType": "e2e-sensitive",
            "validationCommands": ["pnpm --dir web exec playwright test e2e/foo.spec.ts"],
        }

        self.assertTrue(ralph._story_requires_exclusive_runtime(story))
        self.assertIn("独占", ralph._exclusive_runtime_reason(story))

    def test_validate_automation_worktree_preflight_detects_dirty_and_unmerged(self) -> None:
        with patch.object(
            ralph.subprocess,
            "run",
            return_value=CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout=" M web/src/pages/dashboard/governance.tsx\nUU scripts/ralph/prd.json\n?? web/e2e/governance-search-rebuild-success.spec.ts\n",
                stderr="",
            ),
        ):
            with self.assertRaises(RuntimeError):
                ralph._validate_automation_worktree_preflight()

        with patch.object(
            ralph.subprocess,
            "run",
            return_value=CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout=" M web/src/pages/dashboard/governance.tsx\n?? web/e2e/governance-search-rebuild-success.spec.ts\n",
                stderr="",
            ),
        ):
            with self.assertRaises(RuntimeError):
                ralph._validate_automation_worktree_preflight()

            result = ralph._validate_automation_worktree_preflight(allow_dirty_worktree=True)

        self.assertEqual(result["dirty_paths"], ["web/src/pages/dashboard/governance.tsx"])
        self.assertEqual(result["untracked_paths"], ["web/e2e/governance-search-rebuild-success.spec.ts"])

    def test_wait_for_child_process_returns_external_resolution_when_story_is_closed(self) -> None:
        class FakeProcess:
            def __init__(self) -> None:
                self.returncode = None
                self.terminated = False

            def poll(self):
                return None

            def terminate(self):
                self.terminated = True

            def wait(self, timeout=None):
                self.returncode = 0
                return 0

            def kill(self):
                self.returncode = -9

        process = FakeProcess()
        with (
            patch.object(ralph, "_story_is_resolved", side_effect=[False, True]),
            patch.object(ralph.time, "sleep", return_value=None),
        ):
            result = ralph._wait_for_child_process(
                process,
                "开发 Agent",
                timeout_seconds=60,
                story_id="US-020",
            )

        self.assertTrue(process.terminated)
        self.assertTrue(result.resolved_externally)
        self.assertFalse(result.timed_out)

    def test_wait_for_child_process_times_out(self) -> None:
        class FakeProcess:
            def __init__(self) -> None:
                self.returncode = None
                self.terminated = False

            def poll(self):
                return None

            def terminate(self):
                self.terminated = True

            def wait(self, timeout=None):
                self.returncode = 0
                return 0

            def kill(self):
                self.returncode = -9

        process = FakeProcess()
        time_values = iter([0, 0, ralph.TIMEOUT_SECONDS + 1])
        with (
            patch.object(ralph, "_story_is_resolved", return_value=False),
            patch.object(ralph.time, "time", side_effect=lambda: next(time_values)),
            patch.object(ralph.time, "sleep", return_value=None),
        ):
            result = ralph._wait_for_child_process(
                process,
                "开发 Agent",
                timeout_seconds=ralph.TIMEOUT_SECONDS,
                story_id="US-020",
            )

        self.assertTrue(process.terminated)
        self.assertTrue(result.timed_out)

    def test_run_developer_returns_non_zero_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prompt_file = Path(tmpdir) / "CLAUDE.md"
            prompt_file.write_text("prompt", encoding="utf-8")

            class FakeProcess:
                def __init__(self) -> None:
                    self.stdin = None

            with (
                patch.object(ralph, "CLAUDE_INSTRUCTION_FILE", prompt_file),
                patch.object(ralph, "build_process_cmd", return_value=(["codex"], None)),
                patch.object(ralph.subprocess, "Popen", return_value=FakeProcess()),
                patch.object(ralph, "_wait_for_child_process", return_value=ralph.ChildProcessResult(exit_code=23)),
            ):
                result = ralph.run_developer(1, "US-021")

        self.assertEqual(result.exit_code, 23)
        self.assertFalse(result.timed_out)

    def test_main_marks_story_failed_when_developer_exits_non_zero(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path, db_path, runtime_path = _seed_runtime_state(
                tmpdir,
                {
                    "project": "SkillHub",
                    "branchName": "test-branch",
                    "userStories": [
                        {
                            "id": "US-021",
                            "title": "Story",
                            "description": "desc",
                            "acceptanceCriteria": [],
                            "priority": 1,
                            "passes": False,
                            "notes": "",
                            "retryCount": 0,
                            "blocked": False,
                        }
                    ],
                },
            )

            dashboard_states: list[tuple[str | None, str | None]] = []

            def fake_set_state(*, iteration=None, phase=None, current_story=None):
                dashboard_states.append((phase, current_story))

            target_calls = {"count": 0}

            def fake_get_target_story_id(explicit_story_id=None):
                target_calls["count"] += 1
                return "US-021" if target_calls["count"] == 1 else None

            with (
                patch.object(ralph, "PRD_FILE", prd_path),
                patch.object(ralph, "STATE_DB_FILE", db_path),
                patch.object(ralph, "RUNTIME_PRD_FILE", runtime_path),
                patch.object(ralph.dashboard, "start", return_value=None),
                patch.object(ralph.dashboard, "set_state", side_effect=fake_set_state),
                patch.object(ralph, "run_developer", return_value=ralph.ChildProcessResult(exit_code=9)),
                patch.object(ralph, "get_target_story_id", side_effect=fake_get_target_story_id),
                patch.object(ralph, "_mark_story_attempt_failure") as mark_failure,
                patch.object(sys, "argv", ["ralph.py"]),
            ):
                with self.assertRaises(SystemExit) as ctx:
                    ralph.main()

        self.assertEqual(ctx.exception.code, 0)
        self.assertIn(("error", "US-021"), dashboard_states)
        mark_failure.assert_called_once()

    def test_main_skips_validator_when_story_is_resolved_after_developer(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path, db_path, runtime_path = _seed_runtime_state(
                tmpdir,
                {
                    "project": "SkillHub",
                    "branchName": "test-branch",
                    "userStories": [
                        {
                            "id": "US-020",
                            "title": "Story",
                            "description": "desc",
                            "acceptanceCriteria": [],
                            "priority": 1,
                            "passes": False,
                            "notes": "",
                            "retryCount": 0,
                            "blocked": False,
                        }
                    ],
                },
            )

            load_calls = {"count": 0}

            def fake_load_story_by_id(story_id: str):
                load_calls["count"] += 1
                if load_calls["count"] == 1:
                    return {
                        "id": "US-020",
                        "workflowMode": "develop_and_validate",
                        "passes": False,
                        "blocked": False,
                    }
                return {
                    "id": "US-020",
                    "workflowMode": "develop_and_validate",
                    "passes": True,
                    "blocked": False,
                }

            target_calls = {"count": 0}

            def fake_get_target_story_id(explicit_story_id=None):
                target_calls["count"] += 1
                return "US-020" if target_calls["count"] == 1 else None

            with (
                patch.object(ralph, "PRD_FILE", prd_path),
                patch.object(ralph, "STATE_DB_FILE", db_path),
                patch.object(ralph, "RUNTIME_PRD_FILE", runtime_path),
                patch.object(ralph.dashboard, "start", return_value=None),
                patch.object(ralph.dashboard, "set_state", return_value=None),
                patch.object(ralph, "get_target_story_id", side_effect=fake_get_target_story_id),
                patch.object(ralph, "_load_story_by_id", side_effect=fake_load_story_by_id),
                patch.object(ralph, "run_developer", return_value=ralph.ChildProcessResult(exit_code=0)),
                patch.object(ralph, "run_validator") as run_validator,
                patch.object(sys, "argv", ["ralph.py"]),
            ):
                with self.assertRaises(SystemExit) as ctx:
                    ralph.main()

        self.assertEqual(ctx.exception.code, 0)
        run_validator.assert_not_called()

    def test_mark_story_attempt_failure_blocks_after_threshold(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path, db_path, runtime_path = _seed_runtime_state(
                tmpdir,
                {
                    "project": "SkillHub",
                    "branchName": "test-branch",
                    "userStories": [
                        {
                            "id": "US-050",
                            "title": "Story",
                            "passes": False,
                            "blocked": False,
                            "notes": "existing",
                            "retryCount": 4,
                            "workflowMode": "develop_and_validate",
                        }
                    ],
                },
            )
            with (
                patch.object(ralph, "PRD_FILE", prd_path),
                patch.object(ralph, "STATE_DB_FILE", db_path),
                patch.object(ralph, "RUNTIME_PRD_FILE", runtime_path),
            ):
                ralph._mark_story_attempt_failure(
                    "US-050",
                    phase="develop",
                    reason="boom",
                    exit_code=1,
                )
                story = ralph._load_story_by_id("US-050")

        assert story is not None
        self.assertTrue(story["blocked"])
        self.assertEqual(story["retryCount"], 5)
        self.assertIn("boom", story["notes"])


class RalphDashboardStateTest(unittest.TestCase):
    def test_dashboard_server_handles_requests_in_daemon_threads(self) -> None:
        self.assertTrue(dashboard_module._DashboardServer.daemon_threads)
        self.assertTrue(dashboard_module._DashboardServer.allow_reuse_address)
        self.assertEqual(dashboard_module._DashboardServer.request_queue_size, 64)


    def test_set_state_tracks_current_story_started_at(self) -> None:
        with patch.object(dashboard_module.time, "time", side_effect=[100, 120]):
            dashboard_module._state.update(
                {
                    "iteration": 0,
                    "max_iterations": 50,
                    "phase": "idle",
                    "current_story": None,
                    "started_at": None,
                    "current_story_started_at": None,
                }
            )
            dashboard_module.set_state(phase="developing", current_story="US-021")
            first_started_at = dashboard_module._state["current_story_started_at"]
            dashboard_module.set_state(phase="validating", current_story="US-021")

        self.assertEqual(first_started_at, 100)
        self.assertEqual(dashboard_module._state["current_story_started_at"], 100)

    def test_build_api_response_includes_current_story_elapsed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            scripts_dir = Path(tmpdir)
            prd_path = scripts_dir / "prd.json"
            runtime_prd_path = scripts_dir / "prd.runtime.json"
            progress_path = scripts_dir / "progress.txt"
            prd_path.write_text(json.dumps({"project": "SkillHub", "branchName": "branch", "userStories": []}), encoding="utf-8")
            runtime_prd_path.write_text(
                json.dumps(
                    {
                        "project": "SkillHub",
                        "branchName": "branch",
                        "userStories": [
                            {"id": "US-001", "passes": True, "totalElapsedSeconds": 40},
                            {"id": "US-002", "passes": False, "totalElapsedSeconds": 10},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            progress_path.write_text("init\n", encoding="utf-8")

            dashboard_module._state.update(
                {
                    "iteration": 2,
                    "max_iterations": 100,
                    "phase": "developing",
                    "current_story": "US-021",
                    "started_at": 10,
                    "current_story_started_at": 70,
                }
            )

            with (
                patch.object(dashboard_module, "PRD_FILE", prd_path),
                patch.object(dashboard_module, "RUNTIME_PRD_FILE", runtime_prd_path),
                patch.object(dashboard_module, "PROGRESS_FILE", progress_path),
                patch.object(dashboard_module.time, "time", return_value=100),
            ):
                data = dashboard_module._build_api_response()

        self.assertEqual(data["runtime"]["elapsed"], 90)
        self.assertEqual(data["runtime"]["current_story_elapsed"], 30)
        self.assertEqual(data["runtime"]["completed_story_total_elapsed"], 40)
        self.assertNotIn("logs", data)

    def test_build_logs_response_reads_progress_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            scripts_dir = Path(tmpdir)
            progress_path = scripts_dir / "progress.txt"
            progress_path.write_text("hello log\n", encoding="utf-8")

            with patch.object(dashboard_module, "PROGRESS_FILE", progress_path):
                data = dashboard_module._build_logs_response()

        self.assertEqual(data["logs"], "hello log\n")

    def test_build_system_response_includes_process_and_host_metrics(self) -> None:
        data = dashboard_module._build_system_response()

        self.assertIn("process", data)
        self.assertIn("host", data)
        self.assertIn("cpu_percent", data["process"])
        self.assertIn("rss_bytes", data["process"])
        self.assertIn("memory_percent", data["host"])

    def test_dashboard_main_accepts_explicit_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            scripts_dir = Path(tmpdir)
            prd_path = scripts_dir / "prd.json"
            runtime_prd_path = scripts_dir / "prd.runtime.json"
            progress_path = scripts_dir / "progress.txt"
            prd_path.write_text(json.dumps({"project": "SkillHub", "branchName": "branch", "userStories": []}), encoding="utf-8")
            runtime_prd_path.write_text(json.dumps({"project": "SkillHub", "branchName": "branch", "userStories": []}), encoding="utf-8")
            progress_path.write_text("ok\n", encoding="utf-8")

            with (
                patch.object(dashboard_module, "start", return_value=None),
                patch.object(dashboard_module.time, "sleep", side_effect=KeyboardInterrupt),
                patch.object(sys, "argv", [
                    "dashboard.py",
                    "--no-browser",
                    "--prd-file", str(prd_path),
                    "--runtime-prd", str(runtime_prd_path),
                    "--progress-file", str(progress_path),
                ]),
            ):
                dashboard_module.main()

        self.assertEqual(dashboard_module.PRD_FILE, prd_path.resolve())

    def test_dashboard_main_accepts_job_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            job_file = root / "job.json"
            jobs_dir = root / "jobs"
            jobs_dir.mkdir()
            prd_path = jobs_dir / "prd.json"
            runtime_prd_path = jobs_dir / "prd.runtime.json"
            progress_path = jobs_dir / "progress.txt"
            prd_path.write_text(json.dumps({"project": "SkillHub", "branchName": "branch", "userStories": []}), encoding="utf-8")
            runtime_prd_path.write_text(json.dumps({"project": "SkillHub", "branchName": "branch", "userStories": []}), encoding="utf-8")
            progress_path.write_text("ok\n", encoding="utf-8")
            job_file.write_text(
                json.dumps(
                    {
                        "prdFile": str(prd_path),
                        "runtimePrd": str(runtime_prd_path),
                        "progressFile": str(progress_path),
                    }
                ),
                encoding="utf-8",
            )

            original_prd = dashboard_module.PRD_FILE
            original_runtime = dashboard_module.RUNTIME_PRD_FILE
            original_progress = dashboard_module.PROGRESS_FILE
            with (
                patch.object(dashboard_module, "start", return_value=None),
                patch.object(dashboard_module.time, "sleep", side_effect=KeyboardInterrupt),
                patch.object(sys, "argv", [
                    "dashboard.py",
                    "--job-file", str(job_file),
                    "--no-browser",
                ]),
            ):
                dashboard_module.main()

        self.assertEqual(dashboard_module.PRD_FILE, prd_path.resolve())
        dashboard_module.PRD_FILE = original_prd
        dashboard_module.RUNTIME_PRD_FILE = original_runtime
        dashboard_module.PROGRESS_FILE = original_progress


class RalphProcessControlTest(unittest.TestCase):
    def test_stop_processes_stops_child_before_supervisor(self) -> None:
        with patch.object(ralph, "_stop_process_from_pid_file", side_effect=[True, True]) as stop_process:
            self.assertEqual(ralph._stop_processes(), 0)

        self.assertEqual(
            [call.args[0] for call in stop_process.call_args_list],
            [ralph.PID_FILE, ralph.SUPERVISOR_PID_FILE],
        )


if __name__ == "__main__":
    unittest.main()
