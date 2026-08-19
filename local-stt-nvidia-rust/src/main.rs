//! local-stt-rs — tray speech-to-text powered by NVIDIA Parakeet TDT (sherpa-onnx).

// Release builds: no console window (same as Python --windowed).
// Debug (`cargo run`) still attaches to the terminal for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod asr;
mod audio;
mod config;
mod hotkey;
mod model;
mod overlay;
mod tray;
mod util;

use anyhow::{bail, Result};
use eframe::egui;
use std::net::TcpListener;

use crate::app::LocalSttApp;
use crate::overlay::{CARD_H, CARD_W};

fn acquire_instance_lock() -> Result<TcpListener> {
    match TcpListener::bind(("127.0.0.1", 47915)) {
        Ok(l) => Ok(l),
        Err(_) => {
            bail!(
                "already running (another instance holds the tray lock).\n\
                 Quit it from the system tray, or kill the old local-stt process."
            );
        }
    }
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
    let _ = config::save(&cfg);

    println!(
        "[local-stt] running on {} - model=parakeet-int8 - Ctrl+Shift+Space to record",
        std::env::consts::OS
    );

    // Keep the window "visible" to the OS (parked off-screen when idle).
    // Starting fully hidden stops the egui loop on Windows, so hotkeys never fire.
    let viewport = egui::ViewportBuilder::default()
        .with_title("local-stt")
        .with_inner_size([CARD_W, CARD_H])
        .with_position([-32000.0, -32000.0])
        .with_decorations(false)
        .with_transparent(true)
        .with_always_on_top()
        .with_taskbar(false)
        .with_resizable(false)
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
