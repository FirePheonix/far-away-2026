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

use crate::api;
use crate::asr::AsrEngine;
use crate::audio::Recorder;
use crate::config;
use crate::hotkey::{HotkeyKind, Hotkeys, UiWake};
use crate::overlay::{
    Overlay, OverlayAction, OverlayState, RecordMode, PILL_H, PILL_H_FEEDBACK_EXTRA,
    PILL_H_RESULT_EXTRA,
};
use crate::tray::{Tray, TrayAction};
use crate::util::SAMPLE_RATE;

/// Decode audio in this many seconds while the user is still talking.
const LIVE_CHUNK_SECS: u32 = 10;
const LIVE_CHUNK_SAMPLES: usize = (SAMPLE_RATE as usize) * (LIVE_CHUNK_SECS as usize);

enum WorkerMsg {
    EngineReady(Result<Arc<AsrEngine>, String>),
    ChunkDone { speaker: String, id: usize, segments: Vec<crate::asr::Segment> },
    CommandSent { ok: bool, message: String },
    TasksFetched { tasks: Vec<api::PendingTask> },
    FeedbackDone { ok: bool, message: String },
    PairingReady { pairing_id: String, code: String, claim_url: String },
    PairingFailed { message: String },
    PairingClaimed { token: String },
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
    last_task_poll: Instant,
    pairing_id: Option<String>,
    last_pair_poll: Instant,
    pairing_started: Option<Instant>,
    last_opened_claim_url: Option<String>,
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
            last_task_poll: Instant::now(),
            pairing_id: None,
            last_pair_poll: Instant::now(),
            pairing_started: None,
            last_opened_claim_url: None,
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
        if token.as_ref().map(|t| t.trim().is_empty()).unwrap_or(true) {
            println!("[local-stt] Command blocked — not paired.");
            if self.pairing_id.is_none()
                && !matches!(self.overlay.state, OverlayState::Pairing { .. })
            {
                self.start_pairing();
            } else {
                self.overlay.show_result(
                    "Still pairing — sign in in the existing browser tab, or click Open login once.".into(),
                    false,
                    self.now(),
                );
            }
            self.update_tray_ready_label();
            return;
        }

        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();

