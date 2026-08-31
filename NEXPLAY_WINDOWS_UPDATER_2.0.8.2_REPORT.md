# NexPlay Windows Updater 2.0.8.2 Report

Date: 2026-07-19  
Target: Windows x64  
Package type: self-contained offline updater bundle  
App display version: 2.0.8  
Technical file/update version: 2.0.8.2

## Outcome

NexPlay now has a complete local Windows update package that upgrades an existing NexPlay desktop installation from release 2.0.8.1 to 2.0.8.2. The package contains the updater, local update feed, verified application payload, launcher, checksum, and instructions in one ZIP.

The update was executed successfully against fresh disposable copies of the currently installed 2.0.8.1 app. The real installed NexPlay and NexPlay Offline installations were not changed.

No NexPlay UI was redesigned or altered for this updater work.

## Deliverable

Primary archive:

`dist-windows-updater\NexPlay-Windows-Updater-2.0.8.2.zip`

- Size: 214,730,168 bytes
- SHA-256: `144e226b01a32d20c6902b487e5cd5b770e34b77d50d1b2fbd002f5fdb18fe3b`
- Companion checksum: `NexPlay-Windows-Updater-2.0.8.2.zip.sha256`

The extracted archive contains:

- `Install NexPlay Update.cmd`
- `NexPlay Updater.exe`
- `nexplay-updater.json`
- `latest.json`
- `NexPlay-win-x64-2.0.8.2.zip`
- `README.txt`

Payload details:

- Size: 149,238,057 bytes
- SHA-256: `8bdc2a299f0cba702fc28692565d72bf1783cb4cf9bc06650ddef675d8da24eb`
- Manifest version: `2.0.8.2`
- App file version: `2.0.8.2`
- App product version: `2.0.8.0` / display version `2.0.8`
- Payload `NexPlay.exe` SHA-256: `b38afd30056159fd7284137598e9b4cf1c009d2d5a4e81c6d73edaf1231f133b`
- `latest.json` SHA-256: `1d3257f03d115362f33986c2eb83e7cd60cc0581ab9990252f467633101f620d`

Updater executable:

- Size: 162,107,381 bytes
- SHA-256: `47f35dd2d9f6d4619e2c5b096c0091ec0c82633258fdd8cde606271ecb5e04c4`
- File version: `2.0.8.2`
- Self-contained .NET 8 Windows x64 executable

## How to use it

1. Extract the complete `NexPlay-Windows-Updater-2.0.8.2.zip` archive.
2. Keep all six extracted files together.
3. Double-click `Install NexPlay Update.cmd`.
4. Review the update prompt and approve Windows elevation if requested.
5. Allow the updater to close NexPlay, install and validate the payload, then relaunch it if requested.

Do not run only the updater executable directly from inside the ZIP. The local manifest and payload must remain next to it in the extracted folder.

## Technical updater improvements

### Transaction and rollback safety

- Creates a complete validated backup before modifying the app directory.
- Writes an atomic durable transaction journal with `preparing`, `backup-ready`, `applying`, `committed`, and `rolled-back` states.
- Stores recovery data under `%LOCALAPPDATA%\NexPlay\UpdaterTransactions`.
- Computes a deterministic SHA-256 digest and file count for the rollback backup.
- Rolls back automatically when copying, validation, manifest writing, or receipt writing fails.
- Detects an interrupted `applying` transaction on the next updater run and restores the prior installation before doing anything else.
- Preserves the recovery backup and reports its location if recovery itself cannot complete.
- Deletes the transaction only after a successful commit or validated rollback.

### Process handling

- Uses a per-installation mutex so two updaters cannot modify the same app concurrently.
- Requests graceful shutdown from the window-owning/earliest NexPlay process first.
- Waits for the entire Electron process group to exit before force-stopping remaining helpers.
- Rescans immediately before copying so a restarted app cannot be updated while running.
- Treats an automatic relaunch failure as a launch warning after a successful update, not as a failed update.

### Target selection

- Accepts the real desktop registry naming formats, including `NexPlay 2.0.2`.
- Explicitly excludes `NexPlay Offline`, `NexPlay Updater`, beta names, and unrelated prefix matches.
- A read-only test with no explicit install folder selected `C:\Users\Adam\AppData\Local\Programs\NexPlay` and left both desktop NexPlay and NexPlay Offline unchanged.

### Filesystem and metadata safety

- Requires canonical relative paths in the installed-file manifest.
- Rejects rooted paths, `..` escapes, junctions, symbolic links, and other reparse points.
- Uses `robocopy /XJ` and validates the required installed files after copying.
- Writes the installed-file manifest and release receipt atomically with disk flushing.
- Requires the payload size and SHA-256 to match `latest.json` before extraction.
- Rejects bundle input/output paths that traverse reparse points.
- Keeps nested local payload paths intact when generating an offline bundle.
- Writes JSON manifests as UTF-8 without a byte-order mark.

## Verification performed

| Check | Result |
|---|---:|
| NexPlay application tests | 130/130 passed |
| Updater safety/integration tests | 15/15 passed |
| TypeScript type check | Passed |
| npm dependency audit | 0 vulnerabilities |
| Updater Release build | 0 warnings, 0 errors |
| PowerShell release-script parsing | Passed |
| Final outer ZIP extraction | 6/6 entries verified byte-for-byte |
| Payload-to-installed-copy verification | 74/74 files matched by SHA-256 |
| 2.0.8.1 to 2.0.8.2 disposable update | Passed, exit code 0 |
| Second/up-to-date check | Passed, no tracked files changed |
| Transaction cleanup after success | Passed, zero transactions remained |
| Simulated crash recovery | Passed |
| Corrupted recovery-backup preservation | Passed |
| Manifest traversal/outside-root deletion defense | Passed |
| Junction/reparse defense | Passed |
| Per-install concurrent updater lock | Passed |
| Final app launch smoke test | Passed |
| Independent final stale-artifact audit | Passed, no stale files or mismatches |

The launch smoke test confirmed:

- Electron `43.1.1`
- Chrome `150.0.7871.114`
- Page title `NexPlay - Hyperion OS`
- Desktop route loaded and exposed a ready renderer

## UI integrity verification

- The final payload `app.asar` SHA-256 is `9d13777397dcd8c77bfe9ec653ce1cc865bac8e078882e1e9aa024947bc9c78c`.
- It is byte-identical to the last validated Electron 43 technical-fix build.
- Nine HTML/CSS/asset UI files were compared with the restored UI reference and all nine were byte-identical.
- The automated checks protecting the original sidebar and floating-player layouts passed.
- No updater task changed NexPlay layout, styling, components, or artwork.

## Installed-app isolation

After all tests:

- Live NexPlay file version remained `2.0.8.1`.
- Live NexPlay release receipt remained `2.0.8.1`.
- NexPlay Offline remained unchanged.
- No NexPlay test process or updater transaction remained running.

Only disposable copies inside the workspace were updated.

## Important distribution limitation

This is a working local/offline updater package, but it is not Authenticode-signed. Both `NexPlay.exe` and `NexPlay Updater.exe` currently report `NotSigned`, so Windows can show an **Unknown publisher** or SmartScreen warning.

Before public internet distribution, the recommended release steps are:

1. Sign the app and updater with a trusted Windows code-signing certificate.
2. Host `latest.json` and the payload on controlled HTTPS infrastructure.
3. Protect the release manifest with a signing/verification mechanism in addition to the payload hash.

The SHA-256 companion file verifies local archive integrity, but it is not a substitute for trusted Authenticode signing when distributing to other users.
