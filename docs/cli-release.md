# Native CLI Release Runbook

The TypeScript package remains the public `@kiosk/cli` implementation until
all native release gates pass. Do not create the generated workflow, a release
tag, or an npm publication while `pnpm cli:release:check` fails.

## One-time production setup

1. Add the real GitHub URL as `repository` in `cli-rs/Cargo.toml` and configure
   the same repository as Git `origin`.
2. Replace `DEFAULT_API_BASE` in `cli-rs/src/config.rs`, `cli/src/config.ts`, and
   `cli/contract/v1.json` with the same production HTTPS `/api/v1` URL.
3. Configure npm trusted publishing for `@kiosk/cli`, or add the narrowly scoped
   npm publishing secret required by the generated workflow.
4. Run `pnpm cli:release:check` and resolve every reported gate.
5. Install dist `0.31.0`, run `dist generate`, and review the generated
   `.github/workflows/release.yml` before committing it.

## Release sequence

1. Keep the Cargo and npm package versions equal and update release notes.
2. Run the full Rust and TypeScript CLI verification suites.
3. Run `dist plan` and inspect the six target archives, shell and PowerShell
   installers, npm installer, and `.sha256` artifacts.
4. Push a prerelease tag first. Let the generated GitHub workflow build all six
   targets without publishing npm.
5. Install and exercise each target artifact. Verify login, publish, same-URL
   update, list, share, export, open, delete, whoami, logout, and install-skill.
6. Verify the generated npm package installs and launches the correct binary on
   every supported platform.
7. Push the stable tag and allow the npm publish job only after the prerelease
   evidence is complete.
8. Verify `npm install -g @kiosk/cli`, the shell installer, and the PowerShell
   installer from clean machines.

CLI login creates an all-scope token with a 90-day expiry. Both the native and
TypeScript clients map an expired token to the existing login-required exit
path and include the server's `Retry-After` duration in concise `429` errors.

## Rollback

If native installation or command parity fails, stop the npm publish job,
deprecate the affected native npm version, and republish the last TypeScript
implementation at a new patch version. Do not delete existing GitHub release
artifacts; retain them with a release note that identifies the faulty version.
Keep `cli/` buildable until at least one stable native release has completed its
upgrade and rollback drills.
