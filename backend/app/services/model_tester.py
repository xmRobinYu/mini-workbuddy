"""Model connection testing service (US-004).

Probes an OpenAI-compatible endpoint with a minimal chat-completions request
to verify that the configured base URL and API key actually work. The probe
is deliberately tiny (max_tokens=1) to minimise latency and cost.

Error classification:
- Network timeout        -> "连接超时：<详情>"
- Authentication failure -> "认证失败：API 密钥无效或已过期"
- Model not found        -> "模型不存在：<模型名>"
- Other HTTP errors      -> "连接失败：HTTP <状态码> <原因>"
- Connection errors      -> "连接失败：<详情>"
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from app.services.keyring_service import get_api_key, ref_to_key_id

# Probe timeout: short enough to fail fast, long enough for healthy endpoints.
PROBE_TIMEOUT = 15.0
PROBE_MAX_TOKENS = 1


def _resolve_api_key(model: dict[str, Any]) -> str | None:
    """Return the plaintext API key for ``model`` from keychain or env.

    Falls back to the environment variable named in ``api_key_env`` when the
    keychain is unavailable or empty.
    """
    key_id = ref_to_key_id(model.get("api_key_ref"))
    if key_id:
        key = get_api_key(key_id)
        if key:
            return key
    env_name = model.get("api_key_env")
    if env_name:
        return os.environ.get(env_name)
    return None


def _build_chat_url(base_url: str) -> str:
    """Ensure the base URL ends with ``/v1/chat/completions``."""
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return base + "/chat/completions"
    if base.endswith("/chat/completions"):
        return base
    return base + "/v1/chat/completions"


def _classify_http_error(
    status_code: int, phrase: str, model_name: str
) -> str:
    """Map an HTTP error status to a human-readable Chinese message."""
    if status_code in (401, 403):
        return "认证失败：API 密钥无效或已过期"
    if status_code == 404:
        return f"模型不存在：{model_name}"
    return f"连接失败：HTTP {status_code} {phrase}"


async def test_model_connection(
    model: dict[str, Any], model_name_for_probe: str | None = None
) -> dict[str, Any]:
    """Probe a model endpoint and return a result dict.

    The returned dict matches :class:`ModelTestResult` fields:
    ``{"success": bool, "latency_ms": int | None, "error": str | None}``.

    ``model_name_for_probe`` overrides the model name sent in the probe
    request body; when omitted it defaults to the stored ``name`` field.
    """
    api_key = _resolve_api_key(model)
    if not api_key:
        return {
            "success": False,
            "latency_ms": None,
            "error": "认证失败：未配置 API 密钥",
        }

    base_url = str(model.get("base_url", "")).rstrip("/")
    if not base_url:
        return {
            "success": False,
            "latency_ms": None,
            "error": "连接失败：base_url 未配置",
        }

    chat_url = _build_chat_url(base_url)
    probe_model = model_name_for_probe or model.get("model") or model.get("name", "test")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": probe_model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": PROBE_MAX_TOKENS,
        "stream": False,
    }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT) as client:
            resp = await client.post(chat_url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        return {
            "success": False,
            "latency_ms": None,
            "error": f"连接超时：{exc}",
        }
    except httpx.ConnectError as exc:
        return {
            "success": False,
            "latency_ms": None,
            "error": f"连接失败：{exc}",
        }
    except httpx.HTTPError as exc:  # pragma: no cover - defensive catch-all
        return {
            "success": False,
            "latency_ms": None,
            "error": f"连接失败：{exc}",
        }

    latency_ms = int((time.monotonic() - start) * 1000)

    if resp.status_code >= 400:
        error_msg = _classify_http_error(
            resp.status_code,
            resp.reason_phrase or "",
            probe_model,
        )
        return {
            "success": False,
            "latency_ms": None,
            "error": error_msg,
        }

    # Validate OpenAI-compatible response shape: must have either "choices"
    # (chat completions) or "data"/"object" (models listing). We sent a chat
    # request, so expect a JSON body with "choices".
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001 - any parse failure is a compat issue
        return {
            "success": False,
            "latency_ms": None,
            "error": "连接失败：响应不是有效的 JSON",
        }

    if not isinstance(body, dict) or "choices" not in body:
        return {
            "success": False,
            "latency_ms": None,
            "error": "连接失败：响应不符合 OpenAI /v1/chat/completions 格式",
        }

    return {
        "success": True,
        "latency_ms": latency_ms,
        "error": None,
    }
