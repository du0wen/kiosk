# Kiosk MCP Server

Kiosk exposes a remote MCP endpoint at:

```text
https://<APP_ORIGIN>/mcp
```

It uses the same organization-scoped `kiosk_api_` Bearer token as REST v1.
Create a token in **Settings > API Tokens**, then keep it in environment or
secret storage. Never commit the token.

Choose only the scopes needed by the client. MCP maps tools as follows:

- `identity:read`: `whoami`;
- `pages:read`: `list_pages` and `get_page`;
- `pages:write`: `publish_page`, `set_page_visibility`, and `delete_page`.

New tokens default to all scopes and a 90-day expiry. An expired token is
handled like a revoked token and requires login/token replacement.

## Codex

```bash
export KIOSK_TOKEN='kiosk_api_...'
codex mcp add kiosk \
  --url 'https://<APP_ORIGIN>/mcp' \
  --bearer-token-env-var KIOSK_TOKEN
```

Inspect or remove the connection with `codex mcp list`, `codex mcp get kiosk`,
or `codex mcp remove kiosk`.

## Claude Code

Claude Code expands environment variables in HTTP MCP URLs and headers. Put the
following in a user-local or project `.mcp.json`; the file contains variable
references, not the token itself:

```json
{
  "mcpServers": {
    "kiosk": {
      "type": "http",
      "url": "${KIOSK_APP_ORIGIN}/mcp",
      "headers": {
        "Authorization": "Bearer ${KIOSK_TOKEN}"
      }
    }
  }
}
```

```bash
export KIOSK_APP_ORIGIN='https://<APP_ORIGIN>'
export KIOSK_TOKEN='kiosk_api_...'
claude mcp get kiosk
```

Claude Code also supports `claude mcp add --transport http`, but passing a
literal authorization header on the command line can leave the secret in shell
history or local configuration.

Official setup references:

- [Codex MCP documentation](https://developers.openai.com/codex/mcp)
- [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)

## Available Tools

- `publish_page`: publish new self-contained HTML or update an explicit page ID.
- `list_pages`: list concise metadata for the active token organization.
- `get_page`: read one page's metadata without its stored HTML.
- `set_page_visibility`: switch between `org` and `public`.
- `delete_page`: soft-delete a page, subject to organization role rules.
- `whoami`: show the token user, organization, and role.

## MCP Or Skill + CLI

Use MCP when the AI host is remote, managed, or has no reliable shell. It gives
the host discoverable schemas and organization-aware operations over HTTPS.

Prefer the Skill plus Rust CLI for local coding agents. Large generated HTML is
sent directly from disk instead of being serialized through another model tool
call, and `.kiosk/pages.json` preserves same-file update mappings.

Export remains in the CLI, console, and REST API. Kiosk intentionally exposes no
MCP page-content resource, PDF/image export tool, prompt, sampling, or arbitrary
URL fetcher; those features would add large binary or HTML payloads to model
context without improving the publish workflow.

## Claude Desktop & Cursor

### Claude Desktop

For desktop clients that support remote MCP HTTP endpoints, add the following to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kiosk": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<APP_ORIGIN>/mcp",
        "--header",
        "Authorization: Bearer <KIOSK_TOKEN>"
      ]
    }
  }
}
```

### Cursor

1. Open **Cursor Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. Name: `kiosk`.
4. Type: `command` (or `http` if your Cursor build supports direct remote transports).
5. Command: `npx -y mcp-remote https://<APP_ORIGIN>/mcp --header "Authorization: Bearer <KIOSK_TOKEN>"`.

## Error Handling & Rate Limiting

The MCP endpoint enforces the same security and quota protections as REST v1:

- `401 Unauthorized`: Token missing, invalid, or expired.
- `403 Forbidden`: Token lacks required scope (e.g. `pages:write` for publishing) or role permission.
- `429 Too Many Requests`: Rate limit reached. The response includes a standard `Retry-After` header.
- `409 Conflict`: Organization quota exceeded (page count or stored byte limit).

## Server Configuration

`APP_ORIGIN` is always accepted as the MCP Host and browser Origin. Optional
comma-separated allowlists support preview deployments:

```dotenv
MCP_ALLOWED_HOSTS=preview.kiosk.example
MCP_ALLOWED_ORIGINS=https://admin.example
```

Do not add `SERVE_ORIGIN`: the cookieless serving domain must never expose
`/mcp`. Requests without an Origin header are allowed for non-browser MCP hosts;
a present browser Origin must match exactly.

## Protection Errors

REST and MCP share distributed pre-auth and token/organization limits. HTTP
clients must respect `429` and `Retry-After`. Organization quota failures use
`409 quota_exceeded`; protection-store failures use a sanitized
`503 protection_unavailable`. None of these responses reveal token values,
raw client IPs, page HTML, or another organization's resource existence.
