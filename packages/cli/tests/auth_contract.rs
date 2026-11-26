use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use kiosk_cli::auth::{
    CLIENT_ID, app_origin_from, bind_first_available, build_authorize_url, exchange_code,
    mint_api_token, parse_callback_target, pkce_challenge, pkce_pair,
};

#[test]
fn app_origin_strips_only_the_rest_v1_suffix() {
    assert_eq!(
        app_origin_from("https://app.example/api/v1"),
        "https://app.example"
    );
    assert_eq!(
        app_origin_from("http://localhost:58671/api/v1/"),
        "http://localhost:58671"
    );
}

#[test]
fn pkce_matches_the_rfc_7636_s256_vector_and_is_fresh() {
    assert_eq!(
        pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
    let first = pkce_pair().unwrap();
    let second = pkce_pair().unwrap();
    assert_eq!(first.challenge, pkce_challenge(&first.verifier));
    assert_ne!(first.verifier, second.verifier);
}

#[test]
fn authorize_url_preserves_the_current_oidc_contract() {
    let url = build_authorize_url(
        "https://app.example",
        "http://127.0.0.1:8976/callback",
        "state value",
        "challenge/value",
    );
    assert!(url.starts_with("https://app.example/api/auth/oauth2/authorize?"));
    assert!(url.contains("response_type=code"));
    assert!(url.contains(&format!("client_id={CLIENT_ID}")));
    assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A8976%2Fcallback"));
    assert!(url.contains("scope=openid"));
    assert!(url.contains("state=state%20value"));
    assert!(url.contains("code_challenge=challenge%2Fvalue"));
    assert!(url.contains("code_challenge_method=S256"));
}

#[test]
fn callback_requires_the_expected_path_state_and_code() {
    assert_eq!(
        parse_callback_target("/callback?code=a%2Fb&state=correct", "correct").unwrap(),
        "a/b"
    );
    assert!(parse_callback_target("/callback?code=abc&state=wrong", "correct").is_err());
    assert!(parse_callback_target("/callback?state=correct", "correct").is_err());
    assert!(parse_callback_target("/other?code=abc&state=correct", "correct").is_err());
}

#[test]
fn loopback_uses_the_first_free_candidate() {
    let occupied = TcpListener::bind("127.0.0.1:0").unwrap();
    let occupied_port = occupied.local_addr().unwrap().port();
    let free_probe = TcpListener::bind("127.0.0.1:0").unwrap();
    let free_port = free_probe.local_addr().unwrap().port();
    drop(free_probe);

    let listener = bind_first_available(&[occupied_port, free_port]).unwrap();
    assert_eq!(listener.port(), free_port);
}

#[test]
fn loopback_receives_a_validated_callback_and_returns_html() {
    let free_probe = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = free_probe.local_addr().unwrap().port();
    drop(free_probe);
    let listener = bind_first_available(&[port]).unwrap();
    let browser = thread::spawn(move || {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stream,
            "GET /callback?code=auth%2Fcode&state=expected HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        )
        .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    });

    let code = listener
        .wait_for_code("expected", Duration::from_secs(2))
        .unwrap();
    assert_eq!(code, "auth/code");
    assert!(browser.join().unwrap().starts_with("HTTP/1.1 200 OK"));
}

#[test]
fn loopback_ignores_unrelated_requests_before_the_callback() {
    let free_probe = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = free_probe.local_addr().unwrap().port();
    drop(free_probe);
    let listener = bind_first_available(&[port]).unwrap();
    let browser = thread::spawn(move || {
        let mut unrelated = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            unrelated,
            "GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        )
        .unwrap();
        unrelated.read_to_end(&mut Vec::new()).unwrap();

        let mut callback = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            callback,
            "GET /callback?code=abc&state=expected HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        )
        .unwrap();
        callback.read_to_end(&mut Vec::new()).unwrap();
    });

    assert_eq!(
        listener
            .wait_for_code("expected", Duration::from_secs(2))
            .unwrap(),
        "abc"
    );
    browser.join().unwrap();
}

fn oauth_fixture(
    status: u16,
    body: &'static str,
) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (sender, receiver) = mpsc::channel();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            bytes.extend_from_slice(&buffer[..read]);
            let Some(header_end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") else {
                continue;
            };
            let headers = String::from_utf8_lossy(&bytes[..header_end + 4]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if bytes.len() >= header_end + 4 + content_length {
                break;
            }
        }
        sender.send(String::from_utf8(bytes).unwrap()).unwrap();
        write!(
            stream,
            "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });
    (format!("http://{address}"), receiver, handle)
}

#[test]
fn exchanges_code_with_form_encoding() {
    let (origin, request, handle) = oauth_fixture(200, r#"{"access_token":"oidc-token"}"#);
    let token = exchange_code(
        &origin,
        "code/value",
        "http://127.0.0.1:8976/callback",
        "verify value",
    )
    .unwrap();
    assert_eq!(token, "oidc-token");
    let request = request.recv().unwrap();
    assert!(request.starts_with("POST /api/auth/oauth2/token HTTP/1.1"));
    assert!(
        request
            .to_ascii_lowercase()
            .contains("content-type: application/x-www-form-urlencoded")
    );
    assert!(request.contains("client_id=kiosk-cli"));
    assert!(request.contains("code=code%2Fvalue"));
    assert!(request.contains("code_verifier=verify%20value"));
    handle.join().unwrap();
}

#[test]
fn mints_only_the_durable_api_token() {
    let (origin, request, handle) = oauth_fixture(200, r#"{"token":"kiosk_api_native"}"#);
    let token = mint_api_token(&origin, "oidc-access").unwrap();
    assert_eq!(token, "kiosk_api_native");
    let request = request.recv().unwrap();
    assert!(request.starts_with("POST /api/cli/token HTTP/1.1"));
    assert!(
        request
            .to_ascii_lowercase()
            .contains("authorization: bearer oidc-access")
    );
    handle.join().unwrap();
}
