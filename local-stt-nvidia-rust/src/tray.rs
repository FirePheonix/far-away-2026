//! System tray icon + menu.

use anyhow::{Context, Result};
use muda::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder};



pub struct Tray {
    _icon: TrayIcon,
    pub quit_id: muda::MenuId,
}

impl Tray {
    pub fn new() -> Result<Self> {
        let icon_bytes = include_bytes!("../assets/icon.png");
        let image = image::load_from_memory(icon_bytes).context("Failed to load tray icon")?.into_rgba8();
        let (w, h) = image.dimensions();
        let icon = Icon::from_rgba(image.into_raw(), w, h).context("tray icon from rgba")?;

        let quit = MenuItem::new("Quit", true, None);
        let quit_id = quit.id().clone();

        let menu = Menu::new();
        menu.append(&MenuItem::new("local-stt (Parakeet INT8)", false, None))?;
        menu.append(&PredefinedMenuItem::separator())?;
        menu.append(&MenuItem::new("Ctrl+Shift+Space to record", false, None))?;
        menu.append(&PredefinedMenuItem::separator())?;
        menu.append(&quit)?;

        let tray = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip("local-stt - loading...")
            .with_icon(icon)
            .build()
            .context("build tray icon")?;

        Ok(Self {
            _icon: tray,
            quit_id,
        })
    }

    pub fn set_tooltip(&self, tip: &str) {
        let _ = self._icon.set_tooltip(Some(tip));
    }

    /// Returns true if Quit was selected.
    pub fn poll_quit(&self) -> bool {
        let mut quit = false;
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == self.quit_id {
                quit = true;
            }
        }
        quit
    }
}
