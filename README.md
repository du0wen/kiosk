# Kiosk

> **Self-contained HTML sharing and publishing platform designed for AI coding assistants (Claude Code, Codex, Cursor, etc.).**
> Publish AI-generated single-page HTML artifacts into shareable, access-controlled URLs with strict zero-network CSP isolation, organization multi-tenancy, and MCP integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Rust CLI](https://img.shields.io/badge/CLI-Rust-orange)](cli-rs/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-2.0-green)](docs/mcp.md)

---

## 💡 Why Kiosk?

AI coding assistants frequently generate rich, interactive, self-contained single-page HTML artifacts (prototypes, dashboards, reports, mini-tools). However:
- Artifacts locked within local chats or IDEs cannot be easily shared with teammates or external clients.
- Uploading arbitrary AI-generated HTML to standard web hosting presents severe **Cross-Site Scripting (XSS)** and **data exfiltration** security risks.
- Existing tools lack versioning, organization team boundaries, and native AI tool protocol (MCP) support.

**Kiosk solves this cleanly:**
- 🛡️ **Double-Origin Isolation & Zero-Network CSP:** The console/API (`APP_ORIGIN`) and the served content (`SERVE_ORIGIN`) run on completely separate registrable domains. Rendered HTML executes inside sandboxed iframes with strict Content Security Policies that block all external network access.
- ⚡ **Native Rust CLI (`kiosk`):** Sub-second publishing, token management, and format export via lightweight native binaries.
- 🤖 **Native Model Context Protocol (MCP):** Connects directly with Claude Desktop, Claude Code, Cursor, and Codex via standard MCP tools.
- 👥 **Multi-Tenant Organizations & Access Control:** Pages are private to your organization by default, with optional explicit public sharing, signed-token access gates, and read-only version snapshots.
- 📄 **Air-Gapped Document Export:** Native conversion to Markdown, HTML, and isolated Chromium-rendered PDF/PNG/JPEG with organization branding and watermarks.

---

## 🏛️ Security Architecture

```
User / AI Agent
      │
      ├───────────────────────┬────────────────────────┐
      ▼                       ▼                        ▼
[Rust CLI / MCP]       [Web Console]           [Direct Serving]
      │                       │                        │
      ▼                       ▼                        │
┌───────────────────────────────────────┐              │
│ APP_ORIGIN (e.g. app.kiosk.sh)        │              │
│ - Next.js App Router                  │              │
│ - Better Auth (OAuth / OIDC / Tokens) │              │
│ - REST v1 APIs & MCP Server (/mcp)    │              │
│ - Storage Layer (Neon / S3 / R2)      │              │
└───────────────────────────────────────┘              │
      │                                                │
      ▼ (Branded Shell /v/:id)                         ▼
┌──────────────────────────────────────────────────────────────┐
│ SERVE_ORIGIN (e.g. serve.kiosk.sh)                           │
│ - Isolated Sandboxed iframe (/p/:id)                         │
│ - Zero Cookies, Zero Storage, Strictly Stateless             │
│ - Strict CSP: default-src 'none'; script-src 'unsafe-inline' │
│ - Signed Token Gate for Organization-Private Pages           │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Install CLI

Pre-built binaries are available for macOS, Linux, and Windows:

```bash
# Via Cargo
cargo install --path cli-rs

# Or use the TypeScript CLI wrapper
pnpm --prefix cli build && npm install -g ./cli
```

### 2. Login & Publish

```bash
# 1. Login with browser authentication
kiosk login

# 2. Publish an AI-generated HTML file (defaults to organization-private)
kiosk publish ./dashboard.html

# 3. Publish as publicly accessible
kiosk publish ./report.html --public

# 4. Export page as PDF or PNG
kiosk export <page-id> --format pdf -o report.pdf
```

### 3. Connect via MCP (Model Context Protocol)

Kiosk exposes an MCP server endpoint at `POST /mcp` compatible with `@modelcontextprotocol/server` v2.

In your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kiosk": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "https://your-kiosk-app.domain/mcp"],
      "env": {
        "KIOSK_API_TOKEN": "kiosk_api_..."
      }
    }
  }
}
```

See [`docs/mcp.md`](docs/mcp.md) for full configuration details and Cursor / Claude Code integration instructions.

---

## 🐳 Self-Hosting & Deployment

Kiosk is designed to be easily deployable both as a managed cloud service and on private infrastructure.

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/du0wen/kiosk.git
cd kiosk

# Copy environment template
cp docker-compose.env.example .env

# Start all services (Web, Postgres, Redis, Render Service)
docker compose up -d
```

For detailed configuration instructions including reverse proxy and domain setup, refer to [`docs/self-hosting.md`](docs/self-hosting.md).

---

## 🛠️ Tech Stack

- **Web Application:** Next.js (App Router), React 19, Tailwind CSS / Vanilla CSS Modules
- **Authentication:** Better Auth (OIDC, OAuth, Organization Plugins) + Scoped API Tokens
- **Database & ORM:** PostgreSQL / Neon Serverless via Drizzle ORM
- **Runtime Protection & Quotas:** Serverless Redis (@upstash/redis) rate limits and tenant quotas
- **CLI:** Native Rust CLI (`cli-rs/`) with TypeScript fallback (`cli/`)
- **Protocol:** Model Context Protocol (MCP) Stateless Web Standard Transport
- **Isolated Rendering:** Node.js + Playwright Chromium sandbox (`render/`)

---

## 📂 Repository Structure

```
├── cli/                # TypeScript CLI fallback & shared contract
├── cli-rs/             # Native Rust CLI (publish, templates, export, auth)
├── docs/               # User & operations documentation
│   ├── self-hosting.md # Docker Compose, reverse proxy & setup wizard guide
│   ├── mcp.md          # Model Context Protocol integration guide
│   ├── legal/          # AUP, Terms of Service, Privacy Policy
│   └── operations/     # Backup and restore runbook
├── drizzle/            # PostgreSQL schema migrations
├── messages/           # i18n message catalogs (EN / ZH)
├── public/             # Brand icons and static assets
├── release/            # Release contract manifest
├── render/             # Isolated Chromium export rendering microservice
├── scripts/            # Verification, migration, and smoke-test scripts
├── src/
│   ├── app/            # Next.js App Router (Console, Setup, Auth, API, MCP, Serving)
│   ├── components/     # Design system & shared UI primitives
│   ├── db/             # Drizzle schema definitions & connection pools
│   ├── i18n/           # Internationalization configuration & locale routing
│   └── lib/            # Core services (Auth, Storage, Watermark, Templates, Quota)
├── docker-compose.yml  # Multi-container self-hosting orchestration
├── SECURITY.md         # Security policy & architecture guarantees
└── LICENSE             # MIT Open Source License
```

---

## 🤝 Contributing

We welcome contributions! Please review our development guidelines:
- **TDD:** All new features and bug fixes require automated tests (`pnpm test` / `cargo test`).
- **Isolation:** Never bypass the two-origin security model or relax Content Security Policy headers.
- **Clean Commits:** Do not include automated tool signatures in commit messages.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
