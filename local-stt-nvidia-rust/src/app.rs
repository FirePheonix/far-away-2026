//! Main egui app: overlay + tray + hotkey + audio + ASR orchestration.
//!
//! Live pipeline: while you speak, peel ~10s chunks and decode them in the
//! background so stop → clipboard is usually just the leftover tail.
//!
//! Two recording modes (set at the moment the first hotkey press starts
//! recording):
//!   OCR     (Ctrl+Shift+Space)  → transcript copied to clipboard on stop.
//!   Command (Ctrl+Shift+Enter)  → transcript POSTed to backend /api/assistant
//!                                  via the desktop token from config.json.

use anyhow::Result;
use arboard::Clipboard;
use crossbeam_channel::{unbounded, Receiver, Sender};
use eframe::egui::{self, ViewportCommand};
use parking_lot::Mutex;
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use crate::asr::AsrEngine;
use crate::audio::Recorder;
use crate::config;
use crate::hotkey::{HotkeyKind, Hotkeys, UiWake};
use crate::overlay::{Overlay, OverlayState, RecordMode, CARD_W, CARD_CHROME_H};
use crate::tray::Tray;
use crate::util::SAMPLE_RATE;

/// Decode audio in this many seconds while the user is still talking.
const LIVE_CHUNK_SECS: u32 = 10;
const LIVE_CHUNK_SAMPLES: usize = (SAMPLE_RATE as usize) * (LIVE_CHUNK_SECS as usize);

enum WorkerMsg {
    EngineReady(Result<Arc<AsrEngine>, String>),
    ChunkDone { speaker: String, id: usize, segments: Vec<crate::asr::Segment> },
    CommandSent { ok: bool, message: String },
}

/// One dictation: chunks decoded live, assembled in order on stop.
struct LiveSession {
    next_id_user: usize,
    next_id_other: usize,
    in_flight: usize,
    segments: Vec<(f32, String, String)>, // (abs_start_time, speaker, text)
    chunks_done_user: usize,
    chunks_done_other: usize,
    expected_user: Option<usize>,
    expected_other: Option<usize>,
    finishing: bool,
    /// Mode that was active when recording started.
    mode: RecordMode,
}

impl LiveSession {
    fn new(mode: RecordMode) -> Self {
        Self {
            next_id_user: 0,
            next_id_other: 0,
            in_flight: 0,
            segments: Vec::new(),
            chunks_done_user: 0,
            chunks_done_other: 0,
            expected_user: None,
            expected_other: None,
            finishing: false,
            mode,
        }
    }

    fn all_done(&self) -> bool {
        if !self.finishing { return false; }
        let eu = self.expected_user.unwrap_or(0);
        let eo = self.expected_other.unwrap_or(0);
        self.chunks_done_user >= eu && self.chunks_done_other >= eo && self.in_flight == 0
    }

    fn joined(&self) -> String {
        let mut sorted = self.segments.clone();
        sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let mut lines = Vec::new();
        for (_, speaker, txt) in &sorted {
            lines.push(format!("  \"{}\" : \"{}\"", speaker, txt));
        }
        if lines.is_empty() {
            String::new()
        } else {
            format!("{{\n{}\n}}", lines.join(",\n"))
        }
    }

