"""OS keychain secret storage for model API keys.

Secrets are stored via the ``keyring`` library under the service name
``mini-workbuddy.models``. ``models.json`` only ever holds a non-secret
reference of the form ``keychain://<key_id>``; the plaintext key lives in the
keychain. When the keychain backend is unavailable (headless CI, missing
secret-service), callers fall back to ``api_key_env`` and ``api_key_ref`` is
left ``null``.
"""

from __future__ import annotations

import logging
from typing import Optional

import keyring
import keyring.errors

logger = logging.getLogger(__name__)

SERVICE_NAME = "mini-workbuddy.models"
KEY_REF_SCHEME = "keychain://"


class KeychainUnavailableError(RuntimeError):
    """Raised when the OS keychain cannot store or retrieve secrets."""


def _is_backend_available() -> bool:
    """True when the active keyring backend can persist secrets.

    The fail/Null backends report themselves as non-promptable and cannot
    store credentials; treat those as unavailable so callers degrade to
    ``api_key_env`` instead of silently dropping the secret.
    """
    backend = keyring.get_keyring()
    name = getattr(backend, "name", "")
    # keyring ships ``fail.Keyring`` and ``Null`` backends for environments
    # without a secret store; their names contain "fail" or "null".
    lowered = name.lower()
    return "fail" not in lowered and "null" not in lowered


def store_api_key(key_id: str, api_key: str) -> str:
    """Store ``api_key`` under ``key_id`` and return the ``keychain://`` ref.

    Raises ``KeychainUnavailableError`` when no usable backend exists.
    """
    if not _is_backend_available():
        raise KeychainUnavailableError(
            "OS keychain backend unavailable; use api_key_env fallback instead"
        )
    keyring.set_password(SERVICE_NAME, key_id, api_key)
    return f"{KEY_REF_SCHEME}{key_id}"


def get_api_key(key_id: str) -> Optional[str]:
    """Retrieve the plaintext key for ``key_id``, or ``None`` if missing."""
    if not _is_backend_available():
        return None
    try:
        return keyring.get_password(SERVICE_NAME, key_id)
    except keyring.errors.KeyringError as exc:  # pragma: no cover - defensive
        logger.warning("keyring get_password failed for %s: %s", key_id, exc)
        return None


def delete_api_key(key_id: str) -> None:
    """Best-effort deletion of the stored secret for ``key_id``."""
    if not _is_backend_available():
        return
    try:
        keyring.delete_password(SERVICE_NAME, key_id)
    except keyring.errors.PasswordDeleteError:
        # Already absent - nothing to clean up.
        logger.debug("keyring secret %s already absent", key_id)
    except keyring.errors.KeyringError as exc:  # pragma: no cover - defensive
        logger.warning("keyring delete_password failed for %s: %s", key_id, exc)


def ref_to_key_id(api_key_ref: Optional[str]) -> Optional[str]:
    """Extract the ``key_id`` portion from a ``keychain://<id>`` reference."""
    if not api_key_ref or not api_key_ref.startswith(KEY_REF_SCHEME):
        return None
    return api_key_ref[len(KEY_REF_SCHEME):]


def is_available() -> bool:
    """Public check used by the models API to decide fallback strategy."""
    return _is_backend_available()
