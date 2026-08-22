//! Obsidian vault operations — pure file I/O, no networking.
//!
//! All functions take a vault root path and operate on `.md` files inside it.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Vault discovery
// ---------------------------------------------------------------------------

/// Read the global Obsidian configuration to discover vault paths.
/// On Windows this is `%APPDATA%/obsidian/obsidian.json`.
pub fn detect_vaults() -> Vec<VaultInfo> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        log::debug!("[obsidian] APPDATA not set — cannot auto-detect vaults");
        return Vec::new();
    };

    let config_path = PathBuf::from(appdata).join("obsidian").join("obsidian.json");
    let Ok(content) = fs::read_to_string(&config_path) else {
        log::debug!("[obsidian] cannot read {}", config_path.display());
        return Vec::new();
    };

    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        log::warn!("[obsidian] obsidian.json is not valid JSON");
        return Vec::new();
    };

    let Some(vaults) = json.get("vaults").and_then(|v| v.as_object()) else {
        log::debug!("[obsidian] no 'vaults' key in obsidian.json");
        return Vec::new();
    };

    let mut results = Vec::new();
    for (_id, vault) in vaults {
        if let Some(path) = vault.get("path").and_then(|p| p.as_str()) {
            let p = PathBuf::from(path);
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string());
            if p.is_dir() {
                results.push(VaultInfo {
                    path: path.to_string(),
                    name,
                });
            }
        }
    }

    log::info!("[obsidian] detected {} vault(s)", results.len());
    results
}

/// Resolve a vault path from an optional vault name hint.
/// If `vault_name` is `None` and exactly one vault exists, use it.
/// If multiple vaults exist and no name is given, return an error listing them.
pub fn resolve_vault(vault_name: Option<&str>) -> Result<PathBuf> {
    let vaults = detect_vaults();

    if vaults.is_empty() {
        anyhow::bail!(
            "No Obsidian vaults detected. Make sure Obsidian is installed and has been opened at least once."
        );
    }

    if let Some(name) = vault_name {
        // Match by name (case-insensitive)
        let lower = name.to_lowercase();
        if let Some(v) = vaults.iter().find(|v| v.name.to_lowercase() == lower) {
            return Ok(PathBuf::from(&v.path));
        }
        // Also try partial match
        if let Some(v) = vaults
            .iter()
            .find(|v| v.name.to_lowercase().contains(&lower))
        {
            return Ok(PathBuf::from(&v.path));
        }
        let names: Vec<_> = vaults.iter().map(|v| v.name.as_str()).collect();
        anyhow::bail!(
            "Vault '{}' not found. Available vaults: {}",
            name,
            names.join(", ")
        );
    }

    if vaults.len() == 1 {
        return Ok(PathBuf::from(&vaults[0].path));
    }

    let names: Vec<_> = vaults.iter().map(|v| v.name.as_str()).collect();
    anyhow::bail!(
        "Multiple Obsidian vaults detected ({}). Please specify which vault to use.",
        names.join(", ")
    );
}

// ---------------------------------------------------------------------------
// Search notes
// ---------------------------------------------------------------------------

/// Walk the vault directory and search for notes matching `query` by filename
/// and content. Returns up to `max_results` matches.
pub fn search_notes(vault_path: &Path, query: &str, max_results: usize) -> Result<Vec<SearchResult>> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    search_dir(vault_path, vault_path, &query_lower, max_results, &mut results)?;

    Ok(results)
}

fn search_dir(
    root: &Path,
    dir: &Path,
    query: &str,
    max_results: usize,
    results: &mut Vec<SearchResult>,
) -> Result<()> {
    let entries = fs::read_dir(dir)
        .with_context(|| format!("reading directory {}", dir.display()))?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        // Skip hidden folders (e.g. .obsidian, .git, .trash)
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        if results.len() >= max_results {
            return Ok(());
        }

        if path.is_dir() {
            search_dir(root, &path, query, max_results, results)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let rel_path = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            let file_name_lower = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            // Match by filename first
            if file_name_lower.contains(query) {
                let snippet = read_snippet(&path, None);
                results.push(SearchResult {
                    path: rel_path,
                    snippet,
                });
                continue;
            }

            // Then by content
            if let Ok(content) = fs::read_to_string(&path) {
                let content_lower = content.to_lowercase();
                if let Some(pos) = content_lower.find(query) {
                    let snippet = read_snippet(&path, Some(pos));
                    results.push(SearchResult {
                        path: rel_path,
                        snippet,
                    });
                }
            }
        }
    }

    Ok(())
}

fn read_snippet(path: &Path, match_pos: Option<usize>) -> String {
    let content = fs::read_to_string(path).unwrap_or_default();
    if content.is_empty() {
        return "(empty)".to_string();
    }

    let start = match match_pos {
        Some(pos) => pos.saturating_sub(60),
        None => 0,
    };
    let end = (start + 200).min(content.len());

    let snippet: String = content[start..end]
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect();

    if start > 0 || end < content.len() {
        format!("…{}…", snippet.trim())
    } else {
        snippet.trim().to_string()
    }
}

// ---------------------------------------------------------------------------
// Append to note
// ---------------------------------------------------------------------------

/// Append markdown content to an existing note. Creates the file if it doesn't
/// exist (including any missing parent directories).
pub fn append_to_note(vault_path: &Path, note_path: &str, content: &str) -> Result<String> {
    let full_path = vault_path.join(note_path);

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("creating directories for {}", full_path.display()))?;
    }

    let existing = fs::read_to_string(&full_path).unwrap_or_default();
    let separator = if existing.is_empty() || existing.ends_with('\n') {
        ""
    } else {
        "\n"
    };

    let new_content = format!("{}{}{}\n", existing, separator, content);
    fs::write(&full_path, &new_content)
        .with_context(|| format!("writing to {}", full_path.display()))?;

    log::info!("[obsidian] appended {} bytes to {}", content.len(), note_path);
    Ok(format!("Appended to {}", note_path))
}

// ---------------------------------------------------------------------------
// Write daily note
// ---------------------------------------------------------------------------

/// Append content to today's daily note. Creates the file if it doesn't exist.
/// The daily note is placed in the vault root as `YYYY-MM-DD.md` by default,
/// or inside a `daily_folder` subfolder if specified.
pub fn write_daily_note(
    vault_path: &Path,
    content: &str,
    daily_folder: Option<&str>,
) -> Result<String> {
    let today = chrono_today();
    let filename = format!("{}.md", today);

    let note_path = match daily_folder {
        Some(folder) if !folder.is_empty() => format!("{}/{}", folder.trim_matches('/'), filename),
        _ => filename,
    };

    append_to_note(vault_path, &note_path, content)?;

    log::info!("[obsidian] wrote daily note {}", note_path);
    Ok(format!("Added to daily note {}", note_path))
}

/// Get today's date as YYYY-MM-DD using the system local time.
fn chrono_today() -> String {
    // We avoid pulling in the chrono crate — just format from SystemTime.
    let now = std::time::SystemTime::now();
    let since_epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Approximate local date — good enough for daily notes.
    // For proper timezone support we'd need chrono, but keeping deps minimal.
    let days = since_epoch / 86400;
    // Civil date from Unix days using the algorithm from Howard Hinnant.
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chrono_today_format() {
        let today = chrono_today();
        assert_eq!(today.len(), 10);
        assert!(today.starts_with("20")); // valid for next 75 years
        assert_eq!(&today[4..5], "-");
        assert_eq!(&today[7..8], "-");
    }
}
