use std::collections::BTreeSet;
use std::fs;
use std::process::Command as ProcessCommand;

use clap::{CommandFactory, Parser};
use kiosk_cli::args::{Cli, Command, ExportFormat};

#[test]
fn rust_command_names_match_the_shared_contract_fixture() {
    let contract_path = format!("{}/../cli/contract/v1.json", env!("CARGO_MANIFEST_DIR"));
    let contract: serde_json::Value =
        serde_json::from_slice(&fs::read(contract_path).unwrap()).unwrap();
    let expected = contract["commands"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect::<BTreeSet<_>>();
    let actual = Cli::command()
        .get_subcommands()
        .map(|command| command.get_name().to_owned())
        .collect::<BTreeSet<_>>();

    assert_eq!(actual, expected);
}

#[test]
fn no_command_prints_help_and_exits_successfully() {
    let output = ProcessCommand::new(env!("CARGO_BIN_EXE_kiosk"))
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(stdout.contains("Usage: kiosk [COMMAND]"));
    assert!(stdout.contains("publish"));
}

#[test]
fn parses_every_public_command() {
    let cases = [
        vec!["kiosk", "login"],
        vec!["kiosk", "logout"],
        vec!["kiosk", "publish", "page.html"],
        vec!["kiosk", "share", "page-id", "--public"],
        vec!["kiosk", "export", "page-id"],
        vec!["kiosk", "list"],
        vec!["kiosk", "open", "page.html"],
        vec!["kiosk", "delete", "page-id"],
        vec!["kiosk", "install-skill"],
        vec!["kiosk", "whoami"],
    ];

    for argv in cases {
        Cli::try_parse_from(argv).expect("public command must parse");
    }
}

#[test]
fn publish_preserves_existing_flags() {
    let cli = Cli::try_parse_from([
        "kiosk",
        "publish",
        "page.html",
        "--id",
        "abc",
        "--new",
        "--title",
        "Report",
        "--public",
        "--json",
    ])
    .unwrap();

    let Some(Command::Publish(args)) = cli.command else {
        panic!("expected publish command");
    };
    assert_eq!(args.file.to_string_lossy(), "page.html");
    assert_eq!(args.id.as_deref(), Some("abc"));
    assert!(args.force_new);
    assert_eq!(args.title.as_deref(), Some("Report"));
    assert!(args.public);
    assert!(args.json);
}

#[test]
fn share_requires_exactly_one_visibility() {
    assert!(Cli::try_parse_from(["kiosk", "share", "id"]).is_err());
    assert!(Cli::try_parse_from(["kiosk", "share", "id", "--public", "--private"]).is_err());
    assert!(Cli::try_parse_from(["kiosk", "share", "id", "--private"]).is_ok());
}

#[test]
fn export_defaults_to_pdf_and_accepts_short_output() {
    let cli = Cli::try_parse_from(["kiosk", "export", "id", "-o", "report.pdf"]).unwrap();
    let Some(Command::Export(args)) = cli.command else {
        panic!("expected export command");
    };
    assert_eq!(args.format, ExportFormat::Pdf);
    assert_eq!(args.output.unwrap().to_string_lossy(), "report.pdf");
}
