use std::cell::RefCell;
use std::fs;

use clap::Parser;
use kiosk_cli::args::Cli;
use kiosk_cli::client::{ApiClient, ExportResult, PageResult, Visibility};
use kiosk_cli::commands::{execute_api_command, require_token};
use kiosk_cli::config::{Config, DEFAULT_API_BASE};
use serde_json::{Value, json};
use tempfile::tempdir;

#[derive(Default)]
struct FakeClient {
    calls: RefCell<Vec<String>>,
}

impl ApiClient for FakeClient {
    fn publish(
        &self,
        html: &str,
        title: Option<&str>,
        visibility: Option<Visibility>,
    ) -> Result<PageResult, kiosk_cli::error::CliError> {
        self.calls.borrow_mut().push(format!(
            "publish:{}:{}:{:?}",
            html.len(),
            title.unwrap_or_default(),
            visibility
        ));
        Ok(page("new-id", "public"))
    }

    fn update(
        &self,
        id: &str,
        _html: &str,
        _title: Option<&str>,
        _visibility: Option<Visibility>,
    ) -> Result<PageResult, kiosk_cli::error::CliError> {
        self.calls.borrow_mut().push(format!("update:{id}"));
        Ok(page(id, "org"))
    }

    fn set_visibility(
        &self,
        id: &str,
        visibility: Visibility,
    ) -> Result<PageResult, kiosk_cli::error::CliError> {
        self.calls
            .borrow_mut()
            .push(format!("visibility:{id}:{visibility:?}"));
        Ok(page(id, visibility.as_str()))
    }

    fn list(&self) -> Result<Value, kiosk_cli::error::CliError> {
        Ok(json!({"pages":[{"id":"abc"}],"nextCursor":null}))
    }

    fn delete(&self, id: &str) -> Result<(), kiosk_cli::error::CliError> {
        self.calls.borrow_mut().push(format!("delete:{id}"));
        Ok(())
    }

    fn me(&self) -> Result<Value, kiosk_cli::error::CliError> {
        Ok(json!({"user":{"email":"kevin@example.com"},"role":"owner"}))
    }

    fn export_file(
        &self,
        id: &str,
        format: &str,
    ) -> Result<ExportResult, kiosk_cli::error::CliError> {
        self.calls
            .borrow_mut()
            .push(format!("export:{id}:{format}"));
        Ok(ExportResult {
            data: if format == "pdf" {
                b"%PDF".to_vec()
            } else {
                b"# Report".to_vec()
            },
            filename: format!("report.{format}"),
        })
    }
}

fn page(id: &str, visibility: &str) -> PageResult {
    PageResult {
        id: id.into(),
        url: format!("https://kiosk.test/v/{id}"),
        raw_url: Some(format!("https://serve.test/p/{id}")),
        visibility: Some(visibility.into()),
    }
}

fn run(argv: &[&str], cwd: &std::path::Path, client: &FakeClient) -> (String, String) {
    let cli = Cli::try_parse_from(argv).unwrap();
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    execute_api_command(
        cli.command.as_ref().unwrap(),
        client,
        cwd,
        &mut stdout,
        &mut stderr,
    )
    .unwrap();
    (
        String::from_utf8(stdout).unwrap(),
        String::from_utf8(stderr).unwrap(),
    )
}

#[test]
fn missing_token_is_exit_two() {
    let error = require_token(&Config {
        token: None,
        api_base: DEFAULT_API_BASE.into(),
    })
    .unwrap_err();
    assert_eq!(error.exit_code, 2);
    assert!(error.to_string().contains("kiosk login"));
}

#[test]
fn publish_creates_then_updates_the_same_mapping() {
    let root = tempdir().unwrap();
    fs::create_dir(root.path().join(".kiosk")).unwrap();
    fs::write(root.path().join("page.html"), "<html>ok</html>").unwrap();
    let client = FakeClient::default();

    let (stdout, stderr) = run(&["kiosk", "publish", "page.html"], root.path(), &client);
    assert_eq!(stdout, "https://kiosk.test/v/new-id\n");
    assert!(stderr.contains("private to your org"));
    let state: Value =
        serde_json::from_slice(&fs::read(root.path().join(".kiosk/pages.json")).unwrap()).unwrap();
    assert_eq!(state["pages"]["page.html"]["id"], "new-id");

    run(&["kiosk", "publish", "page.html"], root.path(), &client);
    assert!(
        client
            .calls
            .borrow()
            .iter()
            .any(|call| call == "update:new-id")
    );
}

#[test]
fn publish_json_and_share_outputs_match_the_typescript_cli() {
    let root = tempdir().unwrap();
    fs::write(root.path().join("page.html"), "<html></html>").unwrap();
    let client = FakeClient::default();
    let (stdout, stderr) = run(
        &["kiosk", "publish", "page.html", "--public", "--json"],
        root.path(),
        &client,
    );
    assert_eq!(stdout, "{\"url\":\"https://kiosk.test/v/new-id\"}\n");
    assert!(stderr.is_empty());

    let (stdout, _) = run(
        &["kiosk", "share", "new-id", "--private"],
        root.path(),
        &client,
    );
    assert_eq!(stdout, "https://kiosk.test/v/new-id (org)\n");
}

#[test]
fn export_writes_binary_or_streams_text() {
    let root = tempdir().unwrap();
    let client = FakeClient::default();
    let (stdout, _) = run(
        &["kiosk", "export", "abc", "--format", "pdf", "-o", "out.pdf"],
        root.path(),
        &client,
    );
    assert_eq!(stdout, "Saved out.pdf\n");
    assert_eq!(fs::read(root.path().join("out.pdf")).unwrap(), b"%PDF");

    let (stdout, _) = run(
        &["kiosk", "export", "abc", "--format", "md"],
        root.path(),
        &client,
    );
    assert_eq!(stdout, "# Report");
}

#[test]
fn list_whoami_and_delete_preserve_output_shapes() {
    let root = tempdir().unwrap();
    let client = FakeClient::default();
    let (list, _) = run(&["kiosk", "list"], root.path(), &client);
    assert!(list.contains("\"pages\": ["));
    let (me, _) = run(&["kiosk", "whoami"], root.path(), &client);
    assert!(me.contains("kevin@example.com"));
    let (deleted, _) = run(&["kiosk", "delete", "abc"], root.path(), &client);
    assert_eq!(deleted, "Deleted.\n");
    assert!(
        client
            .calls
            .borrow()
            .iter()
            .any(|call| call == "delete:abc")
    );
}
