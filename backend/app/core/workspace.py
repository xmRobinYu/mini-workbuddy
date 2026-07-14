"""Workspace bootstrap utilities.

Ensures the ``workspace/`` directory tree and seed config files exist on every
startup so the backend is self-initialising.
"""

from __future__ import annotations

import json

from app.core.config import (
    AGENTS_CONFIG_DIR,
    COMMAND_BLOCKLIST_FILE,
    CONFIG_DIR,
    CONVERSATIONS_DIR,
    MODELS_FILE,
    MEMORY_ARCHIVE_DIR,
    MEMORY_DIR,
    SKILLS_CONFIG_DIR,
    WORKSPACE_DIR,
)

DEFAULT_COMMAND_BLOCKLIST = [
    "rm -rf",
    "curl",
    "wget",
    "nc",
    "ssh",
    "scp",
    "chmod 777",
    "mkfs",
    "dd if=/dev/zero",
]

WORKSPACE_GITIGNORE = """\
# Sensitive data - do not commit
.env
config/models.json
conversations/
memory/
"""


def ensure_workspace() -> None:
    """Create workspace directories and seed files if missing."""
    for directory in (
        CONFIG_DIR,
        CONVERSATIONS_DIR,
        MEMORY_DIR,
        MEMORY_ARCHIVE_DIR,
        AGENTS_CONFIG_DIR,
        SKILLS_CONFIG_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    if not MODELS_FILE.exists():
        MODELS_FILE.write_text("[]", encoding="utf-8")

    if not COMMAND_BLOCKLIST_FILE.exists():
        COMMAND_BLOCKLIST_FILE.write_text(
            json.dumps(DEFAULT_COMMAND_BLOCKLIST, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    workspace_gitignore = WORKSPACE_DIR / ".gitignore"
    if not workspace_gitignore.exists():
        workspace_gitignore.write_text(WORKSPACE_GITIGNORE, encoding="utf-8")

    # Seed the default 主 Agent so a fresh install has a usable Agent at boot.
    from app.services.agents_store import ensure_default_agent

    ensure_default_agent()
