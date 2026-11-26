use std::cell::RefCell;
use std::fs;

use kiosk_cli::browser::BrowserOpener;
use kiosk_cli::client::{ApiClient, ExportResult, PageResult, Visibility};
use kiosk_cli::config::{config_path, resolve_config};
use kiosk_cli::error::CliError;
use kiosk_cli::session::{login_with_token, logout, open_mapped_page, resolve_open_url};
use kiosk_cli::state::{PageMapping, mapping_key, write_mapping};
use serde_json::{Value, json};
use tempfile::tempdir;

struct IdentityClient {
    me_calls: RefCell<usize>,
}

#[derive(Default)]
struct RecordingBrowser {
    urls: RefCell<Vec<String>>,
}

impl BrowserOpener for RecordingBrowser {
    fn open(&self, url: &str) -> Result<(), CliError> {
        self.urls.borrow_mut().push(url.to_owned());
        Ok(())
    }
}

impl ApiClient for IdentityClient {
    fn publish(
        &self,
        _: &str,
        _: Option<&str>,
        _: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        unreachable!()
    }
    fn update(
        &self,
        _: &str,
        _: &str,
        _: Option<&str>,
        _: Option<Visibility>,
    ) -> Result<PageResult, CliError> {
        unreachable!()
    }
    fn set_visibility(&self, _: &str, _: Visibility) -> Result<PageResult, CliError> {
        unreachable!()
    }
    fn list(&self) -> Result<Value, CliError> {
        unreachable!()
    }
    fn delete(&self, _: &str) -> Result<(), CliError> {
        unreachable!()
    }
    fn me(&self) -> Result<Value, CliError> {
        *self.me_calls.borrow_mut() += 1;
        Ok(json!({"user":{"id":"u"}}))
    }
    fn export_file(&self, _: &str, _: &str) -> Result<ExportResult, CliError> {
        unreachable!()
    }
}

#[test]
fn token_login_validates_before_saving_and_logout_preserves_api_base() {
    let home = tempdir().unwrap();
    let client = IdentityClient {
        me_calls: RefCell::new(0),
    };
    login_with_token(
        home.path(),
        "https://api.test/api/v1",
        "kiosk_api_x",
        &client,
    )
    .unwrap();
    assert_eq!(*client.me_calls.borrow(), 1);
    let saved = resolve_config(home.path(), &Default::default());
    assert_eq!(saved.token.as_deref(), Some("kiosk_api_x"));
    assert_eq!(saved.api_base, "https://api.test/api/v1");

    logout(home.path(), &saved.api_base).unwrap();
    let saved = resolve_config(home.path(), &Default::default());
    assert_eq!(saved.token, None);
    assert_eq!(saved.api_base, "https://api.test/api/v1");
    let json: Value = serde_json::from_slice(&fs::read(config_path(home.path())).unwrap()).unwrap();
    assert!(json.get("token").is_none());
}

#[test]
fn open_resolves_only_existing_project_mappings() {
    let root = tempdir().unwrap();
    fs::create_dir(root.path().join(".kiosk")).unwrap();
    let file = root.path().join("page.html");
    write_mapping(
        root.path(),
        mapping_key(root.path(), &file).unwrap(),
        PageMapping {
            id: "abc".into(),
            url: "https://kiosk.test/v/abc".into(),
        },
    )
    .unwrap();
    assert_eq!(
        resolve_open_url(root.path(), &file).unwrap(),
        "https://kiosk.test/v/abc"
    );
    let browser = RecordingBrowser::default();
    let mut output = Vec::new();
    open_mapped_page(root.path(), &file, &browser, &mut output).unwrap();
    assert_eq!(output, b"https://kiosk.test/v/abc\n");
    assert_eq!(
        browser.urls.borrow().as_slice(),
        ["https://kiosk.test/v/abc"]
    );
    assert!(resolve_open_url(root.path(), &root.path().join("missing.html")).is_err());
}
