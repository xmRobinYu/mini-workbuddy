import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import config
import prd_tool


class PrdToolTest(unittest.TestCase):
    def _write_prd(self, tmpdir: str) -> Path:
        path = Path(tmpdir) / "prd.json"
        path.write_text(
            json.dumps(
                {
                    "project": "SkillHub",
                    "branchName": "test-branch",
                    "userStories": [
                        {
                            "id": "US-001",
                            "title": "A",
                            "passes": False,
                            "blocked": False,
                            "notes": "",
                            "retryCount": 0,
                            "workflowMode": "develop_only",
                        },
                        {
                            "id": "US-002",
                            "title": "B",
                            "passes": False,
                            "blocked": False,
                            "notes": "keep",
                            "retryCount": 1,
                            "workflowMode": "validate_only",
                        },
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return path

    def test_update_story_fields_only_mutates_target_story(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            db_path = Path(tmpdir) / "state.db"
            runtime_path = Path(tmpdir) / "prd.runtime.json"
            updated = prd_tool.update_story_fields(
                "US-001",
                {"passes": "true", "notes": "done"},
                path=path,
                enforce_env_scope=False,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            data = json.loads(runtime_path.read_text(encoding="utf-8"))

        self.assertTrue(updated["passes"])
        self.assertEqual(updated["notes"], "done")
        self.assertTrue(data["userStories"][0]["passes"])
        self.assertEqual(data["userStories"][0]["notes"], "done")
        self.assertEqual(data["userStories"][1]["notes"], "keep")
        self.assertEqual(data["userStories"][1]["retryCount"], 1)

    def test_update_story_fields_rejects_non_whitelisted_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            with self.assertRaises(prd_tool.PrdToolError):
                prd_tool.update_story_fields(
                    "US-001",
                    {"title": "hijack"},
                    path=path,
                    enforce_env_scope=False,
                    db_path=Path(tmpdir) / "state.db",
                    runtime_prd_path=Path(tmpdir) / "prd.runtime.json",
                )

    def test_update_story_fields_rejects_scope_violation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            with patch.dict(os.environ, {"RALPH_STORY_ID": "US-001"}, clear=False):
                with self.assertRaises(prd_tool.PrdToolError):
                    prd_tool.update_story_fields(
                        "US-002",
                        {"passes": "true"},
                        path=path,
                        db_path=Path(tmpdir) / "state.db",
                        runtime_prd_path=Path(tmpdir) / "prd.runtime.json",
                    )

    def test_update_story_fields_validates_workflow_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            with self.assertRaises(prd_tool.PrdToolError):
                prd_tool.update_story_fields(
                    "US-001",
                    {"workflowMode": "rewrite_everything"},
                    path=path,
                    enforce_env_scope=False,
                    db_path=Path(tmpdir) / "state.db",
                    runtime_prd_path=Path(tmpdir) / "prd.runtime.json",
                )

    def test_cli_update_story_returns_non_zero_on_invalid_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            exit_code = prd_tool.main([
                "--prd",
                str(path),
                "update-story",
                "US-001",
                "--set",
                "title=bad",
            ])

        self.assertEqual(exit_code, 1)

    def test_cli_get_story_supports_explicit_state_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            state_db = Path(tmpdir) / "custom-state.db"
            runtime_prd = Path(tmpdir) / "custom.runtime.json"
            exit_code = prd_tool.main([
                "--prd-file",
                str(path),
                "--state-db",
                str(state_db),
                "--runtime-prd",
                str(runtime_prd),
                "get-story",
                "US-001",
            ])

        self.assertEqual(exit_code, 0)

    def test_get_work_package_includes_queue_and_progress_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._write_prd(tmpdir)
            progress_path = Path(tmpdir) / "progress.txt"
            progress_path.write_text(
                "## Codebase Patterns\n- pattern one\n## 2026-05-16 10:00 - US-001\n- done\n",
                encoding="utf-8",
            )
            with patch.object(prd_tool, "PROGRESS_FILE", progress_path), patch.object(prd_tool, "PRD_FILE", path):
                work_package = prd_tool.get_work_package(
                    "US-001",
                    path=path,
                    db_path=Path(tmpdir) / "state.db",
                    runtime_prd_path=Path(tmpdir) / "prd.runtime.json",
                )

        self.assertEqual(work_package["queue"]["currentIndex"], 0)
        self.assertEqual(work_package["queue"]["remainingOpenCount"], 2)
        self.assertEqual(work_package["progressContext"]["codebasePatterns"], ["pattern one"])

    def test_apply_job_file_sets_expected_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            job_file = tmp / "job.json"
            job_file.write_text(
                json.dumps(
                    {
                        "prdFile": "jobs/prd.json",
                        "workdir": "repo",
                        "stateDb": "state/custom.db",
                        "runtimePrd": "state/runtime.json",
                        "progressFile": "state/progress.txt",
                        "agent": "codex",
                        "model": "gpt-5",
                    }
                ),
                encoding="utf-8",
            )
            (tmp / "jobs").mkdir()
            (tmp / "repo").mkdir()
            (tmp / "state").mkdir()

            with patch.dict(os.environ, {}, clear=True):
                result = config.apply_job_file(job_file)
                self.assertEqual(os.environ["RALPH_AGENT_NAME"], "codex")
                self.assertTrue(os.environ["RALPH_PRD_FILE"].endswith("/jobs/prd.json"))

        self.assertEqual(result["agent"], "codex")


if __name__ == "__main__":
    unittest.main()
