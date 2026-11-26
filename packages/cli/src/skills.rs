use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const SKILL_MD: &str = include_str!("../contract/skills/claude/SKILL.md");
pub const CODEX_SECTION: &str = include_str!("../contract/skills/codex.md");
const CODEX_MARKER: &str = "## Publishing HTML with Kiosk";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InstallSkillOptions {
    pub claude: bool,
    pub codex: bool,
}

impl InstallSkillOptions {
    pub fn from_flags(claude: bool, codex: bool) -> Self {
        let both = !claude && !codex;
        Self {
            claude: both || claude,
            codex: both || codex,
        }
    }
}

impl Default for InstallSkillOptions {
    fn default() -> Self {
        Self {
            claude: true,
            codex: true,
        }
    }
}

pub fn install_skill(root: &Path, options: InstallSkillOptions) -> io::Result<Vec<PathBuf>> {
    let mut written = Vec::new();
    if options.claude {
        let path = root.join(".claude/skills/kiosk/SKILL.md");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, SKILL_MD)?;
        written.push(path);
    }
    if options.codex {
        let path = root.join("AGENTS.md");
        let existing = fs::read_to_string(&path).unwrap_or_default();
        if !existing.contains(CODEX_MARKER) {
            let separator = if existing.is_empty() {
                ""
            } else if existing.ends_with('\n') {
                "\n"
            } else {
                "\n\n"
            };
            let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
            file.write_all(separator.as_bytes())?;
            file.write_all(CODEX_SECTION.as_bytes())?;
        }
        written.push(path);
    }
    Ok(written)
}
