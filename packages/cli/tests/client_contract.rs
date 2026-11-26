use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use kiosk_cli::client::{KioskClient, Visibility};

#[derive(Debug)]
struct CapturedRequest {
    request_line: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl CapturedRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

fn read_request(stream: &mut TcpStream) -> CapturedRequest {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    let header_end = loop {
        let read = stream.read(&mut buffer).unwrap();
        assert!(read > 0, "client closed before sending headers");
        bytes.extend_from_slice(&buffer[..read]);
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
    };
    let header_text = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().unwrap().to_owned();
    let headers = lines
        .filter(|line| !line.is_empty())
        .map(|line| {
            let (name, value) = line.split_once(':').unwrap();
            (name.to_owned(), value.trim().to_owned())
        })
        .collect::<Vec<_>>();
    let content_length = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    while bytes.len() - header_end < content_length {
        let read = stream.read(&mut buffer).unwrap();
        assert!(read > 0, "client closed before sending its body");
        bytes.extend_from_slice(&buffer[..read]);
    }

    CapturedRequest {
        request_line,
        headers,
        body: bytes[header_end..header_end + content_length].to_vec(),
    }
}

fn fixture(
    status: u16,
    content_type: &str,
    extra_headers: &[(&str, &str)],
    body: Vec<u8>,
) -> (String, mpsc::Receiver<CapturedRequest>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (sender, receiver) = mpsc::channel();
    let content_type = content_type.to_owned();
    let extra_headers = extra_headers
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect::<Vec<_>>();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        sender.send(read_request(&mut stream)).unwrap();
        let reason = if status == 204 { "No Content" } else { "OK" };
        write!(
            stream,
            "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n",
            body.len()
        )
        .unwrap();
        for (name, value) in extra_headers {
            write!(stream, "{name}: {value}\r\n").unwrap();
        }
        write!(stream, "\r\n").unwrap();
        stream.write_all(&body).unwrap();
    });
    (format!("http://{address}"), receiver)
}

#[test]
fn publish_sends_raw_html_and_kiosk_headers() {
    let response = br#"{"id":"abc","url":"https://k/v/abc","rawUrl":"https://raw/p/abc","visibility":"public"}"#.to_vec();
    let (api_base, request) = fixture(201, "application/json", &[], response);
    let client = KioskClient::new(api_base, "kiosk_api_test".into());

    let page = client
        .publish("<html>ok</html>", Some("Report"), Some(Visibility::Public))
        .unwrap();
    assert_eq!(page.id, "abc");
    assert_eq!(page.url, "https://k/v/abc");
    let request = request.recv().unwrap();
    assert_eq!(request.request_line, "POST /pages HTTP/1.1");
    assert_eq!(
        request.header("authorization"),
        Some("Bearer kiosk_api_test")
    );
    assert_eq!(request.header("content-type"), Some("text/html"));
    assert_eq!(request.header("x-kiosk-title"), Some("Report"));
    assert_eq!(request.header("x-kiosk-visibility"), Some("public"));
    assert_eq!(request.body, b"<html>ok</html>");
}

#[test]
fn visibility_uses_patch_with_a_json_body() {
    let response = br#"{"id":"abc","url":"https://k/v/abc","visibility":"org"}"#.to_vec();
    let (api_base, request) = fixture(200, "application/json", &[], response);
    let client = KioskClient::new(api_base, "token".into());

    client.set_visibility("abc", Visibility::Org).unwrap();
    let request = request.recv().unwrap();
    assert_eq!(request.request_line, "PATCH /pages/abc HTTP/1.1");
    assert_eq!(request.header("content-type"), Some("application/json"));
    assert_eq!(request.body, br#"{"visibility":"org"}"#);
}

#[test]
fn api_error_uses_server_message_and_maps_unauthorized_to_exit_two() {
    let response = br#"{"error":{"code":"unauthorized","message":"bad token"}}"#.to_vec();
    let (api_base, request) = fixture(401, "application/json", &[], response);
    let error = KioskClient::new(api_base, "bad".into()).me().unwrap_err();
    assert_eq!(error.to_string(), "bad token");
    assert_eq!(error.exit_code, 2);
    assert_eq!(request.recv().unwrap().request_line, "GET /me HTTP/1.1");
}

#[test]
fn rate_limit_error_includes_retry_after() {
    let response = br#"{"error":{"code":"rate_limited","message":"Too many requests"}}"#.to_vec();
    let (api_base, request) = fixture(429, "application/json", &[("Retry-After", "42")], response);
    let error = KioskClient::new(api_base, "token".into())
        .publish("<html></html>", None, None)
        .unwrap_err();
    assert_eq!(error.to_string(), "Too many requests. Retry in 42 seconds.");
    assert_eq!(error.exit_code, 1);
    request.recv().unwrap();
}

#[test]
fn export_preserves_binary_data_and_attachment_filename() {
    let (api_base, request) = fixture(
        200,
        "application/pdf",
        &[("Content-Disposition", "attachment; filename=\"report.pdf\"")],
        b"%PDF-test".to_vec(),
    );
    let client = KioskClient::new(api_base, "token".into());

    let export = client.export_file("abc", "pdf").unwrap();
    assert_eq!(export.data, b"%PDF-test");
    assert_eq!(export.filename, "report.pdf");
    assert_eq!(
        request.recv().unwrap().request_line,
        "GET /pages/abc/export?format=pdf HTTP/1.1"
    );
}
