"""Send transcripts to the Far Away assistant backend."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
import webbrowser
from typing import Any

from dotenv import load_dotenv

DEFAULT_API_URL = "http://localhost:4001/api/assistant"
TOKEN_FILE = Path.home() / ".clawvio" / "desktop-token"

load_dotenv()


def api_url() -> str:
    return os.environ.get("ASSISTANT_API_URL", DEFAULT_API_URL).rstrip("/")


def api_base_url() -> str:
    return api_url().removesuffix("/assistant")


def is_enabled() -> bool:
    return os.environ.get("ASSISTANT_ENABLED", "true").lower() in ("1", "true", "yes")


def saved_desktop_token() -> str | None:
    env_token = os.environ.get("ASSISTANT_DESKTOP_TOKEN")
    if env_token:
        return env_token.strip()
    try:
        if TOKEN_FILE.exists():
            token = TOKEN_FILE.read_text(encoding="utf-8").strip()
            return token or None
    except OSError:
        return None
    return None


def save_desktop_token(token: str) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(token, encoding="utf-8")


def clear_desktop_token() -> None:
    try:
        TOKEN_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def _headers() -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-Assistant-Source": "local-stt",
    }
    token = saved_desktop_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        user_id = os.environ.get("ASSISTANT_CLERK_USER_ID")
        if user_id:
            headers["X-Clerk-User-Id"] = user_id
    return headers


def create_pairing(device_name: str = "Clawvio desktop") -> dict[str, Any]:
    url = f"{api_base_url()}/desktop/pairings"
    payload = json.dumps({"deviceName": device_name}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Desktop pairing API {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Desktop pairing API unreachable at {url}: {e.reason}") from e


def get_pairing(pairing_id: str) -> dict[str, Any]:
    req = urllib.request.Request(
        f"{api_base_url()}/desktop/pairings/{pairing_id}",
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_paired(*, timeout_s: int = 600) -> str:
    existing = saved_desktop_token()
    if existing:
        return existing

    pairing = create_pairing()
    claim_url = pairing["claimUrl"]
    code = pairing["code"]
    print(f"[local-stt] pair Clawvio desktop with code {code}")
    print(f"[local-stt] opening {claim_url}")
    webbrowser.open(claim_url)

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = get_pairing(pairing["pairingId"])
        if status.get("status") == "claimed" and status.get("token"):
            save_desktop_token(status["token"])
            return status["token"]
        if status.get("status") == "expired":
            raise TimeoutError("Desktop pairing expired. Try again.")
        time.sleep(3)

    raise TimeoutError("Desktop pairing timed out. Try again.")


def logout() -> None:
    token = saved_desktop_token()
    if token:
        url = f"{api_base_url()}/desktop/logout"
        req = urllib.request.Request(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            data=b"{}",
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20):
                pass
        except Exception as e:
            print(f"[local-stt] backend logout warning: {e}")
    clear_desktop_token()


def send_transcript(transcript: str, *, async_mode: bool = False) -> dict[str, Any]:
    """POST transcript to the assistant API. Raises on HTTP or network errors."""
    ensure_paired()
    url = api_url()
    if async_mode:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}async=true"

    payload = json.dumps({"transcript": transcript}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers=_headers(),
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


def get_request_status(request_id: str) -> dict[str, Any]:
    base = api_url().removesuffix("/assistant")
    url = f"{base}/assistant/requests/{request_id}"
    req = urllib.request.Request(url, headers=_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Assistant status API {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Assistant status API unreachable at {url}: {e.reason}") from e


def wait_for_completion(request_id: str, *, timeout_s: int = 180) -> dict[str, Any]:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = get_request_status(request_id)
        request = status.get("request") or {}
        if request.get("status") in ("completed", "failed"):
            return status
        time.sleep(3)
    raise TimeoutError(f"Assistant request {request_id} did not finish within {timeout_s}s")


def normalize_spoken_email(text: str) -> str:
    normalized = text
    normalized = re.sub(r"\s+at\s+", "@", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+dot\s+", ".", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"@\s+", "@", normalized)
    normalized = re.sub(r"\s+@", "@", normalized)
    normalized = re.sub(r"\.\s+", ".", normalized)
    return normalized


def format_completion_toast(status: dict[str, Any]) -> tuple[str, str]:
    request = status.get("request") or {}
    run = status.get("run") or {}
    ok = request.get("status") == "completed" and run.get("success") is not False
    title = "Clawvio completed" if ok else "Clawvio failed"
    if not ok:
        return title, str(run.get("message") or request.get("status") or "Run failed")

    results = run.get("results_json") or {}
    calendar_events = results.get("calendar.list_events") or []
    if isinstance(calendar_events, list) and calendar_events:
        lines = []
        for event in calendar_events[:8]:
            if not isinstance(event, dict):
                continue
            start = _format_event_time(event.get("start"))
            end = _format_event_time(event.get("end"))
            title_text = event.get("title") or "Untitled"
            lines.append(f"{start}-{end}: {title_text}")
        if lines:
            return "Today's schedule", "\n".join(lines)

    calendar_created = results.get("calendar.create_event")
    if isinstance(calendar_created, dict):
        meet = calendar_created.get("meetLink")
        body = calendar_created.get("title") or "Calendar event created"
        if meet:
            body = f"{body}\n{meet}"
        return "Calendar event created", body

    email_sent = results.get("gmail.send_email")
    if isinstance(email_sent, dict):
        return "Email sent", f"To: {email_sent.get('to')}\nSubject: {email_sent.get('subject')}"

    return title, str(run.get("message") or "Run completed")


def _format_event_time(value: Any) -> str:
    if not isinstance(value, str) or len(value) < 16:
        return "?"
    match = re.search(r"T(\d{2}):(\d{2})", value)
    if not match:
        return value[:16]
    hour = int(match.group(1))
    minute = match.group(2)
    suffix = "" if minute == "00" else f":{minute}"
    return f"{hour}{suffix}"


def format_result_summary(result: dict[str, Any]) -> str:
    if result.get("async"):
        return "queued on Inngest"
    steps = result.get("stepsExecuted") or []
    if not steps:
        return result.get("message") or "done"
    tools = ", ".join(s.get("tool", "?") for s in steps[:3])
    suffix = "…" if len(steps) > 3 else ""
    return f"{len(steps)} step(s): {tools}{suffix}"
