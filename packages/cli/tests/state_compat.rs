use std::fs;

use kiosk_cli::state::{
    Identity, PageMapping, find_project_root, mapping_key, read_state, resolve_identity,
    write_mapping,
};
use tempfile::tempdir;

#[test]
fn discovers_the_nearest_ancestor_with_a_kiosk_directory() {
    let root = tempdir().unwrap();
    fs::create_dir(root.path().join(".kiosk")).unwrap();
    let nested = root.path().join("a/b");
    fs::create_dir_all(&nested).unwrap();
    assert_eq!(find_project_root(&nested), root.path());
}

#[test]
fn missing_or_corrupt_state_falls_back_to_version_one() {
    let root = tempdir().unwrap();
    assert_eq!(read_state(root.path()).version, 1);
    fs::create_dir(root.path().join(".kiosk")).unwrap();
    fs::write(root.path().join(".kiosk/pages.json"), "not json").unwrap();
    let state = read_state(root.path());
    assert_eq!(state.version, 1);
    assert!(state.pages.is_empty());
}

#[test]
fn mapping_round_trips_with_existing_field_names() {
    let root = tempdir().unwrap();
    let file = root.path().join("reports/page.html");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "<html></html>").unwrap();
    let key = mapping_key(root.path(), &file).unwrap();
    assert_eq!(key, "reports/page.html");

    write_mapping(
        root.path(),
        key.clone(),
        PageMapping {
            id: "abc".into(),
            url: "https://kiosk.test/v/abc".into(),
        },
    )
    .unwrap();
    let state = read_state(root.path());
    assert_eq!(state.pages[&key].id, "abc");

    let json: serde_json::Value =
        serde_json::from_slice(&fs::read(root.path().join(".kiosk/pages.json")).unwrap()).unwrap();
    assert_eq!(json["version"], 1);
    assert_eq!(json["pages"][&key]["url"], "https://kiosk.test/v/abc");
}

#[test]
fn identity_precedence_matches_the_typescript_cli() {
    let root = tempdir().unwrap();
    let file = root.path().join("page.html");

    assert_eq!(
        resolve_identity(root.path(), &file, Some("explicit"), true),
        Identity::Update("explicit".into())
    );
    assert_eq!(
        resolve_identity(root.path(), &file, None, true),
        Identity::Create
    );
    write_mapping(
        root.path(),
        mapping_key(root.path(), &file).unwrap(),
        PageMapping {
            id: "mapped".into(),
            url: "url".into(),
        },
    )
    .unwrap();
    assert_eq!(
        resolve_identity(root.path(), &file, None, false),
        Identity::Update("mapped".into())
    );
}
