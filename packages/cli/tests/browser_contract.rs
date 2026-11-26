use kiosk_cli::browser::{BrowserInvocation, browser_invocation};

#[test]
fn browser_invocation_is_native_on_each_desktop_platform() {
    let url = "https://kiosk.test/v/abc";
    assert_eq!(
        browser_invocation("macos", url).unwrap(),
        BrowserInvocation::new("open", [url])
    );
    assert_eq!(
        browser_invocation("linux", url).unwrap(),
        BrowserInvocation::new("xdg-open", [url])
    );
    assert_eq!(
        browser_invocation("windows", url).unwrap(),
        BrowserInvocation::new("cmd", ["/C", "start", "", url])
    );
    assert!(browser_invocation("unknown", url).is_err());
}
