//! Global hotkeys:
//!   Ctrl+Shift+Space  → OCR mode   (toggle record → copy transcript to clipboard)
//!   Ctrl+Shift+Enter  → Command mode (toggle record → send transcript to backend)
//!
//! On Windows, `RegisterHotKey` posts to a HWND that must live on the same
//! thread as the UI message pump (eframe/winit). So we register here on the
//! main thread — not on a background thread.

use anyhow::{Context as AnyhowContext, Result};
use crossbeam_channel::{bounded, Receiver, Sender};
use eframe::egui::Context as EguiContext;
use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::OnceLock;

/// Shared handle so hotkey events can wake the egui event loop.
pub type UiWake = Arc<Mutex<Option<EguiContext>>>;

/// Which hotkey was triggered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyKind {
    /// Ctrl+Shift+Space — OCR: copy transcript to clipboard.
    Ocr,
    /// Ctrl+Shift+Enter — Command: send transcript to backend.
    Command,
}

static HOTKEY_TX: OnceLock<Sender<HotkeyKind>> = OnceLock::new();
static UI_WAKE: OnceLock<UiWake> = OnceLock::new();

pub struct Hotkeys {
    _manager: GlobalHotKeyManager,
    rx: Receiver<HotkeyKind>,
    _id_ocr: u32,
    _id_command: u32,
}

impl Hotkeys {
    pub fn register(wake: UiWake) -> Result<Self> {
        let (tx, rx) = bounded(16); // cap prevents event injection flooding
        let _ = HOTKEY_TX.set(tx);
        let _ = UI_WAKE.set(wake);

        let manager = GlobalHotKeyManager::new().context("create GlobalHotKeyManager")?;

        let hotkey_ocr = HotKey::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
        let hotkey_cmd = HotKey::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Enter);

        let id_ocr = hotkey_ocr.id();
        let id_command = hotkey_cmd.id();

        manager.register(hotkey_ocr).with_context(|| {
            "register Ctrl+Shift+Space (is another local-stt still running?)"
        })?;
        manager.register(hotkey_cmd).with_context(|| {
            "register Ctrl+Shift+Enter"
        })?;

        // Deliver events via handler so we can wake egui immediately.
        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            if event.state != HotKeyState::Pressed {
                return;
            }
            let kind = if event.id == id_ocr {
                println!("[local-stt] hotkey Ctrl+Shift+Space pressed (OCR)");
                HotkeyKind::Ocr
            } else if event.id == id_command {
                println!("[local-stt] hotkey Ctrl+Shift+Enter pressed (Command)");
                HotkeyKind::Command
            } else {
                return;
            };

            if let Some(tx) = HOTKEY_TX.get() {
                let _ = tx.try_send(kind); // drop if channel full (injection attack)
            }
            if let Some(wake) = UI_WAKE.get() {
                if let Some(ctx) = wake.lock().as_ref() {
                    ctx.request_repaint();
                }
            }
        }));

        println!("[local-stt] hotkeys registered: Ctrl+Shift+Space (OCR)  Ctrl+Shift+Enter (Command)");

        Ok(Self {
            _manager: manager,
            rx,
            _id_ocr: id_ocr,
            _id_command: id_command,
        })
    }

    /// Returns the kind of hotkey pressed since last poll, or `None`.
    /// If both were pressed in the same frame, the last one wins.
    pub fn poll_toggle(&self) -> Option<HotkeyKind> {
        let mut last = None;
        while let Ok(kind) = self.rx.try_recv() {
            last = Some(kind);
        }
        last
    }
}
