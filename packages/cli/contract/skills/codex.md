## Publishing HTML with Kiosk

Use the `kiosk` CLI to publish a self-contained HTML page to a shareable URL:
- Authenticate with `kiosk login`, or configure `KIOSK_TOKEN` for headless or CI use.
- Inline all CSS, JavaScript, fonts, and images. Kiosk's strict CSP blocks external network access.
- Run `kiosk publish <file.html>` for an organization-private page.
- Add `--public` only when the user explicitly wants anyone with the link to access it.
- Return the printed URL. Re-running the command for the same file updates the same URL.
- Maximum page size is 2 MB. Never publish secrets.
