//! System tray icon + menu.

use anyhow::{Context, Result};
use muda::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder};

use crate::util::make_mic_icon;

pub struct Tray {
    _icon: TrayIcon,
    pub quit_id: muda::MenuId,
    pub pair_id: muda::MenuId,
    pub unresolved_id: muda::MenuId,
}

pub enum TrayAction {
    None,
    Quit,
    Pair,
    /// Open the handback inbox: what the agent left for the user to finish.
    Unresolved,
}

impl Tray {
    pub fn new() -> Result<Self> {
        let rgba = make_mic_icon(64, [0x1B, 0xB9, 0xCE]);
        let (w, h) = (rgba.width(), rgba.height());
        let icon = Icon::from_rgba(rgba.into_raw(), w, h).context("tray icon from rgba")?;

        let quit = MenuItem::new("Quit", true, None);
        let quit_id = quit.id().clone();
        let pair = MenuItem::new("Pair account…", true, None);
        let pair_id = pair.id().clone();
        let unresolved = MenuItem::new("Unresolved…", true, None);
        let unresolved_id = unresolved.id().clone();

        let menu = Menu::new();
        menu.append(&MenuItem::new("local-stt (Parakeet INT8)", false, None))?;
        menu.append(&PredefinedMenuItem::separator())?;
        menu.append(&MenuItem::new("Ctrl+Shift+Space to record", false, None))?;
        menu.append(&unresolved)?;
        menu.append(&pair)?;
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
            pair_id,
            unresolved_id,
        })
    }

    pub fn set_tooltip(&self, tip: &str) {
        let _ = self._icon.set_tooltip(Some(tip));
    }

    pub fn poll_action(&self) -> TrayAction {
        let mut action = TrayAction::None;
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == self.quit_id {
                action = TrayAction::Quit;
            } else if event.id == self.pair_id {
                action = TrayAction::Pair;
            } else if event.id == self.unresolved_id {
                action = TrayAction::Unresolved;
            }
        }
        action
    }
}
