# Releasing

This repository supports two release channels:

- `stable`: official user-facing releases
- `nightly`: automated prerelease snapshots

## Stable releases

Use stable for normal production updates.

### Trigger

- Push a semver tag: `vX.Y.Z` (for example `v1.2.3`), or
- Run GitHub Actions `Release` manually with:
  - `channel=stable`
  - `version=1.2.3` (or `v1.2.3`)

### Behavior

- Workflow builds desktop artifacts for macOS, Linux, and Windows.
- A GitHub Release is created/updated with uploaded assets.
- If version is plain semver (`x.y.z`), release is marked as `latest`.

## Nightly releases

Use nightly for continuous prerelease builds.

### Trigger

- Scheduled run every 3 hours, or
- Manual run with:
  - `channel=nightly`

### Behavior

- Nightly runs skip if no code changes happened since the last nightly tag.
- Version is generated as:
  - `0.0.0-nightly.YYYYMMDD.RUN_NUMBER`
- Tag is generated as:
  - `nightly-v<version>`
- Release is published as prerelease and not marked latest.

## Auto-update behavior in Electron

Desktop updater is wired in `apps/desktop/src/main.ts` using `electron-updater`.

- Checks for updates on startup (packaged app only).
- Checks again every 30 minutes.
- Nightly prerelease updates are allowed only when app version contains `nightly`.
- Stable versions do not opt into prerelease updates.

## Secrets and signing

Workflow supports signing env vars if configured in repository secrets:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

If these are missing, build may still run but signing/notarization behavior depends on platform and tooling defaults.
