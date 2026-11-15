//! Step 10: write the app's data files and manifest.json.

use anyhow::Result;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;

#[derive(Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Serialize, serde::Deserialize)]
pub struct Manifest {
    pub version: String,
    pub month: String,
    pub built: String,
    pub bands: Vec<u32>,
    pub files: Vec<FileEntry>,
}

pub fn gz_json<T: Serialize>(v: &T) -> Result<Vec<u8>> {
    let mut e = GzEncoder::new(Vec::new(), Compression::best());
    serde_json::to_writer(&mut e, v)?;
    Ok(e.finish()?)
}

pub fn write(dir: &Path, name: &str, bytes: &[u8]) -> Result<FileEntry> {
    std::fs::create_dir_all(dir)?;
    let mut f = std::fs::File::create(dir.join(name))?;
    f.write_all(bytes)?;
    let sha = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    Ok(FileEntry { name: name.to_string(), bytes: bytes.len() as u64, sha256: sha })
}

pub fn git_short_hash() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "nogit".into())
}
