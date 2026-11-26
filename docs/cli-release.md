# Native CLI Release Runbook

The Kiosk CLI lives in `packages/cli` and is distributed via `cargo-dist`
(shell, PowerShell, and npm installers for macOS, Linux, and Windows). Do not
create a release tag or npm publication while `pnpm cli:release:check` fails.

## One-time production setup

1. Ensure `repository` in `packages/cli/Cargo.toml` matches Git `origin`.
2. Replace `DEFAULT_API_BASE` in `packages/cli/src/config.rs` and
   `packages/cli/contract/v1.json` with the same production HTTPS `/api/v1` URL.
3. Configure npm trusted publishing for `@kiosk/cli`, or add the narrowly scoped
   npm publishing secret required by `.github/workflows/release.yml`.
4. Run `pnpm cli:release:check` and resolve every reported gate.

## Release sequence

1. Keep the Cargo, web, and render versions aligned in `scripts/release-contract.json`
   and update release notes.
2. Run `pnpm verify:cli` (`cargo fmt`, `cargo clippy`, `cargo test`, release build).
3. Run `cargo dist plan` and inspect the six target archives, shell and PowerShell
   installers, npm installer, and `.sha256` artifacts.
4. Push a prerelease tag first (e.g. `v0.1.0-rc.1`) to build all six targets
   without publishing npm.
5. Install and exercise each target artifact. Verify `login`, `publish`, same-URL
   update, `list`, `templates`, `template`, `share`, `export`, `open`, `delete`,
   `whoami`, `logout`, and `install-skill`.
6. Push the stable tag (e.g. `v0.1.0`) once prerelease checks pass.
7. Verify `npm install -g @kiosk/cli`, the shell installer, and the PowerShell
   installer from clean machines.

## Rollback

If a native release introduces a regression, stop the npm publish job, deprecate
the affected npm version, and publish a patch release fixing the issue. Do not
delete existing GitHub release artifacts; retain them with a release note
identifying the faulty version.
