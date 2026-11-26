use std::fs;

use kiosk_cli::skills::{CODEX_SECTION, InstallSkillOptions, SKILL_MD, install_skill};
use tempfile::tempdir;

#[test]
fn embedded_copy_matches_the_shared_contract_files() {
    let contract = format!("{}/contract/skills", env!("CARGO_MANIFEST_DIR"));
    assert_eq!(
        SKILL_MD,
        fs::read_to_string(format!("{contract}/claude/SKILL.md")).unwrap()
    );
    assert_eq!(
        CODEX_SECTION,
        fs::read_to_string(format!("{contract}/codex.md")).unwrap()
    );
}

#[test]
fn installs_both_targets_by_default_and_codex_is_idempotent() {
    let root = tempdir().unwrap();
    fs::write(root.path().join("AGENTS.md"), "# Existing\n").unwrap();
    let options = InstallSkillOptions::default();

    let first = install_skill(root.path(), options).unwrap();
    let second = install_skill(root.path(), options).unwrap();
    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
    assert_eq!(
        fs::read_to_string(root.path().join(".claude/skills/kiosk/SKILL.md")).unwrap(),
        SKILL_MD
    );
    let agents = fs::read_to_string(root.path().join("AGENTS.md")).unwrap();
    assert!(agents.contains("# Existing"));
    assert_eq!(agents.matches("## Publishing HTML with Kiosk").count(), 1);
}

#[test]
fn respects_single_target_selection() {
    let root = tempdir().unwrap();
    install_skill(
        root.path(),
        InstallSkillOptions {
            claude: true,
            codex: false,
        },
    )
    .unwrap();
    assert!(root.path().join(".claude/skills/kiosk/SKILL.md").is_file());
    assert!(!root.path().join("AGENTS.md").exists());
}
