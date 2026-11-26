# Production Release and Rollback Runbook

P9 targets an invite-only beta. This runbook is a gate, not evidence that the
current local worktree has been deployed.

## Owner Inputs

Before the first release, the owner supplies and records:

- the GitHub repository and protected `main` branch;
- separate HTTPS `APP_ORIGIN` and `SERVE_ORIGIN` registrable domains;
- the deployment provider and immutable release identifier;
- Google/GitHub OAuth applications and exact callbacks;
- production Neon project plus test-branch strategy;
- production serverless Redis REST endpoint, access token, and an independent
  32-byte HMAC key for distributed runtime protection;
- private object-storage bucket and least-privilege credentials;
- render service location and shared secret;
- monitoring/error sink, escalation owner, retention policy, and backup owner.

Secrets belong in the deployment provider or GitHub production environment.
They never belong in Git, release artifacts, issue text, or command output.

## Preflight

1. Require a clean tagged Git revision. Run `pnpm release:inventory` and review
   every listed worktree file before staging or committing.
2. Run `pnpm verify:release`. A skipped database/render job is not a pass.
3. Confirm the release contract versions and Drizzle migration head match the
   tag. Inspect every migration after the last deployed head.
4. Run `pnpm config:check` with production environment values.
5. Run `pnpm protection:smoke`. It uses a disposable namespace and prints no
   credential, raw IP, user, organization, token, or content value.
6. Confirm database and object-store backups completed and a restore drill has
   succeeded within the approved recovery window.

## Release Order

1. Create a Neon restore point/branch and record the currently deployed Git SHA,
   migration head, render digest, CLI version, and storage mode.
2. Apply additive Drizzle migrations. Do not drop legacy HTML columns or purge
   content during the beta rollback window.
3. Deploy the render image by immutable digest and verify its authenticated
   health/smoke contract from the app network.
4. Deploy the web revision with the recorded release id. Verify `/healthz` on
   both allowed origins and confirm serving-host routing rejects console paths.
5. Smoke Google/GitHub login, organization switching, token creation, REST,
   MCP, publish/update/share, public and organization serving, history restore,
   and all export formats with two accounts.
   Confirm `429` responses include `Retry-After`, quota failures return `409`,
   and a deliberately unavailable protection store fails closed with `503`.
6. Keep the native CLI release held back until the production web/API smoke is
   green. Publish a prerelease first and test every supported platform.
7. Open invite-only access and monitor 5xx, 503, auth, render, storage, and abuse
   signals before expanding the cohort.

## Readiness Checks

`GET /healthz` proves only that the web process can serve requests. Operators
must separately verify Neon queries, the current default storage profile via
its connection test, the protection Redis adapter with `pnpm protection:smoke`,
and the render service using its authenticated contract.
No provider error body, credential, token, HTML, or signed URL may appear in
public health output or logs.

## Rollback Triggers

Rollback on sustained elevated 5xx/503, tenant-boundary failure, auth/login
failure, corrupt or missing content, failed render isolation, migration error,
or inability to revoke access. A suspected cross-tenant exposure immediately
closes public access and rotates affected credentials before diagnosis continues.

## Rollback Actions

- **Web:** redeploy the last recorded Git SHA. Do not point old code at schema it
  cannot read; additive compatibility is a release requirement.
- **Database:** stop the release and restore/repair forward. Drizzle migrations
  are not automatically reversed. Never improvise a destructive down migration.
- **Render:** restore the previous image digest and matching shared secret.
- **Storage:** switch `external` to `dual`, or `dual` to `database`, only while
  legacy HTML remains verified. Do not purge database HTML during rollback.
- **CLI:** stop publication, deprecate the faulty version, and issue a new patch
  based on the TypeScript fallback or last good native release. Retain artifacts
  and checksums for incident analysis.

After rollback, record the incident window, affected release ids, data checks,
credential rotations, and the evidence required before another release attempt.