        thread::spawn(move || {
            let result = api::send_command(&backend_url, token.as_deref(), &transcript);
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
                    self.spawn_fetch_tasks();
                }
                WorkerMsg::TasksFetched { tasks } => {
                    self.apply_pending_tasks(tasks);
                }
                WorkerMsg::PairingReady {
                    pairing_id,
                    code,
                    claim_url,
                } => {
                    self.pairing_id = Some(pairing_id);
                    self.pairing_started = Some(Instant::now());
                    if let Ok(mut cb) = Clipboard::new() {
                        let _ = cb.set_text(&claim_url);
                    }
                    if self.last_opened_claim_url.as_deref() != Some(claim_url.as_str()) {
                        self.last_opened_claim_url = Some(claim_url.clone());
                        api::open_in_browser(&claim_url);
                    }
                    self.overlay.show_pairing(code, claim_url);
                    self.tray.set_tooltip("local-stt - waiting for pair…");
                }
                WorkerMsg::PairingFailed { message } => {
                    self.pairing_id = None;
                    self.pairing_started = None;
                    self.overlay.show_result(
                        format!("{message}  Use tray → Pair account… once. Do not keep pressing Command."),
                        false,
                        self.now(),
                    );
                }
                WorkerMsg::PairingClaimed { token } => {
                    self.pairing_id = None;
                    self.pairing_started = None;
                    self.last_opened_claim_url = None;
                    let mut cfg = config::load();
                    cfg.desktop_token = Some(token);
                    if let Err(e) = config::save(&cfg) {
                        self.overlay
                            .show_result(format!("Paired, but could not save token: {e}"), false, self.now());
                    } else {
                        self.overlay.show_result(
                            "Paired. Commands now run as your account.".into(),
                            true,
                            self.now(),
                        );
                        self.tray.set_tooltip("local-stt - paired");
                    }
                }
                WorkerMsg::FeedbackDone { ok, message } => {
                    if ok {
                        self.overlay.set_feedback_busy(true, message);
                        self.spawn_fetch_tasks();
                    } else {
                        self.overlay.set_feedback_busy(false, message);
                    }
                    self.update_tray_ready_label();
                }
            }
        }
    }

    fn sync_viewport(&mut self, ctx: &egui::Context) {
        let visible = self.overlay.is_visible();

        if visible {
            let dpi = ctx.pixels_per_point();
            let (sw_log, sh_log) = ctx.input(|i| {
                let ms = i.viewport().monitor_size
                    .unwrap_or(egui::vec2(1920.0 * dpi, 1080.0 * dpi));
                (ms.x / dpi, ms.y / dpi)
            });

            // Pass real screen width to overlay so it can center the pill itself
            self.overlay.screen_w = sw_log.max(400.0);

            // Window spans full screen width, sits at top (y=0)
            // No centering math needed — pill is drawn centered inside the window
            let w = sw_log.max(400.0);
            let max_h = (sh_log - 8.0).max(PILL_H);
            let h = self.overlay.desired_height().min(max_h);
            let extra = match self.overlay.state {
                OverlayState::Feedback { .. } => PILL_H_FEEDBACK_EXTRA,
                _ => PILL_H_RESULT_EXTRA,
            };
            self.overlay.max_scroll_h = (extra - 80.0).max(60.0);

            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(0.0, 0.0)));
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(egui::vec2(w, h)));
            ctx.send_viewport_cmd(ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
            ctx.send_viewport_cmd(ViewportCommand::MousePassthrough(false));
            if !self.did_focus {
                ctx.send_viewport_cmd(ViewportCommand::Focus);
                self.did_focus = true;
            }
        } else {
            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(-32000.0, -32000.0)));
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
            // One-time diagnostic: log DPI and monitor size so we can verify centering math
            let dpi = ctx.pixels_per_point();
            let monitor = ctx.input(|i| i.viewport().monitor_size);
            println!("[local-stt] dpi={dpi:.2}  monitor_size(physical)={monitor:?}  logical=({:.0}x{:.0})",
                monitor.map(|m| m.x / dpi).unwrap_or(0.0),
                monitor.map(|m| m.y / dpi).unwrap_or(0.0),
            );
        }

        let dt = self.last_frame.elapsed().as_secs_f32().min(0.05);
        self.last_frame = Instant::now();

        self.poll_workers();
        self.pump_live_chunks();
        self.poll_pending_tasks();

        if let Some(kind) = self.hotkeys.poll_toggle() {
            self.toggle_record(kind);
        }
        match self.tray.poll_action() {
            TrayAction::Quit => {
                ctx.send_viewport_cmd(ViewportCommand::Close);
                return;
            }
            TrayAction::Pair => self.start_pairing(),
            TrayAction::None => {}
        }
        self.poll_pairing();

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
                let action = self.overlay.ui(ctx, ui);
                self.handle_overlay_action(action);
            });
    }
}

impl LocalSttApp {
    fn recording_busy(&self) -> bool {
        self.recording
            || matches!(
                self.overlay.state,
                OverlayState::Listening { .. }
                    | OverlayState::Processing
                    | OverlayState::Sending
                    | OverlayState::Pairing { .. }
            )
    }

    fn poll_pending_tasks(&mut self) {
        if self.recording_busy() {
            return;
        }
        if self.last_task_poll.elapsed().as_secs() < 4 {
            return;
        }
        self.last_task_poll = Instant::now();
        self.spawn_fetch_tasks();
    }

