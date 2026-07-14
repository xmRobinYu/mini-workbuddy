import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import state_store


class StateStoreTest(unittest.TestCase):
    def _write_prd(self, tmpdir: str) -> Path:
        path = Path(tmpdir) / "prd.json"
        path.write_text(
            json.dumps(
                {
                    "project": "SkillHub",
                    "branchName": "test-branch",
                    "description": "demo",
                    "userStories": [
                        {
                            "id": "US-001",
                            "title": "One",
                            "passes": False,
                            "blocked": False,
                            "notes": "",
                            "retryCount": 0,
                            "workflowMode": "develop_only",
                        },
                        {
                            "id": "US-002",
                            "title": "Two",
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

    def test_initialize_and_update_runtime_state_exports_runtime_prd(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path = self._write_prd(tmpdir)
            db_path = Path(tmpdir) / "state.db"
            runtime_path = Path(tmpdir) / "prd.runtime.json"

            merged = state_store.ensure_initialized(
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            updated = state_store.update_story_fields(
                "US-001",
                {"passes": True, "notes": "done"},
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            exported = json.loads(runtime_path.read_text(encoding="utf-8"))

        self.assertEqual(merged["project"], "SkillHub")
        self.assertTrue(updated["passes"])
        self.assertEqual(updated["notes"], "done")
        self.assertTrue(exported["userStories"][0]["passes"])
        self.assertEqual(exported["userStories"][0]["notes"], "done")

    def test_get_current_story_id_reads_from_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path = self._write_prd(tmpdir)
            db_path = Path(tmpdir) / "state.db"
            runtime_path = Path(tmpdir) / "prd.runtime.json"
            state_store.ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_path)
            state_store.update_story_fields(
                "US-001",
                {"passes": True},
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )

            current = state_store.get_current_story_id(prd_path=prd_path, db_path=db_path)

        self.assertEqual(current, "US-002")

    def test_all_stories_resolved_uses_state_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path = self._write_prd(tmpdir)
            db_path = Path(tmpdir) / "state.db"
            runtime_path = Path(tmpdir) / "prd.runtime.json"
            state_store.ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_path)
            state_store.update_story_fields(
                "US-001",
                {"passes": True},
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            state_store.update_story_fields(
                "US-002",
                {"blocked": True},
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )

            resolved = state_store.all_stories_resolved(prd_path=prd_path, db_path=db_path)

        self.assertTrue(resolved)

    def test_story_timing_accumulates_and_records_completion(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            prd_path = self._write_prd(tmpdir)
            db_path = Path(tmpdir) / "state.db"
            runtime_path = Path(tmpdir) / "prd.runtime.json"
            state_store.ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_path)
            state_store.mark_story_phase_started(
                "US-001",
                phase="develop",
                started_at=100,
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            state_store.mark_story_phase_finished(
                "US-001",
                finished_at=145,
                mark_complete=True,
                prd_path=prd_path,
                db_path=db_path,
                runtime_prd_path=runtime_path,
            )
            story = state_store.get_story("US-001", prd_path=prd_path, db_path=db_path)

        self.assertEqual(story["startedAt"], 100)
        self.assertEqual(story["completedAt"], 145)
        self.assertEqual(story["totalElapsedSeconds"], 45)


if __name__ == "__main__":
    unittest.main()
