use std::io::{BufRead, Write};
use std::path::Path;

use crate::browser::BrowserOpener;
use crate::client::ApiClient;
use crate::config::{Config, DEFAULT_API_BASE, display_origin, normalize_api_base, save_config};
use crate::error::CliError;
use crate::state::{mapping_key, read_state};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoginMethod {
    Browser,
    Token(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoginPlan {
    pub api_base: String,
    pub method: LoginMethod,
}

fn read_prompt_line(
    prompt: &str,
    input: &mut impl BufRead,
    output: &mut impl Write,
) -> Result<String, CliError> {
    write!(output, "{prompt}")?;
    output.flush()?;
    let mut line = String::new();
    input.read_line(&mut line)?;
    Ok(line.trim().to_owned())
}

pub fn prompt_login_plan(
    current_api_base: &str,
    input: &mut impl BufRead,
    output: &mut impl Write,
) -> Result<LoginPlan, CliError> {
    let default_origin = display_origin(current_api_base);
    let default_label = if current_api_base == DEFAULT_API_BASE {
        format!("Kiosk Cloud ({default_origin})")
    } else {
        format!("Current server ({default_origin})")
    };

    writeln!(output, "Which Kiosk server do you want to log in to?")?;
    writeln!(output, "  1. {default_label} [default]")?;
    writeln!(output, "  2. Self-hosted / Custom server")?;
    let host_choice = read_prompt_line("Select [1]: ", input, output)?;

    let api_base = match host_choice.as_str() {
        "" | "1" => current_api_base.to_owned(),
        "2" => {
            let raw = read_prompt_line(
                "Server URL (e.g. https://kiosk.company.com): ",
                input,
                output,
            )?;
            normalize_api_base(&raw)?
        }
        other => {
            return Err(CliError::new(format!(
                "Invalid selection '{other}'. Enter 1 or 2."
            )));
        }
    };

    writeln!(output, "\nHow would you like to authenticate?")?;
    writeln!(output, "  1. Login with a web browser [default]")?;
    writeln!(output, "  2. Paste an API token (kiosk_api_...)")?;
    let method_choice = read_prompt_line("Select [1]: ", input, output)?;

    let method = match method_choice.as_str() {
        "" | "1" => LoginMethod::Browser,
        "2" => {
            let token = read_prompt_line("API token: ", input, output)?;
            if token.is_empty() {
                return Err(CliError::new("API token cannot be empty"));
            }
            LoginMethod::Token(token)
        }
        other => {
            return Err(CliError::new(format!(
                "Invalid selection '{other}'. Enter 1 or 2."
            )));
        }
    };

    Ok(LoginPlan { api_base, method })
}

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
