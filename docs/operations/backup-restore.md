# Kiosk Backup, Restore, and Disaster Recovery Runbook

This runbook establishes disaster recovery (DR) requirements and operational procedures for Kiosk production and private deployments, covering both database metadata and object-stored HTML payloads.

---

## 1. Recovery Objectives

- **RPO (Recovery Point Objective):** <= 1 hour (maximum tolerable data loss window).
- **RTO (Recovery Time Objective):** <= 15 minutes (maximum tolerable service downtime for critical components).
- **Blast Radius Mitigation:** Restore rehearsals are strictly performed in disposable branches or staging environments. Never perform unverified restores directly into production databases.

---

## 2. Backup Architecture & Data Boundaries

Kiosk stores tenant data in two distinct systems:

| Data Layer | Contents | Primary Storage | Backup Mechanism |
|---|---|---|---|
| **Relational Metadata** | Organizations, users, sessions, API tokens, page permissions, versions | Neon PostgreSQL / Self-Hosted Postgres | Automated WAL archiving + Point-In-Time Recovery (PITR) + Daily logical snapshots |
| **Content Payloads** | Raw self-contained HTML revisions, snapshots, export artifacts | S3 / Cloudflare R2 / Vercel Blob / Database | Object store cross-region bucket replication + Object Versioning with immutability locks |

---

## 3. Database Backup & Restore Procedures

### A. Neon Serverless (Cloud Deployment)

1. **Creating a Restore Point / Branch:**
   ```bash
   # Create an isolated instant copy for testing or backup before applying major migrations
   neon branches create --name restore-rehearsal-$(date +%Y%m%d)
   ```

2. **PITR Recovery:**
   In case of accidental corruption or data loss, restore the branch to the exact timestamp prior to the incident via the Neon console or CLI.

### B. Self-Hosted PostgreSQL (Docker / Bare Metal)

1. **Automated Snapshot:**
   ```bash
   docker compose exec -T postgres pg_dump -U kiosk -F c -b -v -f /var/lib/postgresql/data/backup_latest.dump kiosk
   ```

2. **Isolated Verification Drill:**
   ```bash
   # Restore into a temporary test database
   docker compose exec -T postgres createdb -U kiosk kiosk_verify_drill
   docker compose exec -T postgres pg_restore -U kiosk -d kiosk_verify_drill /var/lib/postgresql/data/backup_latest.dump
   docker compose exec -T postgres psql -U kiosk -d kiosk_verify_drill -c "SELECT count(*) FROM pages;"
   docker compose exec -T postgres dropdb -U kiosk kiosk_verify_drill
   ```

---

## 4. Object Storage (P8) Backup & Consistency Verification

When `CONTENT_STORAGE_MODE` is set to `dual` or `external`:

1. **Object Store Versioning:**
   Enable versioning on the target S3/R2 bucket to ensure deleted or overwritten HTML files remain recoverable.

2. **Storage Consistency Verification Drill:**
   Run the content verification probe to confirm all active page references resolve to valid storage payloads:
   ```bash
   pnpm storage:migrate --verify-only
   ```

---

## 5. Rollback Decision Protocol

| Trigger Scenario | Primary Action | Rollback Verification Check |
|---|---|---|
| **Failed Migration** | Stop release; restore forward or failover to Neon pre-migration branch. Do not run destructive down migrations. | Run `pnpm verify:db` on candidate branch. |
| **Object Store Unavailability** | Switch `CONTENT_STORAGE_MODE` from `external` to `dual` or `database` fallback. | Confirm `/p/:id` returns 200 without S3 connection errors. |
| **Render Microservice Saturation / OOM** | Scale render replicas or increase `MAX_CONCURRENT_RENDERS`. Check `GET /healthz`. | Verify PDF/PNG export returns valid byte buffers. |
| **Tenant Boundary / Security Breach** | Immediately revoke active session tokens, rotate `BETTER_AUTH_SECRET`, and isolate suspect organization. | Inspect `/settings/operations` and security audit logs. |
