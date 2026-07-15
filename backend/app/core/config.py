"""Application configuration and paths.

All runtime data lives under ``workspace/`` relative to the project root so the
backend stays portable and free of database dependencies.
"""

from __future__ import annotations

from pathlib import Path

# backend/app/core/config.py -> backend/app -> backend -> project root
PROJECT_ROOT = Path(__file__).resolve().parents[3]

WORKSPACE_DIR = PROJECT_ROOT / "workspace"
CONFIG_DIR = WORKSPACE_DIR / "config"
CONVERSATIONS_DIR = WORKSPACE_DIR / "conversations"
MEMORY_DIR = WORKSPACE_DIR / "memory"
MEMORY_ARCHIVE_DIR = MEMORY_DIR / "archive"
AGENTS_CONFIG_DIR = CONFIG_DIR / "agents"
SKILLS_CONFIG_DIR = CONFIG_DIR / "skills"

MODELS_FILE = CONFIG_DIR / "models.json"
COMMAND_BLOCKLIST_FILE = CONFIG_DIR / "command_blocklist.json"
TOOLS_FILE = CONFIG_DIR / "tools.json"

# Frontend dev server origin allowed by CORS.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
