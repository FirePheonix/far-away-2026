//! local-stt-rs — tray speech-to-text powered by NVIDIA Parakeet TDT (sherpa-onnx).

// Release builds: no console window (same as Python --windowed).
// Debug (`cargo run`) still attaches to the terminal for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;
mod asr;
mod audio;
mod config;
mod hotkey;
mod model;
mod obsidian;
mod overlay;
mod tray;
mod util;

use anyhow::{bail, Result};
use eframe::egui;

use crate::app::LocalSttApp;
use crate::overlay::PILL_H;

/// Single-instance guard via a Windows named mutex.
///
/// A named mutex (in the "Local\" namespace) is the canonical Windows mechanism
/// for single-instance detection. Unlike a TCP port it cannot be squatted by an
/// unprivileged process on another user session, and it is automatically released
/// when the process exits (no TIME_WAIT residual).
struct InstanceLock(windows::Win32::Foundation::HANDLE);

impl Drop for InstanceLock {
    fn drop(&mut self) {
        // SAFETY: handle was returned by CreateMutexW and is valid.
        unsafe { let _ = windows::Win32::System::Threading::ReleaseMutex(self.0); }
        unsafe { let _ = windows::Win32::Foundation::CloseHandle(self.0); }
    }
}

fn acquire_instance_lock() -> Result<InstanceLock> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_ALREADY_EXISTS;
    use windows::Win32::System::Threading::CreateMutexW;

    // Encode name as a null-terminated UTF-16 string.
    let name: Vec<u16> = "Local\\local-stt-instance-lock\0"
        .encode_utf16()
        .collect();

    // SAFETY: name is a valid null-terminated UTF-16 string.
    let handle = unsafe {
        CreateMutexW(None, true, PCWSTR(name.as_ptr()))
            .map_err(|e| anyhow::anyhow!("CreateMutexW failed: {e}"))?
    };

    // If the mutex already existed, another instance is running.
    if unsafe { windows::Win32::Foundation::GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe { let _ = windows::Win32::Foundation::CloseHandle(handle); }
        bail!(
            "already running (another instance holds the tray lock).\n\
             Quit it from the system tray, or kill the old local-stt process."
        );
    }

    Ok(InstanceLock(handle))
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let _lock = match acquire_instance_lock() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[local-stt] {e}");
            std::process::exit(1);
        }
    };

    // Persist default config if missing
    let cfg = config::load();
    if let Err(e) = config::save(&cfg) {
        log::warn!("[local-stt] config save failed: {e}");
    }

    println!(
        "[local-stt] running on {} - model=parakeet-int8 - Ctrl+Shift+Space to record",
        std::env::consts::OS
    );

    // Keep the window "visible" to the OS (parked off-screen when idle).
    // Starting fully hidden stops the egui loop on Windows, so hotkeys never fire.
    let viewport = egui::ViewportBuilder::default()
        .with_title("local-stt")
        .with_inner_size([1920.0, PILL_H])  // will be resized to actual screen width on first frame
        .with_position([-32000.0, -32000.0])
        .with_decorations(false)
        .with_transparent(true)
        .with_always_on_top()
        .with_taskbar(false)
        .with_resizable(true)
        .with_visible(true);

    let native_options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };

    eframe::run_native(
        "local-stt",
        native_options,
        Box::new(|cc| match LocalSttApp::new(cc) {
            Ok(a) => Ok(Box::new(a) as Box<dyn eframe::App>),
            Err(e) => {
                eprintln!("[local-stt] failed to start: {e:#}");
                Err(e.into())
            }
        }),
    )
    .map_err(|e| anyhow::anyhow!("eframe error: {e}"))?;

    Ok(())
}