    fn spawn_fetch_tasks(&self) {
        let cfg = config::load();
        let backend_url = cfg.backend_url.clone();
        let token = cfg.desktop_token.clone();
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        thread::spawn(move || {
            match api::fetch_pending_tasks(&backend_url, token.as_deref()) {
                Ok(tasks) => {
                    let _ = tx.send(WorkerMsg::TasksFetched { tasks });
                }
                Err(e) => {
                    log::debug!("[local-stt] pending task poll: {e}");
                }
            }
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }

    fn apply_pending_tasks(&mut self, tasks: Vec<api::PendingTask>) {
        if self.recording_busy() {
            return;
        }
        if matches!(self.overlay.state, OverlayState::Pairing { .. }) {
            return;
        }
        if tasks.is_empty() {
            if matches!(self.overlay.state, OverlayState::Feedback { .. }) {
                self.overlay.show_result("Caught up — no pending tasks".into(), true, self.now());
            }
            return;
        }
        let n = tasks.len();
        self.overlay.show_feedback(tasks);
        self.tray
            .set_tooltip(&format!("local-stt - {n} task(s) need you"));
    }

    fn handle_overlay_action(&mut self, action: OverlayAction) {
        if let OverlayAction::OpenPairUrl { url } = &action {
            api::open_in_browser(url);
            return;
        }
        let (kind, task_id, instruction) = match action {
            OverlayAction::None | OverlayAction::OpenPairUrl { .. } => return,
            OverlayAction::Skip { task_id } => ("skip", task_id, None),
            OverlayAction::Abandon { task_id } => ("abandon", task_id, None),
            OverlayAction::Change {
                task_id,
                instruction,
            } => ("change", task_id, Some(instruction)),
        };
        self.overlay.set_feedback_busy(
            true,
            match kind {
                "skip" => "Skipping…",
                "abandon" => "Abandoning…",
                _ => "Sending change…",
            },
        );
        let cfg = config::load();
        let backend_url = cfg.backend_url.clone();
        let token = cfg.desktop_token.clone();
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        thread::spawn(move || {
            let result = match kind {
                "skip" => api::skip_task(&backend_url, token.as_deref(), &task_id)
                    .map(|_| "Skipped".to_string()),
                "abandon" => api::abandon_task(&backend_url, token.as_deref(), &task_id)
                    .map(|_| "Abandoned".to_string()),
                _ => api::change_task(
                    &backend_url,
                    token.as_deref(),
                    &task_id,
                    instruction.as_deref().unwrap_or(""),
                )
                .map(|_| "Change sent".to_string()),
            };
            let (ok, message) = match result {
                Ok(msg) => (true, msg),
                Err(e) => (false, format!("{e}")),
            };
            let _ = tx.send(WorkerMsg::FeedbackDone { ok, message });
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }

    fn start_pairing(&mut self) {
        if self.pairing_id.is_some()
            || matches!(self.overlay.state, OverlayState::Pairing { .. })
        {
            println!("[local-stt] pairing already in progress — not opening another tab");
            return;
        }
        let cfg = config::load();
        let backend_url = cfg.backend_url.clone();
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        thread::spawn(move || {
            let msg = match api::start_pairing(&backend_url) {
                Ok(p) => WorkerMsg::PairingReady {
                    pairing_id: p.pairing_id,
                    code: p.code,
                    claim_url: p.claim_url,
                },
                Err(e) => WorkerMsg::PairingFailed {
                    message: format!("{e}"),
                },
            };
            let _ = tx.send(msg);
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }

    fn poll_pairing(&mut self) {
        let Some(pairing_id) = self.pairing_id.clone() else {
            return;
        };
        if self.last_pair_poll.elapsed().as_millis() < 2000 {
            return;
        }
        self.last_pair_poll = Instant::now();
        let cfg = config::load();
        let backend_url = cfg.backend_url.clone();
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        let ignore_expiry = self
            .pairing_started
            .map(|t| t.elapsed().as_secs() < 8 * 60)
            .unwrap_or(false);
        thread::spawn(move || {
            match api::poll_pairing(&backend_url, &pairing_id) {
                Ok(Some(token)) => {
                    let _ = tx.send(WorkerMsg::PairingClaimed { token });
                }
                Ok(None) => {}
                Err(e) => {
                    let msg = format!("{e}");
                    // SQLite expires_at is UTC; JS parses it as local, so "expired"
                    // can fire immediately. Ignore that for 8 minutes of wall time.
                    if msg.contains("expired") && ignore_expiry {
                        return;
                    }
                    let _ = tx.send(WorkerMsg::PairingFailed { message: msg });
                }
            }
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }
}
