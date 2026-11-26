use std::io::Write;
use std::path::Path;

use crate::browser::BrowserOpener;
use crate::client::ApiClient;
use crate::config::{Config, save_config};
use crate::error::CliError;
use crate::state::{mapping_key, read_state};

pub fn login_with_token(
    home: &Path,
    api_base: &str,
    token: &str,
    client: &impl ApiClient,
) -> Result<(), CliError> {
    client.me()?;
    save_config(
        home,
        &Config {
            token: Some(token.to_owned()),
            api_base: api_base.to_owned(),
        },
    )?;
    Ok(())
}

pub fn logout(home: &Path, api_base: &str) -> Result<(), CliError> {
    save_config(
        home,
        &Config {
            token: None,
            api_base: api_base.to_owned(),
        },
    )?;
    Ok(())
}

pub fn resolve_open_url(root: &Path, target: &Path) -> Result<String, CliError> {
    let key = mapping_key(root, target)?;
    read_state(root)
        .pages
        .get(&key)
        .map(|entry| entry.url.clone())
        .ok_or_else(|| {
            CliError::new(format!(
                "No published page mapped to {}. Publish it first (kiosk publish {}), or open the printed URL directly.",
                target.display(),
                target.display()
            ))
        })
}

pub fn open_mapped_page(
    root: &Path,
    target: &Path,
    opener: &impl BrowserOpener,
    stdout: &mut impl Write,
) -> Result<(), CliError> {
    let url = resolve_open_url(root, target)?;
    writeln!(stdout, "{url}")?;
    let _ = opener.open(&url);
    Ok(())
}
