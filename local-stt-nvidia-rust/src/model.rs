//! Download & extract the sherpa-onnx Parakeet TDT v3 INT8 model pack.
//!
//! # Security
//! The archive is verified against a hardcoded SHA-256 digest before extraction.
//! The tar extractor explicitly rejects path-traversal entries (`..'` components
//! and absolute paths) so a tampered archive cannot write outside `dest_dir`.

use anyhow::{bail, Context, Result};
use bzip2::read::BzDecoder;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use tar::Archive;

use crate::config::models_dir;

pub const MODEL_DIR_NAME: &str = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
const MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2";

/// SHA-256 of the official release archive (lowercase hex).
/// Recompute with: sha256sum sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2
const MODEL_SHA256: &str = "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf";

#[derive(Debug, Clone)]
pub struct ModelPaths {
    pub root: PathBuf,
    pub encoder: PathBuf,
    pub decoder: PathBuf,
    pub joiner: PathBuf,
    pub tokens: PathBuf,
}

impl ModelPaths {
    pub fn from_root(root: PathBuf) -> Self {
        Self {
            encoder: root.join("encoder.int8.onnx"),
            decoder: root.join("decoder.int8.onnx"),
            joiner: root.join("joiner.int8.onnx"),
            tokens: root.join("tokens.txt"),
            root,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.encoder.is_file()
            && self.decoder.is_file()
            && self.joiner.is_file()
            && self.tokens.is_file()
    }
}

pub fn model_root() -> PathBuf {
    models_dir().join(MODEL_DIR_NAME)
}

/// Ensure the Parakeet INT8 model is on disk; download + extract if missing.
pub fn ensure_parakeet_int8() -> Result<ModelPaths> {
    let root = model_root();
    let paths = ModelPaths::from_root(root.clone());
    if paths.is_complete() {
        log::info!("model ready at {}", root.display());
        return Ok(paths);
    }

    fs::create_dir_all(models_dir()).context("create models dir")?;
    let archive_path = models_dir().join(format!("{MODEL_DIR_NAME}.tar.bz2"));

    if !archive_path.is_file() {
        log::info!("downloading Parakeet TDT v3 INT8 (~500 MB)...");
        println!("[local-stt] downloading Parakeet TDT v3 INT8 model...");
        download_file(MODEL_URL, &archive_path)?;
        println!("[local-stt] download complete");
    }

    // Verify checksum before extraction to detect MITM / corruption.
    println!("[local-stt] verifying model archive checksum...");
    verify_sha256(&archive_path, MODEL_SHA256)?;
    println!("[local-stt] checksum OK");

    log::info!("extracting {}", archive_path.display());
    println!("[local-stt] extracting model...");
    extract_tar_bz2(&archive_path, &models_dir())?;

    let paths = ModelPaths::from_root(root);
    if !paths.is_complete() {
        bail!(
            "model files missing after extract under {}",
            paths.root.display()
        );
    }
    println!("[local-stt] model ready at {}", paths.root.display());
    Ok(paths)
}

fn download_file(url: &str, dest: &Path) -> Result<()> {
    let resp = reqwest::blocking::get(url).with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        bail!("download failed: HTTP {}", resp.status());
    }
    let total = resp.content_length().unwrap_or(0);
    let mut reader = resp;
    let tmp = dest.with_extension("part");
    let mut file = File::create(&tmp).with_context(|| format!("create {}", tmp.display()))?;

    let mut buf = [0u8; 1024 * 256];
    let mut written: u64 = 0;
    let mut last_pct = 0u64;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        written += n as u64;
        if total > 0 {
            let pct = written * 100 / total;
            if pct >= last_pct + 5 {
                println!("[local-stt] download {pct}% ({written}/{total} bytes)");
                last_pct = pct;
            }
        }
    }
    file.flush()?;
    drop(file);
    fs::rename(&tmp, dest).with_context(|| format!("rename to {}", dest.display()))?;
    Ok(())
}

/// Compute SHA-256 of `path` and compare against `expected` (lowercase hex).
fn verify_sha256(path: &Path, expected: &str) -> Result<()> {
    let mut file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher)?;
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        bail!(
            "model archive checksum mismatch — possible corruption or MITM.\n\
             expected: {expected}\n\
             got:      {actual}\n\
             Delete {} and retry.",
            path.display()
        );
    }
    Ok(())
}

/// Extract a `.tar.bz2` archive into `dest_dir`, rejecting any entry whose
/// path contains `..` components or is absolute (path-traversal defence).
fn extract_tar_bz2(archive_path: &Path, dest_dir: &Path) -> Result<()> {
    let file =
        File::open(archive_path).with_context(|| format!("open {}", archive_path.display()))?;
    let decoder = BzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    for entry in archive.entries().context("read tar entries")? {
        let mut entry = entry.context("read tar entry")?;
        let entry_path = entry.path().context("tar entry path")?.into_owned();

        // Reject absolute paths and any `..` component.
        if entry_path.is_absolute()
            || entry_path
                .components()
                .any(|c| c == Component::ParentDir)
        {
            bail!(
                "archive contains dangerous path entry: {:?} — aborting extraction",
                entry_path
            );
        }

        entry
            .unpack_in(dest_dir)
            .with_context(|| format!("unpack {:?}", entry_path))?;
    }
    Ok(())
}
