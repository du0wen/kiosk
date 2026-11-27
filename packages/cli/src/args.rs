use std::path::PathBuf;

use clap::{ArgGroup, Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "kiosk",
    version,
    about = "Publish self-contained HTML with Kiosk"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Log in through the browser or with an API token.
    Login(LoginArgs),
    /// Remove the saved API token.
    Logout,
    /// Publish or update an HTML file.
    Publish(PublishArgs),
    /// Change a page's visibility.
    Share(ShareArgs),
    /// Export a page.
    Export(ExportArgs),
    /// List pages in the token's organization.
    List,
    /// Open the published URL mapped to a file.
    Open(OpenArgs),
    /// Unpublish a page.
    Delete(DeleteArgs),
    /// Install the Kiosk skill for Claude Code and/or Codex.
    #[command(name = "install-skill")]
    InstallSkill(InstallSkillArgs),
    /// Show the authenticated account and organization.
    Whoami,
    /// List style templates for the active organization.
    Templates(TemplatesArgs),
    /// Fetch a style template by slug (and optional version).
    Template(TemplateArgs),
}

#[derive(Debug, Args)]
pub struct LoginArgs {
    /// API token to authenticate with instead of browser login.
    #[arg(long)]
    pub token: Option<String>,
    /// Kiosk server URL (e.g. https://app.kioskai.dev or https://kiosk.company.com).
    #[arg(long)]
    pub host: Option<String>,
}

#[derive(Debug, Args)]
pub struct PublishArgs {
    pub file: PathBuf,
    #[arg(long)]
    pub id: Option<String>,
    #[arg(long = "new")]
    pub force_new: bool,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long)]
    pub public: bool,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
#[command(group(
    ArgGroup::new("visibility")
        .required(true)
        .multiple(false)
        .args(["public", "private"])
))]
pub struct ShareArgs {
    pub id: String,
    #[arg(long)]
    pub public: bool,
    #[arg(long)]
    pub private: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, ValueEnum)]
pub enum ExportFormat {
    Md,
    Html,
    #[default]
    Pdf,
    Png,
    Jpeg,
}

impl ExportFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Md => "md",
            Self::Html => "html",
            Self::Pdf => "pdf",
            Self::Png => "png",
            Self::Jpeg => "jpeg",
        }
    }
}

#[derive(Debug, Args)]
pub struct ExportArgs {
    pub id: String,
    #[arg(long, value_enum, default_value_t)]
    pub format: ExportFormat,
    #[arg(short = 'o', long)]
    pub output: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct OpenArgs {
    pub file: PathBuf,
}

#[derive(Debug, Args)]
pub struct DeleteArgs {
    pub id: String,
}

#[derive(Debug, Args)]
pub struct InstallSkillArgs {
    #[arg(long)]
    pub claude: bool,
    #[arg(long)]
    pub codex: bool,
}

#[derive(Debug, Args)]
pub struct TemplatesArgs {
    #[arg(long)]
    pub category: Option<String>,
}

#[derive(Debug, Args)]
pub struct TemplateArgs {
    pub slug: String,
    #[arg(long)]
    pub version: Option<u32>,
    #[arg(long)]
    pub html: bool,
}
