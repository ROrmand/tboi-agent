# Troubleshooting

## Runtime publication is pending

This is expected until a custom binary/source release has been published and pinned. Stock REPENTOGON does not expose NebiusBridge. Do not substitute an arbitrary DLL or remove the guard. Existing developers can use the explicitly documented unpinned-runtime flags; ordinary testers should wait for the release.

## Isaac was not found

Pass `--isaac-directory` with the Steam game directory containing `isaac-ng.exe`. Multiple copies require a choice. Mods must be below its `mods` directory and the runtime must be its `Repentogon` directory. Setup rejects unrelated paths and junction/symlink redirects.

## Node is missing or outdated

Install Node 24 LTS and reopen PowerShell. Confirm `node --version`. Minimum is 22.12.0. Node/npm are not silently installed by setup.

## API key or model error

Enter the key privately in `.env`, without surrounding quotes. Restart the bridge. Doctor checks presence only; account credit and configured model access require a real generation request. Never share `.env` or raw environment output.

## Existing configuration differs

Setup does not replace configured values. Review/edit only the named non-secret field in `.env`, then rerun. Passing an environment override or CLI path is not consent to rewrite other values.

## ComfyUI unavailable

Start its server and check that the configured checkpoint is visible. Or change `IMAGE_BACKEND=placeholder` and restart the bridge. Placeholder mode does not call an image endpoint.

## Close Isaac / stop bridge

Quit the game normally and stop the bridge terminal with Ctrl+C before installation or uninstall. Doctor requires its loopback port to be free. Do not terminate a wanted run automatically. Another service on port 3000 also needs an explicit resolution.

## Setup lock remains after interruption

Read the `setup.lock` PID in the printed LocalAppData state directory. Confirm that process and any setup process have stopped. Review the adjacent setup receipt and native `backups/*/receipt.json`. Do not delete the lock automatically. Once the user confirms no setup is active, they may remove only that exact lock and resume. For a prepared native receipt, use rollback with the printed backup path; changed/partially written files may require manual recovery from its verified files.

## Windows blocks a native DLL

Do not disable Smart App Control, Defender, or system-wide execution policies. A custom unsigned binary may be blocked. Use a trusted compatible signed build or return to the official runtime; report the blocker to the maintainer. Checksums establish download integrity, not code signing or safety.

## Rollback refuses changed files

Another updater or manual installation changed the runtime after setup. Automatic rollback intentionally refuses to clobber it. Preserve both sets and coordinate recovery. Do not copy an entire extracted game-resource directory over the installation.

## No Creator / no pedestal

Check that the game was launched through REPENTOGON, only one mod copy is enabled, the bridge is open, and all Lua/XML changes were followed by a full restart. In a disposable run use top-row or keypad 8. Check the actual Repentance+ log path; Windows Documents may be redirected. Doctor alone cannot verify a loaded native API.

## Capacity reached

Do not delete reservations, generated art, or saved state. Item-ID limits and process-wide artwork limits are separate. Finish/restart only when you are ready, preserving all continuable runs. See the archived engineering notes for ledger behavior.

## Reporting a problem

Share application version, actual game/REPENTOGON versions, Windows/Node version, doctor JSON, failing stage, and reproduction steps. Doctor omits keys, but local paths may identify your Windows account; redact those if desired. Manually review other logs for prompts, credentials, and generated content before sharing.
