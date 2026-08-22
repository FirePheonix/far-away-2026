//! Desktop client for existing assistant HTTP endpoints.
//! Does not change the backend — it only calls what is already there.

use anyhow::Result;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingTask {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
struct TasksResponse {
    #[serde(default)]
    tasks: Vec<TaskJson>,
}

#[derive(Debug, Deserialize)]
struct TaskJson {
    id: String,
    #[serde(default)]
    description: String,
}

fn authorize(
    backend_url: &str,
    token: Option<&str>,
) -> Result<(reqwest::Url, Option<String>)> {
    let parsed = backend_url
        .parse::<reqwest::Url>()
        .map_err(|e| anyhow::anyhow!("invalid backend_url: {e}"))?;
    let scheme = parsed.scheme();
    let host = parsed.host_str().unwrap_or("");
    let is_loopback = host == "localhost" || host == "127.0.0.1" || host == "::1";
    if scheme != "https" && !is_loopback {
        anyhow::bail!(
            "backend_url must use https:// for non-localhost hosts (got {scheme}://). \
             Update backend_url in ~/.local-stt/config.json."
        );
    }
    Ok((parsed, token.map(|t| t.to_string())))
}

fn request(
    method: reqwest::Method,
    backend_url: &str,
    token: Option<&str>,
    path: &str,
    body: Option<Value>,
) -> Result<(reqwest::StatusCode, String)> {
    let (base, token) = authorize(backend_url, token)?;
    let url = format!("{}{}", base.as_str().trim_end_matches('/'), path);

    let mut req = Client::new()
        .request(method, &url)
        .header("Content-Type", "application/json")
        .header("X-Assistant-Source", "local-stt");
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if let Some(b) = body {
        req = req.body(b.to_string());
    }
    let resp = req
        .send()
        .map_err(|e| anyhow::anyhow!("HTTP send failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().unwrap_or_default();
    Ok((status, text))
}

/// POST the transcript as a command to `POST /api/assistant`.
pub fn send_command(
    backend_url: &str,
    token: Option<&str>,
    transcript: &str,
) -> Result<String> {
    let body = serde_json::json!({
        "transcript": transcript,
        "source": "local-stt"
    });
    let (status, body_text) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        "/api/assistant?async=true",
        Some(body),
    )?;
    if status.is_success() {
        let summary = serde_json::from_str::<Value>(&body_text)
            .ok()
            .and_then(|v| {
                v.get("message")
                    .or_else(|| v.get("status"))
                    .or_else(|| v.get("result"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("Sent ({status})"));
        Ok(summary)
    } else {
        Err(anyhow::anyhow!("Backend returned {status}"))
    }
}

pub fn fetch_pending_tasks(backend_url: &str, token: Option<&str>) -> Result<Vec<PendingTask>> {
    let (status, body_text) = request(
        reqwest::Method::GET,
        backend_url,
        token,
        "/api/assistant/tasks",
        None,
    )?;
    if !status.is_success() {
        anyhow::bail!("Backend returned {status}");
    }
    let parsed: TasksResponse = serde_json::from_str(&body_text).unwrap_or(TasksResponse {
        tasks: Vec::new(),
    });
    Ok(parsed
        .tasks
        .into_iter()
        .map(|t| PendingTask {
            id: t.id,
            description: if t.description.trim().is_empty() {
                "Untitled task".into()
            } else {
                t.description
            },
        })
        .collect())
}

pub fn skip_task(backend_url: &str, token: Option<&str>, task_id: &str) -> Result<()> {
    let body = serde_json::json!({ "reason": "Skipped from desktop" });
    let path = format!("/api/assistant/tasks/{task_id}/skip");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(body),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Skip failed ({status})"))
    }
}

pub fn abandon_task(backend_url: &str, token: Option<&str>, task_id: &str) -> Result<()> {
    let body = serde_json::json!({ "reason": "Abandoned from desktop" });
    let path = format!("/api/assistant/tasks/{task_id}/abandon");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(body),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Abandon failed ({status})"))
    }
}

pub fn change_task(
    backend_url: &str,
    token: Option<&str>,
    task_id: &str,
    instruction: &str,
) -> Result<()> {
    let body = serde_json::json!({
        "payload": { "instruction": instruction },
        "editedFields": ["instruction"]
    });
    let path = format!("/api/assistant/tasks/{task_id}/edit");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(body),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Change failed ({status})"))
    }
}

#[derive(Debug, Clone)]
pub struct PairingStart {
    pub pairing_id: String,
    pub code: String,
    pub claim_url: String,
}

pub fn start_pairing(backend_url: &str) -> Result<PairingStart> {
    let body = serde_json::json!({ "deviceName": "local-stt desktop" });
    let (status, text) = request(
        reqwest::Method::POST,
        backend_url,
        None,
        "/api/desktop/pairings",
        Some(body),
    )?;
    if !status.is_success() {
        let hint = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| text.chars().take(120).collect());
        anyhow::bail!("Pairing start failed ({status}): {hint}");
    }
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let pairing_id = v
        .get("pairingId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let code = v
        .get("code")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let claim_url = v
        .get("claimUrl")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if pairing_id.is_empty() || claim_url.is_empty() {
        anyhow::bail!("Pairing response missing pairingId/claimUrl");
    }
    Ok(PairingStart {
        pairing_id,
        code,
        claim_url,
    })
}

/// Returns Some(token) when the user has claimed the pairing in the browser.
pub fn poll_pairing(backend_url: &str, pairing_id: &str) -> Result<Option<String>> {
    let path = format!("/api/desktop/pairings/{pairing_id}");
    let (status, text) = request(reqwest::Method::GET, backend_url, None, &path, None)?;
    if !status.is_success() {
        anyhow::bail!("Pairing status failed ({status})");
    }
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let status_s = v.get("status").and_then(|x| x.as_str()).unwrap_or("");
    if status_s == "claimed" {
        Ok(v.get("token").and_then(|x| x.as_str()).map(|s| s.to_string()))
    } else if status_s == "expired" {
        Err(anyhow::anyhow!("Pairing expired — try Pair account again"))
    } else {
        Ok(None)
    }
}

pub fn open_in_browser(url: &str) {
    let url = url.trim();
    if url.is_empty() {
        println!("[local-stt] open browser skipped — empty url");
        return;
    }
    println!("[local-stt] open browser: {url}");
    // rundll32 does not parse `&` the way `cmd start` does (that produced
    // "Windows cannot find '\\'").
    let launched = std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .is_ok();
    if !launched {
        let _ = std::process::Command::new("cmd")
            .arg("/C")
            .arg(format!("start \"\" \"{url}\""))
            .spawn();
    }
}

// ---------------------------------------------------------------------------
// Obsidian bridge: poll for pending requests, submit results
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct ObsidianRequest {
    pub id: String,
    pub action: String,
    pub params: Value,
}

#[derive(Debug, Deserialize)]
struct ObsidianPendingResponse {
    #[serde(default)]
    requests: Vec<ObsidianRequest>,
}

/// Poll the backend for pending Obsidian requests that need local execution.
pub fn fetch_obsidian_requests(
    backend_url: &str,
    token: Option<&str>,
) -> Result<Vec<ObsidianRequest>> {
    let (status, body) = request(
        reqwest::Method::GET,
        backend_url,
        token,
        "/api/obsidian/pending",
        None,
    )?;
    if !status.is_success() {
        anyhow::bail!("Obsidian pending poll failed ({status})");
    }
    let parsed: ObsidianPendingResponse =
        serde_json::from_str(&body).unwrap_or(ObsidianPendingResponse {
            requests: Vec::new(),
        });
    Ok(parsed.requests)
}

/// Post the result of a local Obsidian operation back to the backend.
pub fn submit_obsidian_result(
    backend_url: &str,
    token: Option<&str>,
    request_id: &str,
    result: Result<Value>,
) -> Result<()> {
    let body = match result {
        Ok(val) => serde_json::json!({ "result": val }),
        Err(e) => serde_json::json!({ "error": format!("{e:#}") }),
    };
    let path = format!("/api/obsidian/{request_id}/result");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(body),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Obsidian result submit failed ({status})"))
    }
}

