# Self-Hosting Kiosk

This guide explains how to deploy and operate Kiosk on your own infrastructure using Docker Compose.

---

## 1. Prerequisites & Architecture

Kiosk requires two separate registrable domains (or subdomains with strict cookie isolation):
- **Console & API (`APP_ORIGIN`):** Serves the Next.js dashboard, REST APIs, and Better Auth session cookies (`__Host-` prefixed).
- **Public Serving (`SERVE_ORIGIN`):** Serves rendered single-page HTML inside sandboxed iframes with strict zero-network CSP.

> ⚠️ **Critical Security Requirement:** `APP_ORIGIN` and `SERVE_ORIGIN` must **not** share cookies. Never set wildcard session cookies on a parent domain.

---

## 2. Quick Start with Docker Compose

### Step 1: Clone Repository & Setup Environment

```bash
git clone https://github.com/du0wen/kiosk.git
cd kiosk

# Copy environment template
cp docker-compose.env.example .env
```

Generate secure secrets for authentication and the render microservice:

```bash
# Generate BETTER_AUTH_SECRET
openssl rand -hex 32

# Generate RENDER_SHARED_SECRET
openssl rand -hex 32

# Generate STORAGE_CREDENTIAL_KEY
openssl rand -hex 32
```

Paste these into your `.env` file.

### Step 2: Configure Domains

#### For Local Testing:
Add the serving hostname to `/etc/hosts`:
```text
127.0.0.1  localhost
127.0.0.1  serve.kiosk.test
```

#### For Production Deployments:
Point two DNS records (e.g. `app.example.com` and `serve.example.com`) to your server IP.

Update `.env`:
```dotenv
APP_ORIGIN=https://app.example.com
SERVE_ORIGIN=https://serve.example.com
BETTER_AUTH_URL=https://app.example.com
```

### Step 3: Run Database Migrations & Start Services

```bash
# Start Postgres, Redis, and Render service
docker compose up -d postgres redis render

# Run database schema migrations
pnpm db:migrate

# Start the Web application
docker compose up -d web
```

---

## 3. Reverse Proxy Configuration

In production, place Kiosk behind Nginx, Caddy, or Cloudflare.

### Caddy Example

```caddyfile
app.example.com {
    reverse_proxy localhost:3000
}

serve.example.com {
    reverse_proxy localhost:3000
}
```

### Nginx Example

```nginx
# App Origin (Console, API, MCP)
server {
    server_name app.example.com;
    listen 443 ssl http2;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Serve Origin (Raw & Sandboxed HTML Serving)
server {
    server_name serve.example.com;
    listen 443 ssl http2;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. Render Microservice Isolation

The rendering microservice (`apps/render/`) uses Playwright to export HTML to PDF, PNG, and JPEG.
In `docker-compose.yml`, the render container is attached to an **air-gapped network** (`internal: true`).
This guarantees that rendered untrusted HTML can never initiate outbound requests or scan private networks.

---

## 5. Content Storage (Local Folder Default & External Object Storage)

By default, Kiosk runs in `CONTENT_STORAGE_MODE=external` and stores published HTML payloads in a local content-addressed directory instead of bloating PostgreSQL:

- **Docker Compose**: `/var/lib/kiosk/storage` (persisted via the `kiosk_storage` named volume).
- **Local source checkout**: `./data/storage` (configurable via `STORAGE_LOCAL_DIR`).
- **Directory layout**: `<root>/organizations/<orgId>/content/sha256/<hash>.html` (tenant-isolated, SHA-256 deduplicated, `0o600` permissions).

### Switching to External Object Storage (S3 / Cloudflare R2 / MinIO / Vercel Blob)

1. Set `KIOSK_ADMIN_EMAILS` and `STORAGE_CREDENTIAL_KEY` (32-byte base64 or hex key for AES-256-GCM credential encryption).
2. Open `/settings/storage` in the web console as a platform admin.
3. Add an S3-compatible or Vercel Blob profile, run **Test Connection**, enable it, and set it as **Default**.
4. New publishes write directly to the external bucket while existing pages continue reading from their recorded local profile. You can migrate historical objects at any time with `scripts/storage-migrate.ts`.

---

## 6. Maintenance & Backup

### Backup Database and Local Storage
```bash
docker compose exec postgres pg_dump -U kiosk kiosk > backup_$(date +%Y%m%d).sql
```
If using the default local storage volume, back up the `kiosk_storage` Docker volume alongside your PostgreSQL dump.

### Restore Database
```bash
docker compose exec -T postgres psql -U kiosk kiosk < backup_file.sql
```