    /// Plain user-only transcript (no JSON wrapper), used for Command mode.
    fn user_transcript(&self) -> String {
        let mut sorted = self.segments.clone();
        sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        sorted
            .iter()
            .filter(|(_, speaker, _)| speaker == "user")
            .map(|(_, _, txt)| txt.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

pub struct LocalSttApp {
    overlay: Overlay,
    tray: Tray,
    hotkeys: Hotkeys,
    ui_wake: UiWake,
    recorder: Recorder,
    engine: Option<Arc<AsrEngine>>,
    recording: bool,
    session: Option<LiveSession>,
    worker_tx: Sender<WorkerMsg>,
    worker_rx: Receiver<WorkerMsg>,
    started: Instant,
    last_frame: Instant,
    wake_installed: bool,
    /// True while the overlay is visible; flipped to false once we've sent the
    /// one-shot Focus command so we don't steal focus every frame.
    did_focus: bool,
}

impl LocalSttApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Result<Self> {
        let mut style = (*cc.egui_ctx.style()).clone();
        style.visuals = egui::Visuals::dark();
        cc.egui_ctx.set_style(style);

        let ui_wake: UiWake = Arc::new(Mutex::new(None));
        let tray = Tray::new()?;
        let hotkeys = Hotkeys::register(ui_wake.clone())?;
        let recorder = Recorder::new()?;

        let (worker_tx, worker_rx) = unbounded();

        let tx = worker_tx.clone();
        let wake = ui_wake.clone();
        thread::spawn(move || {
            let result = AsrEngine::load().map_err(|e| format!("{e:#}"));
            let _ = tx.send(WorkerMsg::EngineReady(result));
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });

        Ok(Self {
            overlay: Overlay::default(),
            tray,
            hotkeys,
            ui_wake,
            recorder,
            engine: None,
            recording: false,
            session: None,
            worker_tx,
            worker_rx,
            started: Instant::now(),
            last_frame: Instant::now(),
            wake_installed: false,
            did_focus: false,
        })
    }

    fn now(&self) -> f64 {
        self.started.elapsed().as_secs_f64()
    }

    fn spawn_chunk(&mut self, speaker: &str, id: usize, audio: Vec<f32>) {
        let Some(engine) = self.engine.clone() else {
            return;
        };
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        if let Some(s) = self.session.as_mut() {
            s.in_flight += 1;
        }
        let secs = audio.len() as f32 / SAMPLE_RATE as f32;
        let speaker_str = speaker.to_string();
        let abs_chunk_start = id as f32 * LIVE_CHUNK_SECS as f32;

        println!("[local-stt] queue {speaker_str} chunk #{id} ({secs:.1}s) — decoding while you speak");
        thread::spawn(move || {
            let label = format!("{speaker_str}#{id}");
            let segments = match engine.transcribe_labeled(&audio, Some(&label)) {
                Ok(segs) => {
                    segs.into_iter().map(|s| {
                        crate::asr::Segment {
                            start_time: s.start_time + abs_chunk_start,
                            text: s.text,
                        }
                    }).collect()
                },
                Err(e) => {
                    println!("[local-stt] {speaker_str} chunk #{id} error: {e:#}");
                    Vec::new()
                }
            };
            let _ = tx.send(WorkerMsg::ChunkDone { speaker: speaker_str, id, segments });
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }

    /// Peel full live chunks from the mic/loopback buffers
    fn pump_live_chunks(&mut self) {
        // Drain unconditionally every frame to keep the bounded audio channel
        // from filling up, even when the engine is still loading or not recording.
        self.recorder.drain();

        if !self.recording || self.engine.is_none() {
            return;
        }

        while self.recorder.buffered_user() >= LIVE_CHUNK_SAMPLES {
            let Some(chunk) = self.recorder.take_prefix_user(LIVE_CHUNK_SAMPLES) else {
                break;
            };
            let id = {
                let s = self.session.get_or_insert_with(|| LiveSession::new(RecordMode::Ocr));
                let id = s.next_id_user;
                s.next_id_user += 1;
                id
            };
            self.spawn_chunk("user", id, chunk);
        }
        while self.recorder.buffered_other() >= LIVE_CHUNK_SAMPLES {
            let Some(chunk) = self.recorder.take_prefix_other(LIVE_CHUNK_SAMPLES) else {
                break;
            };
            let id = {
                let s = self.session.get_or_insert_with(|| LiveSession::new(RecordMode::Ocr));
                let id = s.next_id_other;
                s.next_id_other += 1;
                id
            };
            self.spawn_chunk("other", id, chunk);
        }
    }

    fn toggle_record(&mut self, kind: HotkeyKind) {
        if self.engine.is_none() {
            println!("[local-stt] model not ready yet — wait for 'Parakeet INT8 ready'");
            return;
        }
        // Ignore toggles while we're assembling the final result
        if self.session.as_ref().is_some_and(|s| s.finishing) {
            return;
        }

        if !self.recording {
            let mode = match kind {
                HotkeyKind::Ocr => RecordMode::Ocr,
                HotkeyKind::Command => RecordMode::Command,
            };
            self.recording = true;
            self.session = Some(LiveSession::new(mode));
            self.recorder.start();
            self.overlay.show_listening(mode);
            let mode_label = match mode {
                RecordMode::Ocr => "OCR",
                RecordMode::Command => "Command",
            };
            self.tray.set_tooltip(&format!("local-stt - recording [{mode_label}] (live chunks)..."));
            println!(
                "[local-stt] recording [{mode_label}]... (live {LIVE_CHUNK_SECS}s chunks while you speak)"
            );
        } else {
            // Stop — mode is already locked in the session
            self.recording = false;
            let (tail_user, tail_other) = self.recorder.stop();
            let (id_u, _exp_u, id_o, _exp_o) = {
                let s = self.session.get_or_insert_with(|| LiveSession::new(RecordMode::Ocr));
                let id_u = s.next_id_user;
                let id_o = s.next_id_other;
                s.next_id_user += 1;
                s.next_id_other += 1;
                s.finishing = true;
                let exp_u = id_u + 1;
                let exp_o = id_o + 1;
                s.expected_user = Some(exp_u);
                s.expected_other = Some(exp_o);
                (id_u, exp_u, id_o, exp_o)
            };

            self.overlay.show_processing();
            self.tray.set_tooltip("local-stt - finishing...");
            let tail_u_s = tail_user.len() as f32 / SAMPLE_RATE as f32;
            let tail_o_s = tail_other.len() as f32 / SAMPLE_RATE as f32;
            println!("[local-stt] stopped — user tail {tail_u_s:.1}s as chunk #{id_u}, other tail {tail_o_s:.1}s as chunk #{id_o}");

            if tail_user.len() >= (SAMPLE_RATE as usize) * 3 / 10 {
                self.spawn_chunk("user", id_u, tail_user);
            } else {
                let _ = self.worker_tx.send(WorkerMsg::ChunkDone {
                    speaker: "user".to_string(),
                    id: id_u,
                    segments: Vec::new(),
                });
            }

            if tail_other.len() >= (SAMPLE_RATE as usize) * 3 / 10 {
                self.spawn_chunk("other", id_o, tail_other);
            } else {
                let _ = self.worker_tx.send(WorkerMsg::ChunkDone {
                    speaker: "other".to_string(),
                    id: id_o,
                    segments: Vec::new(),
                });
            }

            // Maybe everything already finished during speech
            self.try_finalize();
        }
    }

    fn try_finalize(&mut self) {
        let Some(session) = self.session.as_ref() else {
            return;
        };
        if !session.finishing || !session.all_done() {
            return;
        }

        match session.mode {
            RecordMode::Ocr => self.finalize_ocr(),
            RecordMode::Command => self.finalize_command(),
        }
    }

    fn finalize_ocr(&mut self) {
        let Some(session) = self.session.take() else { return };
        let text = session.joined();
        let ok = if !text.is_empty() {
            let clipboard_ok = Clipboard::new()
                .and_then(|mut cb| cb.set_text(&text))
                .is_ok();
            if clipboard_ok {
                log::debug!("[local-stt] OCR copied to clipboard");
            } else {
                log::warn!("[local-stt] OCR — clipboard write failed");
                println!("[local-stt] OCR — clipboard write failed");
            }
            clipboard_ok
        } else {
            println!("[local-stt] OCR — nothing heard");
            false
        };
        self.overlay.show_result(text, ok, self.now());
        self.update_tray_ready_label();
    }

    fn finalize_command(&mut self) {
        let Some(session) = self.session.take() else { return };
        let transcript = session.user_transcript();
        if transcript.is_empty() {
            println!("[local-stt] Command — nothing heard");
            self.overlay.show_result(String::new(), false, self.now());
            self.update_tray_ready_label();
            return;
        }

        println!("[local-stt] Command — sending to backend ({} chars)", transcript.len());
        log::debug!("[local-stt] Command transcript: {transcript:?}");

        // Reload config fresh so desktop_token and backend_url are up to date
        // (user may have paired since startup).
        let cfg = config::load();
        let backend_url = cfg.backend_url.clone();
        let token = cfg.desktop_token.clone();

        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();

        thread::spawn(move || {
            let result = send_command_to_backend(&backend_url, token.as_deref(), &transcript);
            let (ok, message) = match result {
                Ok(msg) => {
                    log::debug!("[local-stt] Command sent OK: {msg}");
                    println!("[local-stt] Command sent OK");
                    (true, msg)
                }
                Err(e) => {
                    // Don't include the raw error chain in the message shown to the
                    // user or stdout — it may contain URL/header fragments.
                    let display = format!("{e}");
                    log::debug!("[local-stt] Command failed (detail): {e:#}");
                    println!("[local-stt] Command failed: {display}");
                    (false, display)
                }
            };
            let _ = tx.send(WorkerMsg::CommandSent { ok, message });
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });

        // Show "Sending…" in the overlay while the HTTP request is in-flight.
        self.overlay.show_sending();
        // session already taken above, so we're clean for the next recording.
    }

    fn update_tray_ready_label(&self) {
        let tip = self
            .engine
            .as_ref()
            .map(|e| format!("local-stt - {}", e.label()))
            .unwrap_or_else(|| "local-stt - ready".into());
        self.tray.set_tooltip(&tip);
    }

    fn poll_workers(&mut self) {
        while let Ok(msg) = self.worker_rx.try_recv() {
            match msg {
                WorkerMsg::EngineReady(Ok(engine)) => {
                    self.tray
                        .set_tooltip(&format!("local-stt - {}", engine.label()));
                    self.engine = Some(engine);
                }
                WorkerMsg::EngineReady(Err(e)) => {
                    println!("[local-stt] model load failed: {e}");
                    self.tray.set_tooltip("local-stt - model load failed");
                }
                WorkerMsg::ChunkDone { speaker, id, segments } => {
                    if let Some(s) = self.session.as_mut() {
                        s.in_flight = s.in_flight.saturating_sub(1);
                        println!(
                            "[local-stt] {speaker} chunk #{id} done ({} segments, {} in-flight)",
                            segments.len(),
                            s.in_flight
                        );
                        if speaker == "user" {
                            s.chunks_done_user += 1;
                        } else {
                            s.chunks_done_other += 1;
                        }
                        for seg in segments {
                            s.segments.push((seg.start_time, speaker.clone(), seg.text));
                        }
                    }
                    self.try_finalize();
                }
                WorkerMsg::CommandSent { ok, message } => {
                    self.overlay.show_result(message, ok, self.now());
                    self.update_tray_ready_label();
                }
            }
        }
    }

    fn sync_viewport(&mut self, ctx: &egui::Context) {
        let visible = self.overlay.is_visible();

        if visible {
            let (sw, sh) = ctx.input(|i| {
                let ms = i.viewport().monitor_size.unwrap_or(egui::vec2(1920.0, 1080.0));
                (ms.x.max(800.0), ms.y.max(400.0))
            });

            // ── X: center on screen, but clamp so the full card width is always visible ──
            let x = ((sw - CARD_W) * 0.5).clamp(0.0, (sw - CARD_W).max(0.0));

            // ── Y: 70px from top, card must not overflow screen bottom ──
            let y = 70.0_f32;
            // Maximum card height = from y to 8px above screen bottom
            let max_h = (sh - y - 8.0).max(CARD_W /* fallback */);

            // Use last frame's rendered size, capped to max_h
            let used_h = ctx.used_size().y;
            let h = if used_h > 4.0 {
                (used_h + 4.0).max(self.overlay.desired_height()).min(max_h)
            } else {
                self.overlay.desired_height().min(max_h)
            };

            // Tell the overlay how tall the scroll area can grow:
            // available = capped window height minus all fixed chrome
            self.overlay.max_scroll_h = (max_h - CARD_CHROME_H).max(80.0);

            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(x, y)));
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(egui::vec2(CARD_W, h)));
            ctx.send_viewport_cmd(ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
            ctx.send_viewport_cmd(ViewportCommand::MousePassthrough(false));
            if !self.did_focus {
                ctx.send_viewport_cmd(ViewportCommand::Focus);
                self.did_focus = true;
            }
        } else {
            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(-32000.0, -32000.0)));
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(egui::vec2(8.0, 8.0)));
            ctx.send_viewport_cmd(ViewportCommand::WindowLevel(egui::WindowLevel::Normal));
            ctx.send_viewport_cmd(ViewportCommand::MousePassthrough(true));
            self.did_focus = false;
        }
    }
}

