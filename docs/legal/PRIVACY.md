# Privacy Policy

Last updated: November 2026

This Privacy Policy describes how Kiosk collects, uses, and safeguards information when you use our software and hosted services.

---

## 1. Information We Collect

### 1.1 Account and Organization Data
- When you sign in via Google OAuth or another OIDC provider, we receive your email address, name, and profile avatar solely for authentication and team identification.
- When you create an organization or invite members, we store organization names, membership roles, and API token metadata.

### 1.2 Hosted Page Content
- When you publish a page via CLI, MCP, or console, we store the generated HTML content, page title, version history, and view counts.
- Pages designated as `org` are strictly private to members of your organization. Pages designated as `public` are accessible to anyone with the link.

### 1.3 Abuse Reports & Security Telemetry
- When a user submits an abuse report via `/report`, we record the target URL, reported category, and reason.
- For privacy preservation, the reporter's IP address is **one-way hashed (SHA-256)** and never stored in plain text.

---

## 2. Cookies and Tracking

- **Console Origin (`APP_ORIGIN`)**: We use secure, HTTP-only session cookies (`__Host-` prefixed) strictly for authentication and security purposes. We do not use third-party advertising cookies or cross-site tracking trackers.
- **Serving Origin (`SERVE_ORIGIN`)**: The serving domain is **100% cookieless**. No cookies are read, set, or transmitted when visiting `/p/:id`.

---

## 3. Data Retention and Deletion

- **Soft Deletion**: Users can delete their published pages through the CLI, MCP, or Web Console. Soft-deleted pages are immediately excluded from active serving and searches.
- **Account / Organization Removal**: Organization owners may revoke invitations and remove members. If you require complete deletion of your account and associated organization data, contact the instance administrator.
