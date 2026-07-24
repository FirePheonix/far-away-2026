//! Main egui app: overlay + tray + hotkey + audio + ASR orchestration.
//!
//! Live pipeline: while you speak, peel ~10s chunks and decode them in the
//! background so stop → clipboard is usually just the leftover tail.

use anyhow::Result;
use arboard::Clipboard;
use crossbeam_channel::{unbounded, Receiver, Sender};
use eframe::egui::{self, ViewportCommand};
use parking_lot::Mutex;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use crate::asr::AsrEngine;
use crate::audio::Recorder;
use crate::hotkey::{Hotkeys, UiWake};
use crate::overlay::{Overlay, OverlayState, CARD_W};
use crate::tray::Tray;
use crate::util::SAMPLE_RATE;

/// Decode audio in this many seconds while the user is still talking.
const LIVE_CHUNK_SECS: u32 = 10;
const LIVE_CHUNK_SAMPLES: usize = (SAMPLE_RATE as usize) * (LIVE_CHUNK_SECS as usize);

enum WorkerMsg {
    EngineReady(Result<Arc<AsrEngine>, String>),
    ChunkDone { id: usize, text: String },
}

/// One dictation: chunks decoded live, assembled in order on stop.
struct LiveSession {
    next_id: usize,
    in_flight: usize,
    /// Completed chunk texts keyed by id.
    done: BTreeMap<usize, String>,
    /// Set when user stops; total chunks expected (including tail).
    expected: Option<usize>,
    /// True once we've moved to "Transcribing…" after stop.
    finishing: bool,
}

impl LiveSession {
    fn new() -> Self {
        Self {
            next_id: 0,
            in_flight: 0,
            done: BTreeMap::new(),
            expected: None,
            finishing: false,
        }
    }

    fn all_done(&self) -> bool {
        match self.expected {
            Some(n) => self.done.len() >= n && self.in_flight == 0,
            None => false,
        }
    }

    fn joined(&self) -> String {
        self.done
            .values()
            .filter(|s| !s.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
            .split_whitespace()
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
        })
    }

    fn now(&self) -> f64 {
        self.started.elapsed().as_secs_f64()
    }

    fn spawn_chunk(&mut self, id: usize, audio: Vec<f32>) {
        let Some(engine) = self.engine.clone() else {
            return;
        };
        let tx = self.worker_tx.clone();
        let wake = self.ui_wake.clone();
        if let Some(s) = self.session.as_mut() {
            s.in_flight += 1;
        }
        let secs = audio.len() as f32 / SAMPLE_RATE as f32;
        println!("[local-stt] queue chunk #{id} ({secs:.1}s) — decoding while you speak");
        thread::spawn(move || {
            let label = format!("chunk#{id}");
            let text = match engine.transcribe_labeled(&audio, Some(&label)) {
                Ok(t) => t,
                Err(e) => {
                    println!("[local-stt] chunk #{id} error: {e:#}");
                    String::new()
                }
            };
            let _ = tx.send(WorkerMsg::ChunkDone { id, text });
            if let Some(ctx) = wake.lock().as_ref() {
                ctx.request_repaint();
            }
        });
    }

    /// Peel full live chunks from the mic buffer (called each frame while recording).
    fn pump_live_chunks(&mut self) {
        if !self.recording || self.engine.is_none() {
            return;
        }
        while self.recorder.buffered_samples() >= LIVE_CHUNK_SAMPLES {
            let Some(chunk) = self.recorder.take_prefix(LIVE_CHUNK_SAMPLES) else {
                break;
            };
            let id = {
                let s = self.session.get_or_insert_with(LiveSession::new);
                let id = s.next_id;
                s.next_id += 1;
                id
            };
            self.spawn_chunk(id, chunk);
        }
    }

    fn toggle_record(&mut self) {
        if self.engine.is_none() {
            println!("[local-stt] model not ready yet — wait for 'Parakeet INT8 ready'");
            return;
        }
        // Ignore toggles while we're assembling the final result
        if self.session.as_ref().is_some_and(|s| s.finishing) {
            return;
        }

        if !self.recording {
            self.recording = true;
            self.session = Some(LiveSession::new());
            self.recorder.start();
            self.overlay.show_listening();
            self.tray.set_tooltip("local-stt - recording (live chunks)...");
            println!(
                "[local-stt] recording... (live {LIVE_CHUNK_SECS}s chunks while you speak)"
            );
        } else {
            self.recording = false;
            // Flush any remaining audio as the final chunk
            let tail = self.recorder.stop();
            let (id, expected) = {
                let s = self.session.get_or_insert_with(LiveSession::new);
                let id = s.next_id;
                s.next_id += 1;
                s.finishing = true;
                let expected = id + 1;
                s.expected = Some(expected);
                (id, expected)
            };

            self.overlay.show_processing();
            self.tray.set_tooltip("local-stt - finishing...");
            let tail_s = tail.len() as f32 / SAMPLE_RATE as f32;
            println!(
                "[local-stt] stopped — tail {tail_s:.1}s as chunk #{id} (expect {expected} chunks)"
            );

            if tail.len() >= (SAMPLE_RATE as usize) * 3 / 10 {
                self.spawn_chunk(id, tail);
            } else {
                // Empty/short tail — mark done without decode
                let _ = self.worker_tx.send(WorkerMsg::ChunkDone {
                    id,
                    text: String::new(),
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
        let text = session.joined();
        let ok = !text.is_empty();
        if ok {
            if let Ok(mut cb) = Clipboard::new() {
                let _ = cb.set_text(&text);
            }
            println!("[local-stt] copied: {text}");
        } else {
            println!("[local-stt] nothing heard");
        }
        self.overlay.show_result(text, ok, self.now());
        let tip = self
            .engine
            .as_ref()
            .map(|e| format!("local-stt - {}", e.label()))
            .unwrap_or_else(|| "local-stt - ready".into());
        self.tray.set_tooltip(&tip);
        self.session = None;
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
                WorkerMsg::ChunkDone { id, text } => {
                    if let Some(s) = self.session.as_mut() {
                        s.in_flight = s.in_flight.saturating_sub(1);
                        println!(
                            "[local-stt] chunk #{id} done ({} chars, {} in-flight)",
                            text.len(),
                            s.in_flight
                        );
                        s.done.insert(id, text);
                    }
                    self.try_finalize();
                }
            }
        }
    }

    fn sync_viewport(&self, ctx: &egui::Context) {
        let visible = self.overlay.is_visible();
        let h = self.overlay.desired_height();

        if visible {
            let sw = ctx
                .input(|i| i.viewport().monitor_size.map(|s| s.x))
                .unwrap_or(1920.0)
                .max(800.0);
            let x = ((sw - CARD_W) * 0.5).max(0.0);
            let y = 70.0;
            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(x, y)));
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(egui::vec2(CARD_W, h)));
            ctx.send_viewport_cmd(ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
            ctx.send_viewport_cmd(ViewportCommand::Focus);
        } else {
            ctx.send_viewport_cmd(ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(egui::pos2(-32000.0, -32000.0)));
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(egui::vec2(8.0, 8.0)));
            ctx.send_viewport_cmd(ViewportCommand::WindowLevel(egui::WindowLevel::Normal));
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

        if self.hotkeys.poll_toggle() {
            self.toggle_record();
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