impl eframe::App for LocalSttApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if !self.wake_installed {
            *self.ui_wake.lock() = Some(ctx.clone());
            self.wake_installed = true;
        }

        let dt = self.last_frame.elapsed().as_secs_f32().min(0.05);
        self.last_frame = Instant::now();

        self.poll_workers();
        self.pump_live_chunks();

        if let Some(kind) = self.hotkeys.poll_toggle() {
            self.toggle_record(kind);
        }
        if self.tray.poll_quit() {
            ctx.send_viewport_cmd(ViewportCommand::Close);
            return;
        }

        if self.recording {
            self.overlay.rms = self.recorder.rms();
        }

        self.overlay.tick(self.now(), dt);
        self.sync_viewport(ctx);

        ctx.request_repaint_after(std::time::Duration::from_millis(33));

        if matches!(self.overlay.state, OverlayState::Hidden) && self.overlay.alpha < 0.01 {
            egui::CentralPanel::default()
                .frame(egui::Frame::NONE.fill(egui::Color32::TRANSPARENT))
                .show(ctx, |_ui| {});
            return;
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(egui::Color32::TRANSPARENT))
            .show(ctx, |ui| {
                ui.multiply_opacity(self.overlay.alpha);
                self.overlay.ui(ctx, ui);
            });
    }
}

// ── Backend HTTP call ────────────────────────────────────────────────────────

/// POST the transcript as a command to `POST /api/assistant`.
/// Returns a short human-readable status string on success.
///
/// # Security
/// The `token` is a Bearer credential. We refuse to send it over plain HTTP
/// to non-loopback hosts to prevent accidental credential exposure.
fn send_command_to_backend(
    backend_url: &str,
    token: Option<&str>,
    transcript: &str,
) -> anyhow::Result<String> {
    use reqwest::blocking::Client;

    // Validate scheme before attaching credentials.
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

    let url = format!("{}/api/assistant", backend_url.trim_end_matches('/'));

    let mut req = Client::new()
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }

    let body = serde_json::json!({
        "transcript": transcript,
        "source": "local-stt"
    });

    let resp = req
        .body(body.to_string())
        .send()
        .map_err(|e| anyhow::anyhow!("HTTP send failed: {e}"))?;

    let status = resp.status();
    let body_text = resp.text().unwrap_or_default();

    if status.is_success() {
        // Try to extract a human-readable summary from the JSON response.
        let summary = serde_json::from_str::<serde_json::Value>(&body_text)
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
