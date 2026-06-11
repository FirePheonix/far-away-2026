"""Send transcripts to the Far Away assistant backend."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_API_URL = "http://localhost:4001/api/assistant"


def api_url() -> str:
    return os.environ.get("ASSISTANT_API_URL", DEFAULT_API_URL).rstrip("/")


def is_enabled() -> bool:
    return os.environ.get("ASSISTANT_ENABLED", "true").lower() in ("1", "true", "yes")


def send_transcript(transcript: str, *, async_mode: bool = False) -> dict[str, Any]:
    """POST transcript to the assistant API. Raises on HTTP or network errors."""
    url = api_url()
    if async_mode:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}async=true"

    payload = json.dumps({"transcript": transcript}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Assistant API {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Assistant API unreachable at {url}: {e.reason}") from e


def format_result_summary(result: dict[str, Any]) -> str:
    if result.get("async"):
        return "queued on Inngest"
    steps = result.get("stepsExecuted") or []
    if not steps:
        return result.get("message") or "done"
    tools = ", ".join(s.get("tool", "?") for s in steps[:3])
    suffix = "…" if len(steps) > 3 else ""
    return f"{len(steps)} step(s): {tools}{suffix}"
