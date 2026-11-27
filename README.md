# Kiosk

> **Self-contained HTML sharing and publishing platform designed for AI coding assistants (Claude Code, Codex, Cursor, etc.).**
> Publish AI-generated single-page HTML artifacts into shareable, access-controlled URLs with strict zero-network CSP isolation, organization multi-tenancy, and MCP integration.

[![Website](https://img.shields.io/badge/Website-kioskai.dev-0f766e)](https://kioskai.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Rust CLI](https://img.shields.io/badge/CLI-Rust-orange)](packages/cli/)
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

Pre-built binaries are available for macOS, Linux, and Windows (no Rust or Node.js required):

```bash
# macOS / Linux (Shell installer)
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/du0wen/kiosk/releases/latest/download/kiosk-cli-installer.sh | sh

# Windows (PowerShell installer)
powershell -ExecutionPolicy ByPass -c "irm https://github.com/du0wen/kiosk/releases/latest/download/kiosk-cli-installer.ps1 | iex"

# Or build from source via Cargo
cargo install --path packages/cli
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
- **CLI:** Native Rust CLI (`packages/cli/`) with cargo-dist shell, PowerShell, and npm installers
- **Protocol:** Model Context Protocol (MCP) Stateless Web Standard Transport
- **Isolated Rendering:** Node.js + Playwright Chromium sandbox (`apps/render/`)

---

## 📂 Repository Structure

```
├── apps/
│   ├── web/                # Next.js web app (Console, Setup, Auth, REST v1, MCP, Serving)
│   │   ├── src/
│   │   │   ├── app/        # App Router routes
│   │   │   ├── components/ # Design system & shared UI primitives
│   │   │   ├── db/         # Drizzle schema & migrations
│   │   │   ├── i18n/       # Internationalization & EN/ZH message catalogs
│   │   │   ├── lib/        # Core services (Auth, Storage, Watermark, Templates, Quota)
│   │   │   └── styles/     # Design tokens & base CSS
│   │   ├── public/         # Brand icons & static assets
│   │   └── Dockerfile      # Production container image
│   ├── render/             # Isolated Chromium export rendering microservice
│   └── site/               # Static open-source portal (Cloudflare Pages → kioskai.dev)
├── packages/
│   └── cli/                # Native Rust CLI & shared agent skill contracts
├── docs/                   # User & operations documentation
│   ├── self-hosting.md     # Docker Compose, reverse proxy & setup wizard guide
│   ├── mcp.md              # Model Context Protocol integration guide
│   ├── legal/              # AUP, Terms of Service, Privacy Policy
│   └── operations/         # Backup and restore runbook
├── scripts/                # Verification, migration, release contract & smoke scripts
├── docker-compose.yml      # Multi-container self-hosting orchestration
├── pnpm-workspace.yaml     # pnpm monorepo workspace configuration
├── SECURITY.md             # Security policy & architecture guarantees
└── LICENSE                 # MIT Open Source License
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
