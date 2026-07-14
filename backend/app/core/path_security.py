"""Path security helpers.

Reusable utilities that guard all file operations against path-traversal and
symlink-escape attacks. Every tool that reads from or writes to the workspace
must validate user-supplied paths through :func:`is_safe_workspace_path` before
touching the filesystem.
"""

from __future__ import annotations

import os
from pathlib import Path

from app.core.config import WORKSPACE_DIR


def is_safe_workspace_path(target: str | Path) -> bool:
    """Return ``True`` when ``target`` resolves inside ``workspace/``.

    The check is defence-in-depth and combines several layers:

    1. ``..`` traversal is rejected explicitly — even though ``resolve`` would
       normalise it, rejecting the raw input keeps the failure mode obvious and
       blocks attempts that rely on resolution quirks.
    2. Any symlink component of the path is rejected via ``os.path.islink`` so a
       symlink pointing outside ``workspace/`` cannot escape.
    3. The final resolved path is checked to be a prefix of ``workspace/``.

    Args:
        target: A user-supplied path. May be relative (resolved against the
            current working directory) or absolute.

    Returns:
        ``True`` if the resolved path is inside ``workspace/`` and free of
        symlink escapes, ``False`` otherwise.
    """
    path = Path(target)

    # 1. Reject explicit parent-directory traversal in the raw input.
    if ".." in path.parts:
        return False

    # 2. Reject symlink escape: check the target itself plus every existing
    #    parent component up to the workspace root. A symlink anywhere along the
    #    path could redirect resolution outside workspace/.
    resolved = path.resolve(strict=False)
    if _contains_symlink_escape(resolved):
        return False

    # 3. Prefix check: the resolved path must live under workspace/.
    workspace_root = WORKSPACE_DIR.resolve()
    try:
        resolved.relative_to(workspace_root)
    except ValueError:
        return False

    return True


def _contains_symlink_escape(resolved: Path) -> bool:
    """Return ``True`` if any path component is a symlink pointing outside."""
    workspace_root = WORKSPACE_DIR.resolve()
    # Walk from the deepest existing parent up toward the workspace root.
    # We only need to inspect components that actually exist on disk.
    current = resolved
    while current and current != current.parent:
        try:
            if os.path.islink(current):
                # Resolve the link and ensure it does not land outside workspace.
                link_target = Path(os.readlink(current))
                link_resolved = (
                    link_target
                    if link_target.is_absolute()
                    else (current.parent / link_target)
                ).resolve(strict=False)
                try:
                    link_resolved.relative_to(workspace_root)
                except ValueError:
                    return True
        except OSError:
            # Path does not exist (yet) or is otherwise unreadable — not a
            # symlink escape, just a non-existent component.
            pass
        # Stop once we reach or climb above the workspace root.
        if current == workspace_root:
            break
        current = current.parent
    return False
