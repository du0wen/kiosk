use std::collections::HashMap;
use std::fs;

use kiosk_cli::config::{
    Config, DEFAULT_API_BASE, config_path, display_origin, home_from_env, normalize_api_base,
    resolve_config, save_config,
};
use tempfile::tempdir;

#[test]
fn defaults_when_environment_and_file_are_absent() {
    let home = tempdir().unwrap();
    let config = resolve_config(home.path(), &HashMap::new());
    assert_eq!(config.api_base, DEFAULT_API_BASE);
    assert_eq!(config.token, None);
}

#[test]
fn resolves_home_across_unix_and_windows_environment_shapes() {
    let unix = HashMap::from([("HOME".into(), "/home/kevin".into())]);
    assert_eq!(
        home_from_env(&unix).unwrap().to_string_lossy(),
        "/home/kevin"
    );

    let windows = HashMap::from([("USERPROFILE".into(), r"C:\Users\Kevin".into())]);
    assert_eq!(
        home_from_env(&windows).unwrap().to_string_lossy(),
        r"C:\Users\Kevin"
    );
    assert!(home_from_env(&HashMap::new()).is_err());
}

#[test]
fn environment_wins_over_camel_case_file_fields() {
    let home = tempdir().unwrap();
    fs::create_dir_all(config_path(home.path()).parent().unwrap()).unwrap();
    fs::write(
        config_path(home.path()),
        r#"{"token":"file-token","apiBase":"https://file.test/api/v1"}"#,
    )
    .unwrap();
    let env = HashMap::from([
        ("KIOSK_TOKEN".into(), "env-token".into()),
        ("KIOSK_API_BASE".into(), "https://env.test/api/v1".into()),
    ]);

    let config = resolve_config(home.path(), &env);
    assert_eq!(config.token.as_deref(), Some("env-token"));
    assert_eq!(config.api_base, "https://env.test/api/v1");
}

#[test]
fn save_round_trips_the_existing_json_shape() {
    let home = tempdir().unwrap();
    save_config(
        home.path(),
        &Config {
            token: Some("saved-token".into()),
            api_base: "https://kiosk.test/api/v1".into(),
        },
    )
    .unwrap();

    let json: serde_json::Value =
        serde_json::from_slice(&fs::read(config_path(home.path())).unwrap()).unwrap();
    assert_eq!(json["token"], "saved-token");
    assert_eq!(json["apiBase"], "https://kiosk.test/api/v1");
    assert!(json.get("api_base").is_none());
}

#[cfg(unix)]
#[test]
fn save_uses_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;

    let home = tempdir().unwrap();
    save_config(
        home.path(),
        &Config {
            token: None,
            api_base: DEFAULT_API_BASE.into(),
        },
    )
    .unwrap();
    let mode = fs::metadata(config_path(home.path()))
        .unwrap()
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o600);
}

#[test]
fn normalizes_host_inputs_into_api_base() {
    assert_eq!(
        normalize_api_base("https://app.kioskai.dev").unwrap(),
        "https://app.kioskai.dev/api/v1"
    );
    assert_eq!(
        normalize_api_base("https://app.kioskai.dev/").unwrap(),
        "https://app.kioskai.dev/api/v1"
    );
    assert_eq!(
        normalize_api_base("https://app.kioskai.dev/api/v1/").unwrap(),
        "https://app.kioskai.dev/api/v1"
    );
    assert_eq!(
        normalize_api_base("kiosk.company.com").unwrap(),
        "https://kiosk.company.com/api/v1"
    );
    assert_eq!(
        normalize_api_base("http://localhost:58671").unwrap(),
        "http://localhost:58671/api/v1"
    );
    assert!(normalize_api_base("   ").is_err());
    assert_eq!(
        display_origin("https://app.kioskai.dev/api/v1"),
        "https://app.kioskai.dev"
    );
}
