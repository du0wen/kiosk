use std::ffi::{OsStr, OsString};
use std::process::Command;

use crate::error::CliError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BrowserInvocation {
    pub program: OsString,
    pub args: Vec<OsString>,
}

impl BrowserInvocation {
    pub fn new<I, S>(program: impl Into<OsString>, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Self {
            program: program.into(),
            args: args
                .into_iter()
                .map(|value| value.as_ref().to_os_string())
                .collect(),
        }
    }
}

pub fn browser_invocation(platform: &str, url: &str) -> Result<BrowserInvocation, CliError> {
    match platform {
        "macos" => Ok(BrowserInvocation::new("open", [url])),
        "windows" => Ok(BrowserInvocation::new("cmd", ["/C", "start", "", url])),
        "linux" => Ok(BrowserInvocation::new("xdg-open", [url])),
        _ => Err(CliError::new(format!(
            "Opening a browser is not supported on {platform}"
        ))),
    }
}

pub trait BrowserOpener {
    fn open(&self, url: &str) -> Result<(), CliError>;
}

pub struct SystemBrowser;

impl BrowserOpener for SystemBrowser {
    fn open(&self, url: &str) -> Result<(), CliError> {
        let invocation = browser_invocation(std::env::consts::OS, url)?;
        Command::new(invocation.program)
            .args(invocation.args)
            .spawn()
            .map(|_| ())
            .map_err(|error| CliError::new(format!("Could not open the browser: {error}")))
    }
}
