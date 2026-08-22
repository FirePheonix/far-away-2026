use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_model")]
    pub model: String,

    /// Base URL of the Clawvio backend API.
    /// Set this to your deployed backend or keep the default for local dev.
    #[serde(default = "default_backend_url")]
    pub backend_url: String,

    /// Desktop auth token issued by the backend after pairing.
    /// Written here by the pairing flow; read on every Command hotkey press.
    #[serde(default)]
    pub desktop_token: Option<String>,
}

fn default_model() -> String {
    "parakeet-int8".into()
}

fn default_backend_url() -> String {
    "http://localhost:4001".into()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            model: default_model(),
            backend_url: default_backend_url(),
            desktop_token: None,
        }
    }
}

pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local-stt")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn models_dir() -> PathBuf {
    config_dir().join("models")
}

pub fn load() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

pub fn save(cfg: &Config) -> Result<()> {
    let dir = config_dir();
    fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    let path = config_path();
    let s = serde_json::to_string_pretty(cfg)?;
    fs::write(&path, s).with_context(|| format!("write {}", path.display()))?;
    // Restrict config.json to the owner only so the desktop_token is not
    // world-readable on a shared machine.
    restrict_to_owner(&path);
    Ok(())
}

/// Set the file's permissions so only the current user has access.
/// Uses `icacls` on Windows to remove inherited ACEs and grant the current
/// user full control. Logs a warning on failure — not fatal.
#[cfg(target_os = "windows")]
fn restrict_to_owner(path: &std::path::Path) {
    let username = std::env::var("USERNAME").unwrap_or_default();
    if username.is_empty() {
        log::warn!("[local-stt] could not restrict config.json: USERNAME env var not set");
        return;
    }
    let status = std::process::Command::new("icacls")
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{username}:F"))
        .status();
    match status {
        Ok(s) if s.success() => {}
        Ok(s) => log::warn!("[local-stt] icacls exited {s} — config.json may be world-readable"),
        Err(e) => log::warn!("[local-stt] could not restrict config.json permissions: {e}"),
    }
}

#[cfg(not(target_os = "windows"))]
fn restrict_to_owner(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Err(e) = fs::set_permissions(path, fs::Permissions::from_mode(0o600)) {
        log::warn!("[local-stt] could not restrict config.json permissions: {e}");
    }
}
