---
name: kiosk
description: Publish a self-contained HTML page to a shareable Kiosk URL. Use when the user wants to share a generated HTML page, report, or visualization.
---

# Publish to Kiosk

Publish a self-contained HTML page with the `kiosk` CLI.

## Prerequisites

- The `kiosk` CLI is installed and authenticated.
- Run `kiosk login` once to authenticate in the browser, or set `KIOSK_TOKEN` for headless or CI use.
- If publishing fails with an authentication error, ask the user to run `kiosk login` or configure `KIOSK_TOKEN`.

## Publish

1. Write one self-contained HTML file. Inline all CSS, JavaScript, fonts, and images. Kiosk's strict CSP blocks external network requests, scripts, styles, images, fetch calls, and form posts.
2. Run `kiosk publish <file.html>` for an organization-private page.
3. Add `--public` only when the user explicitly wants anyone with the link to access it.
4. Return the URL printed by the command to the user.

## Update

Run `kiosk publish <same-file.html>` again to update the same page at the same URL. The mapping is stored in `.kiosk/pages.json`. Use `--new` to create another page or `--id <id>` to update a specific page.

## Constraints

- Maximum page size: 2 MB.
- Organization-private is the default visibility.
- A public page can be opened by anyone with its link. Do not publish secrets.
