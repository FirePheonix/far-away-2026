//! Global Ctrl+Shift+Space hotkey.
//!
//! On Windows, `RegisterHotKey` posts to a HWND that must live on the same
//! thread as the UI message pump (eframe/winit). So we register here on the
//! main thread — not on a background thread.

use anyhow::{Context as AnyhowContext, Result};
use crossbeam_channel::{unbounded, Receiver, Sender};
use eframe::egui::Context as EguiContext;
use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::OnceLock;

/// Shared handle so hotkey events can wake the egui event loop.
pub type UiWake = Arc<Mutex<Option<EguiContext>>>;

static HOTKEY_TX: OnceLock<Sender<()>> = OnceLock::new();
static UI_WAKE: OnceLock<UiWake> = OnceLock::new();

pub struct Hotkeys {
    _manager: GlobalHotKeyManager,
    rx: Receiver<()>,
}

impl Hotkeys {
    pub fn register(wake: UiWake) -> Result<Self> {
        let (tx, rx) = unbounded();
        let _ = HOTKEY_TX.set(tx);
        let _ = UI_WAKE.set(wake);

        // Deliver events via handler so we can wake egui immediately.
        GlobalHotKeyEvent::set_event_handler(Some(|event: GlobalHotKeyEvent| {
            if event.state != HotKeyState::Pressed {
                return;
            }
            println!("[local-stt] hotkey pressed");
            if let Some(tx) = HOTKEY_TX.get() {
                let _ = tx.send(());
            }
            if let Some(wake) = UI_WAKE.get() {
                if let Some(ctx) = wake.lock().as_ref() {
                    ctx.request_repaint();
                }
            }
        }));

        let manager = GlobalHotKeyManager::new().context("create GlobalHotKeyManager")?;
        let hotkey = HotKey::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
        manager.register(hotkey).with_context(|| {
            "register Ctrl+Shift+Space (is another local-stt still running?)"
        })?;
        println!("[local-stt] hotkey Ctrl+Shift+Space registered");

        Ok(Self {
            _manager: manager,
            rx,
        })
    }

    /// Returns true if the toggle hotkey was pressed since last poll.
    pub fn poll_toggle(&self) -> bool {
        let mut hit = false;
        while self.rx.try_recv().is_ok() {
            hit = true;
        }
        hit
    }
}
