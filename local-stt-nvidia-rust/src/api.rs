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
    /// "user_input" when the planner needs details, "step_failure" when a tool
    /// failed permanently and is handing the work back.
    pub kind: String,
    pub request_id: Option<String>,
    pub step_index: Option<i64>,
    /// Readable cause, present on step_failure tasks.
    pub error_message: Option<String>,
    pub error_kind: Option<String>,
    pub tool: Option<String>,
    /// Which buttons the backend says are available: retry / skip / abandon / reconnect.
    pub actions: Vec<String>,
    /// When the workflow stops waiting — bounds how long a snooze may be.
    pub wait_expires_at: Option<String>,
}

impl PendingTask {
    pub fn is_failure(&self) -> bool {
        self.kind == "step_failure"
    }
    pub fn allows(&self, action: &str) -> bool {
        self.actions.is_empty() || self.actions.iter().any(|a| a == action)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReasonChip {
    pub code: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FlowStep {
    pub index: i64,
    pub title: String,
    pub status: String,
    pub attempt: i64,
    pub error_message: Option<String>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Trace {
    pub request_id: String,
    pub run_id: Option<String>,
    pub transcript: String,
    pub status: String,
    pub steps: Vec<FlowStep>,
    pub tasks: Vec<PendingTask>,
    pub closure_reason: Option<String>,
    pub closed_by: Option<String>,
    pub follow_up_required: bool,
}

impl Trace {
    /// True once the request reached a terminal state.
    pub fn is_settled(&self) -> bool {
        matches!(self.status.as_str(), "completed" | "failed" | "abandoned")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Unresolved {
    pub open: Vec<PendingTask>,
    pub follow_ups: Vec<FollowUp>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FollowUp {
    pub description: String,
    pub status: String,
    pub reason: String,
    pub closed_by: String,
    pub closed_at: String,
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
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    run_id: Option<String>,
    #[serde(default)]
    step_index: Option<i64>,
    #[serde(default)]
    context_json: Option<Value>,
    #[serde(default)]
    wait_expires_at: Option<String>,
}

impl TaskJson {
    fn into_task(self) -> PendingTask {
        let ctx = self.context_json.unwrap_or(Value::Null);
        let str_field = |key: &str| {
            ctx.get(key)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        };
        let actions = ctx
            .get("actions")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        PendingTask {
            id: self.id,
            description: if self.description.trim().is_empty() {
                "Untitled task".into()
            } else {
                self.description
            },
            kind: self.kind.unwrap_or_else(|| "user_input".into()),
            request_id: self.run_id,
            step_index: self.step_index,
            error_message: str_field("errorMessage"),
            error_kind: str_field("errorKind"),
            tool: str_field("tool"),
            actions,
            wait_expires_at: self.wait_expires_at,
        }
    }
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

#[derive(Debug, Clone)]
pub struct CommandSent {
    pub message: String,
    /// Needed to poll the trace for this specific run.
    pub request_id: Option<String>,
}

/// POST the transcript as a command to `POST /api/assistant`.
pub fn send_command(
    backend_url: &str,
    token: Option<&str>,
    transcript: &str,
) -> Result<CommandSent> {
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
        let parsed = serde_json::from_str::<Value>(&body_text).ok();
        let summary = parsed
            .as_ref()
            .and_then(|v| {
                v.get("message")
                    .or_else(|| v.get("status"))
                    .or_else(|| v.get("result"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("Sent ({status})"));
        let request_id = parsed
            .as_ref()
            .and_then(|v| v.get("requestId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        Ok(CommandSent {
            message: summary,
            request_id,
        })
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
    Ok(parsed.tasks.into_iter().map(TaskJson::into_task).collect())
}

/// Live agent flow for one request: the plan, per-step status, and why a step failed.
pub fn fetch_trace(backend_url: &str, token: Option<&str>, request_id: &str) -> Result<Trace> {
    let path = format!("/api/assistant/requests/{request_id}/trace");
    let (status, body_text) = request(reqwest::Method::GET, backend_url, token, &path, None)?;
    if !status.is_success() {
        anyhow::bail!("Trace returned {status}");
    }
    let v: Value = serde_json::from_str(&body_text).unwrap_or(Value::Null);

    let steps = v
        .get("steps")
        .and_then(|s| s.as_array())
        .map(|arr| {
            arr.iter()
                .map(|s| FlowStep {
                    index: s.get("step_index").and_then(|x| x.as_i64()).unwrap_or(0),
                    title: s
                        .get("title")
                        .and_then(|x| x.as_str())
                        .or_else(|| s.get("tool_name").and_then(|x| x.as_str()))
                        .unwrap_or("Step")
                        .to_string(),
                    status: s
                        .get("status")
                        .and_then(|x| x.as_str())
                        .unwrap_or("pending")
                        .to_string(),
                    attempt: s.get("attempt").and_then(|x| x.as_i64()).unwrap_or(0),
                    error_message: s
                        .get("error_message")
                        .and_then(|x| x.as_str())
                        .map(|x| x.to_string()),
                    duration_ms: s.get("duration_ms").and_then(|x| x.as_i64()),
                })
                .collect()
        })
        .unwrap_or_default();

    let tasks = v
        .get("tasks")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| serde_json::from_value::<TaskJson>(t.clone()).ok())
                .map(TaskJson::into_task)
                .collect()
        })
        .unwrap_or_default();

    let run = v.get("run");
    let request_obj = v.get("request");

    Ok(Trace {
        request_id: request_id.to_string(),
        run_id: run
            .and_then(|r| r.get("id"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        transcript: request_obj
            .and_then(|r| r.get("transcript"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        status: request_obj
            .and_then(|r| r.get("status"))
            .and_then(|x| x.as_str())
            .unwrap_or("queued")
            .to_string(),
        steps,
        tasks,
        closure_reason: run
            .and_then(|r| r.get("abandonment_reason").or_else(|| r.get("closure_note")))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        closed_by: run
            .and_then(|r| r.get("closed_by"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        follow_up_required: run
            .and_then(|r| r.get("follow_up_required"))
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
    })
}

/// Reason chips, fetched so the vocabulary lives in one place on the server.
pub fn fetch_closure_reasons(backend_url: &str, token: Option<&str>) -> Result<Vec<ReasonChip>> {
    let (status, body_text) = request(
        reqwest::Method::GET,
        backend_url,
        token,
        "/api/assistant/closure-reasons",
        None,
    )?;
    if !status.is_success() {
        anyhow::bail!("Reasons returned {status}");
    }
    let v: Value = serde_json::from_str(&body_text).unwrap_or(Value::Null);
    Ok(v.get("reasons")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    Some(ReasonChip {
                        code: r.get("code")?.as_str()?.to_string(),
                        label: r.get("label")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// Handback inbox: still open, plus recently closed work that left something behind.
pub fn fetch_unresolved(backend_url: &str, token: Option<&str>) -> Result<Unresolved> {
    let (status, body_text) = request(
        reqwest::Method::GET,
        backend_url,
        token,
        "/api/assistant/unresolved",
        None,
    )?;
    if !status.is_success() {
        anyhow::bail!("Unresolved returned {status}");
    }
    let v: Value = serde_json::from_str(&body_text).unwrap_or(Value::Null);

    let open = v
        .get("open")
        .and_then(|o| o.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| serde_json::from_value::<TaskJson>(t.clone()).ok())
                .map(TaskJson::into_task)
                .collect()
        })
        .unwrap_or_default();

    let follow_ups = v
        .get("followUps")
        .and_then(|o| o.as_array())
        .map(|arr| {
            arr.iter()
                .map(|t| {
                    let text = |key: &str| {
                        t.get(key)
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string()
                    };
                    let reason_label = t
                        .get("closure_reason_code")
                        .and_then(|x| x.as_str())
                        .unwrap_or("unspecified")
                        .replace('_', " ");
                    let note = t.get("closure_note").and_then(|x| x.as_str());
                    FollowUp {
                        description: text("description"),
                        status: text("status"),
                        reason: match note {
                            Some(n) if !n.is_empty() => format!("{reason_label} — {n}"),
                            _ => reason_label,
                        },
                        closed_by: text("closed_by"),
                        closed_at: text("closed_at").chars().take(16).collect(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(Unresolved { open, follow_ups })
}

fn closure_body(reason_code: &str, note: Option<&str>) -> Value {
    serde_json::json!({
        "reasonCode": reason_code,
        "note": note.unwrap_or_default(),
    })
}

pub fn skip_task(
    backend_url: &str,
    token: Option<&str>,
    task_id: &str,
    reason_code: &str,
    note: Option<&str>,
) -> Result<()> {
    let path = format!("/api/assistant/tasks/{task_id}/skip");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(closure_body(reason_code, note)),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Skip failed ({status})"))
    }
}

pub fn abandon_task(
    backend_url: &str,
    token: Option<&str>,
    task_id: &str,
    reason_code: &str,
    note: Option<&str>,
) -> Result<()> {
    let path = format!("/api/assistant/tasks/{task_id}/abandon");
    let (status, _) = request(
        reqwest::Method::POST,
        backend_url,
        token,
        &path,
        Some(closure_body(reason_code, note)),
    )?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Abandon failed ({status})"))
    }
}

/// Snooze. The backend caps the duration inside the workflow's wait window.
pub fn pause_task(
    backend_url: &str,
    token: Option<&str>,
    task_id: &str,
    minutes: i64,
    note: Option<&str>,
) -> Result<String> {
    let path = format!("/api/assistant/tasks/{task_id}/pause");
    let body = serde_json::json!({
        "minutes": minutes,
        "reasonCode": "deferred",
        "note": note.unwrap_or_default(),
    });
    let (status, text) = request(reqwest::Method::POST, backend_url, token, &path, Some(body))?;
    if !status.is_success() {
        anyhow::bail!("Pause failed ({status})");
    }
    let resume = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| {
            v.get("resumeAt")
                .and_then(|x| x.as_str())
                .map(|s| s.chars().skip(11).take(5).collect::<String>())
        })
        .unwrap_or_default();
    Ok(resume)
}

/// Answers a step_failure handback: retry, skip, or abandon.
pub fn decide_task(
    backend_url: &str,
    token: Option<&str>,
    task_id: &str,
    decision: &str,
    reason_code: &str,
    note: Option<&str>,
) -> Result<()> {
    let path = format!("/api/assistant/tasks/{task_id}/decide");
    let body = serde_json::json!({
        "decision": decision,
        "reasonCode": reason_code,
        "note": note.unwrap_or_default(),
    });
    let (status, _) = request(reqwest::Method::POST, backend_url, token, &path, Some(body))?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Decision failed ({status})"))
    }
}

/// Stops an in-flight run outright. Requires a reason.
pub fn abandon_run(
    backend_url: &str,
    token: Option<&str>,
    run_id: &str,
    request_id: &str,
    reason_code: &str,
    note: Option<&str>,
) -> Result<()> {
    let path = format!("/api/assistant/runs/{run_id}/abandon");
    let body = serde_json::json!({
        "requestId": request_id,
        "reasonCode": reason_code,
        "note": note.unwrap_or_default(),
    });
    let (status, _) = request(reqwest::Method::POST, backend_url, token, &path, Some(body))?;
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Stop failed ({status})"))
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

