# Security Policy

## Reporting a Vulnerability

We take the security of Kiosk and its users seriously. If you believe you have discovered a security vulnerability in this project, please report it to us responsibly.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please submit a **Private Vulnerability Advisory** directly on GitHub:
https://github.com/du0wen/kiosk/security/advisories/new

### What to include in your report:
- A description of the vulnerability, including severity and potential impact.
- Clear, step-by-step reproduction instructions or a minimal proof of concept (PoC).
- Affected versions, platforms, or configurations.
- Any suggested fixes or mitigations (optional).

### What to expect:
- **Acknowledgement**: We will acknowledge receipt of your report within 48 hours.
- **Assessment**: We will evaluate the report and confirm the vulnerability.
- **Coordination**: We will keep you updated on our progress toward a fix and coordinate disclosure timelines.
- **Credit**: If you wish, we will publicly credit you in the release notes once the patch is published.

---

## Security Architecture & Design Guarantees

Kiosk enforces defense-in-depth isolation by design:
1. **Double-Origin Isolation**: The application/console origin (`APP_ORIGIN`) is strictly isolated from the serving origin (`SERVE_ORIGIN`). Session cookies use the `__Host-` prefix and are never accessible to served pages.
2. **Zero-Network Serving CSP**: Served pages are delivered with a strict Content Security Policy (`default-src 'none'; connect-src 'none'; form-action 'none'`), preventing external network exfiltration or background telemetry from user HTML.
3. **Sandboxed Rendering**: PDF and image exports are executed inside isolated Playwright Chromium instances with all outbound network requests dropped.
4. **Tenant Boundary Enforcement**: Data queries are strictly scoped to the user's active organization with role-based access control (Owner, Admin, Member).
