use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use percent_encoding::percent_decode_str;
use ring::digest::{SHA256, digest};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::Value;

use crate::browser::BrowserOpener;
use crate::error::CliError;

pub const CLIENT_ID: &str = "kiosk-cli";
pub const REDIRECT_PORTS: [u16; 3] = [8976, 8977, 8978];
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

pub fn app_origin_from(api_base: &str) -> String {
    api_base
        .strip_suffix("/api/v1/")
        .or_else(|| api_base.strip_suffix("/api/v1"))
        .unwrap_or(api_base)
        .to_owned()
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(digest(&SHA256, verifier.as_bytes()).as_ref())
}

pub fn pkce_pair() -> Result<PkcePair, CliError> {
    let mut random = [0_u8; 32];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| CliError::new("Secure random generation failed"))?;
    let verifier = URL_SAFE_NO_PAD.encode(random);
    Ok(PkcePair {
        challenge: pkce_challenge(&verifier),
        verifier,
    })
}

fn random_state() -> Result<String, CliError> {
    let mut random = [0_u8; 16];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| CliError::new("Secure random generation failed"))?;
    Ok(random.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

pub fn build_authorize_url(
    app_origin: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> String {
    let params = [
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", redirect_uri),
        ("scope", "openid"),
        ("state", state),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
    ];
    let query = params
        .iter()
        .map(|(key, value)| format!("{}={}", encode(key), encode(value)))
        .collect::<Vec<_>>()
        .join("&");
    format!("{app_origin}/api/auth/oauth2/authorize?{query}")
}

pub fn parse_callback_target(target: &str, expected_state: &str) -> Result<String, CliError> {
    let (path, query) = target
        .split_once('?')
        .ok_or_else(|| CliError::new("Login callback is missing query parameters"))?;
    if path != "/callback" {
        return Err(CliError::new("Unexpected login callback path"));
    }
    let mut code = None;
    let mut state = None;
    for field in query.split('&') {
        let (key, value) = field.split_once('=').unwrap_or((field, ""));
        let value = percent_decode_str(value)
            .decode_utf8()
            .map_err(|_| CliError::new("Login callback contains invalid encoding"))?
            .into_owned();
        match key {
            "code" => code = Some(value),
            "state" => state = Some(value),
            _ => {}
        }
    }
    if state.as_deref() != Some(expected_state) {
        return Err(CliError::new("Login callback state mismatch"));
    }
    code.filter(|value| !value.is_empty())
        .ok_or_else(|| CliError::new("Login callback is missing the authorization code"))
}

pub struct LoopbackListener {
    listener: TcpListener,
    port: u16,
}

impl LoopbackListener {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn wait_for_code(
        self,
        expected_state: &str,
        timeout: Duration,
    ) -> Result<String, CliError> {
        self.listener.set_nonblocking(true)?;
        let deadline = Instant::now() + timeout;
        loop {
            match self.listener.accept() {
                Ok((mut stream, _)) => {
                    if let Some(code) = handle_callback(&mut stream, expected_state)? {
                        return Ok(code);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        return Err(CliError::new("Timed out waiting for browser login"));
                    }
                    thread::sleep(Duration::from_millis(25));
                }
                Err(error) => return Err(error.into()),
            }
        }
    }
}

pub fn bind_first_available(ports: &[u16]) -> Result<LoopbackListener, CliError> {
    for &port in ports {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            return Ok(LoopbackListener { listener, port });
        }
    }
    Err(CliError::new(format!(
        "No free loopback port among {} for the login callback",
        ports
            .iter()
            .map(u16::to_string)
            .collect::<Vec<_>>()
            .join(", ")
    )))
}

fn handle_callback(
    stream: &mut TcpStream,
    expected_state: &str,
) -> Result<Option<String>, CliError> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 2048];
    while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            return Err(CliError::new("Browser closed the login callback early"));
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > 16 * 1024 {
            return Err(CliError::new("Login callback request is too large"));
        }
    }
    let first_line = String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .unwrap_or_default()
        .to_owned();
    let target = first_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| CliError::new("Malformed login callback request"))?;
    if target.split_once('?').map_or(target, |(path, _)| path) != "/callback" {
        let body = "Not found";
        write!(
            stream,
            "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )?;
        return Ok(None);
    }
    let result = parse_callback_target(target, expected_state);
    let (status, body) = if result.is_ok() {
        (
            "200 OK",
            "<h1>Kiosk</h1><p>Login complete - you can close this tab.</p>",
        )
    } else {
        (
            "400 Bad Request",
            "<h1>Kiosk</h1><p>Login failed. Return to the terminal.</p>",
        )
    };
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    result.map(Some)
}

fn auth_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .new_agent()
}

fn parse_token_response(
    mut response: ureq::http::Response<ureq::Body>,
    field: &str,
    action: &str,
) -> Result<String, CliError> {
    let status = response.status().as_u16();
    let data = response
        .body_mut()
        .read_to_vec()
        .map_err(|error| CliError::new(format!("{action} failed: {error}")))?;
    if !(200..300).contains(&status) {
        return Err(CliError::new(format!("{action} failed: HTTP {status}")));
    }
    serde_json::from_slice::<Value>(&data)
        .ok()
        .and_then(|body| body.get(field)?.as_str().map(str::to_owned))
        .ok_or_else(|| CliError::new(format!("{action} returned no {field}")))
}

fn form_body(fields: &[(&str, &str)]) -> String {
    fields
        .iter()
        .map(|(key, value)| format!("{}={}", encode(key), encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

pub fn exchange_code(
    app_origin: &str,
    code: &str,
    redirect_uri: &str,
    verifier: &str,
) -> Result<String, CliError> {
    let body = form_body(&[
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", CLIENT_ID),
        ("code_verifier", verifier),
    ]);
    let response = auth_agent()
        .post(format!("{app_origin}/api/auth/oauth2/token"))
        .content_type("application/x-www-form-urlencoded")
        .send(&body)
        .map_err(|error| CliError::new(format!("Token exchange failed: {error}")))?;
    parse_token_response(response, "access_token", "Token exchange")
}

pub fn mint_api_token(app_origin: &str, access_token: &str) -> Result<String, CliError> {
    let response = auth_agent()
        .post(format!("{app_origin}/api/cli/token"))
        .header("authorization", format!("Bearer {access_token}"))
        .send_empty()
        .map_err(|error| CliError::new(format!("Token mint failed: {error}")))?;
    parse_token_response(response, "token", "Token mint")
}

pub fn browser_login(
    api_base: &str,
    opener: &impl BrowserOpener,
    stdout: &mut impl Write,
) -> Result<String, CliError> {
    let app_origin = app_origin_from(api_base);
    let pkce = pkce_pair()?;
    let state = random_state()?;
    let listener = bind_first_available(&REDIRECT_PORTS)?;
    let redirect_uri = format!("http://127.0.0.1:{}/callback", listener.port());
    let authorize_url = build_authorize_url(&app_origin, &redirect_uri, &state, &pkce.challenge);
    writeln!(stdout, "Opening your browser to log in:\n  {authorize_url}")?;
    let _ = opener.open(&authorize_url);
    let code = listener.wait_for_code(&state, LOGIN_TIMEOUT)?;
    let access_token = exchange_code(&app_origin, &code, &redirect_uri, &pkce.verifier)?;
    mint_api_token(&app_origin, &access_token)
}
