use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CliError;

pub const DEFAULT_API_BASE: &str = "https://app.kioskai.dev/api/v1";

pub fn normalize_api_base(input: &str) -> Result<String, CliError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(CliError::new("Server URL cannot be empty"));
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let clean = with_scheme.trim_end_matches('/');
    if clean == "http:" || clean == "https:" || clean.ends_with("://") {
        return Err(CliError::new(format!("Invalid server URL: {trimmed}")));
    }
    if clean.ends_with("/api/v1") {
        Ok(clean.to_owned())
    } else {
        Ok(format!("{clean}/api/v1"))
    }
}

pub fn display_origin(api_base: &str) -> &str {
    api_base
        .trim_end_matches('/')
        .strip_suffix("/api/v1")
        .unwrap_or(api_base)
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(rename = "apiBase")]
    pub api_base: String,
}

#[derive(Default, Deserialize)]
struct SavedConfig {
    token: Option<String>,
    #[serde(rename = "apiBase")]
    api_base: Option<String>,
}

pub fn config_path(home: &Path) -> PathBuf {
    home.join(".config").join("kiosk").join("config.json")
}

pub fn home_from_env(env: &HashMap<String, String>) -> Result<PathBuf, CliError> {
    if let Some(home) = env.get("HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(home));
    }
    if let Some(profile) = env.get("USERPROFILE").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(profile));
    }
    match (env.get("HOMEDRIVE"), env.get("HOMEPATH")) {
        (Some(drive), Some(path)) if !drive.is_empty() && !path.is_empty() => {
            Ok(PathBuf::from(format!("{drive}{path}")))
        }
        _ => Err(CliError::new(
            "Could not determine the home directory for Kiosk configuration",
        )),
    }
}

pub fn resolve_config(home: &Path, env: &HashMap<String, String>) -> Config {
    let saved = fs::read(config_path(home))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SavedConfig>(&bytes).ok())
        .unwrap_or_default();

    Config {
        token: env.get("KIOSK_TOKEN").cloned().or(saved.token),
        api_base: env
            .get("KIOSK_API_BASE")
            .cloned()
            .or(saved.api_base)
            .unwrap_or_else(|| DEFAULT_API_BASE.to_owned()),
    }
}

pub fn save_config(home: &Path, config: &Config) -> io::Result<()> {
    let path = config_path(home);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let bytes = serde_json::to_vec_pretty(config).map_err(io::Error::other)?;
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path)?;
    file.write_all(&bytes)?;
    file.sync_all()?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}
