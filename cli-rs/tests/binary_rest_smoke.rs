use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::mpsc;
use std::thread;

use tempfile::tempdir;

#[test]
fn native_binary_lists_pages_through_rest_v1() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0_u8; 4096];
        let read = stream.read(&mut buffer).unwrap();
        let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
        sender.send(request).unwrap();
        let body = r#"{"pages":[{"id":"abc"}],"nextCursor":null}"#;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });

    let home = tempdir().unwrap();
    let project = tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_kiosk"))
        .arg("list")
        .current_dir(project.path())
        .env("HOME", home.path())
        .env("KIOSK_TOKEN", "kiosk_api_smoke")
        .env("KIOSK_API_BASE", format!("http://{address}"))
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        String::from_utf8(output.stdout)
            .unwrap()
            .contains("\"id\": \"abc\"")
    );
    let request = receiver.recv().unwrap();
    assert!(request.starts_with("GET /pages HTTP/1.1\r\n"));
    assert!(
        request
            .to_ascii_lowercase()
            .contains("authorization: bearer kiosk_api_smoke")
    );
}

#[test]
fn native_token_login_and_logout_use_an_isolated_home() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0_u8; 4096];
        let _ = stream.read(&mut buffer).unwrap();
        let body = r#"{"user":{"id":"u"},"organization":{"id":"o"},"role":"owner"}"#;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });

    let home = tempdir().unwrap();
    let project = tempdir().unwrap();
    let api_base = format!("http://{address}");
    let login = Command::new(env!("CARGO_BIN_EXE_kiosk"))
        .args(["login", "--token", "kiosk_api_isolated"])
        .current_dir(project.path())
        .env("HOME", home.path())
        .env("KIOSK_API_BASE", &api_base)
        .env_remove("KIOSK_TOKEN")
        .output()
        .unwrap();
    assert!(
        login.status.success(),
        "{}",
        String::from_utf8_lossy(&login.stderr)
    );
    assert_eq!(login.stdout, b"Logged in.\n");
    let saved: serde_json::Value = serde_json::from_slice(
        &std::fs::read(home.path().join(".config/kiosk/config.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(saved["token"], "kiosk_api_isolated");
    assert_eq!(saved["apiBase"], api_base);

    let logout = Command::new(env!("CARGO_BIN_EXE_kiosk"))
        .arg("logout")
        .current_dir(project.path())
        .env("HOME", home.path())
        .env_remove("KIOSK_TOKEN")
        .env_remove("KIOSK_API_BASE")
        .output()
        .unwrap();
    assert!(logout.status.success());
    assert_eq!(logout.stdout, b"Logged out.\n");
    let saved: serde_json::Value = serde_json::from_slice(
        &std::fs::read(home.path().join(".config/kiosk/config.json")).unwrap(),
    )
    .unwrap();
    assert!(saved.get("token").is_none());
    assert_eq!(saved["apiBase"], api_base);
}
