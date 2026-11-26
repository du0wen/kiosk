use std::process::Command;

use tempfile::tempdir;

#[test]
fn native_binary_installs_only_the_selected_claude_skill() {
    let home = tempdir().unwrap();
    let project = tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_kiosk"))
        .args(["install-skill", "--claude"])
        .current_dir(project.path())
        .env("HOME", home.path())
        .env_remove("KIOSK_TOKEN")
        .env_remove("KIOSK_API_BASE")
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        std::fs::read_to_string(project.path().join(".claude/skills/kiosk/SKILL.md")).unwrap(),
        kiosk_cli::skills::SKILL_MD
    );
    assert!(!project.path().join("AGENTS.md").exists());
    assert!(
        String::from_utf8(output.stdout)
            .unwrap()
            .contains(".claude/skills/kiosk/SKILL.md")
    );
}
