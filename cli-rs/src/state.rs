use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const STATE_DIR: &str = ".kiosk";
const STATE_FILE: &str = "pages.json";

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PageMapping {
    pub id: String,
    pub url: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct State {
    pub version: u32,
    pub pages: BTreeMap<String, PageMapping>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            version: 1,
            pages: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Identity {
    Create,
    Update(String),
}

fn state_path(root: &Path) -> PathBuf {
    root.join(STATE_DIR).join(STATE_FILE)
}

pub fn find_project_root(start: &Path) -> PathBuf {
    let fallback = start.to_path_buf();
    let mut current = fallback.clone();
    loop {
        if current.join(STATE_DIR).is_dir() {
            return current;
        }
        if !current.pop() {
            return fallback;
        }
    }
}

pub fn mapping_key(root: &Path, file: &Path) -> io::Result<String> {
    file.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().into_owned())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "file is outside project root"))
}

pub fn read_state(root: &Path) -> State {
    fs::read(state_path(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn write_mapping(root: &Path, key: String, entry: PageMapping) -> io::Result<()> {
    let mut state = read_state(root);
    state.pages.insert(key, entry);
    let path = state_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(&state).map_err(io::Error::other)?;
    fs::write(path, bytes)
}

pub fn resolve_identity(root: &Path, file: &Path, id: Option<&str>, force_new: bool) -> Identity {
    if let Some(id) = id {
        return Identity::Update(id.to_owned());
    }
    if force_new {
        return Identity::Create;
    }
    let mapped = mapping_key(root, file)
        .ok()
        .and_then(|key| read_state(root).pages.get(&key).cloned());
    mapped
        .map(|entry| Identity::Update(entry.id))
        .unwrap_or(Identity::Create)
}
