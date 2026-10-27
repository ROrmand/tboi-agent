# Architecture

The game-side mod writes bounded requests to the Isaac log. The local Node bridge watches it, calls Nebius Token Factory for catalog-constrained mechanics, validates the profile, and prepares its artwork. Placeholder mode uses bundled art; ComfyUI and hosted art are optional backends.

The bridge publishes validated envelopes through the local Windows named pipe `nebius_isaac_bridge_v1`. The custom REPENTOGON binding exposes only `NebiusBridge.Poll()` and `NebiusBridge.Ack(id)`. Native pipe I/O runs on a worker. Fixed Lua handlers validate and apply accepted data, then acknowledge application. Model-generated Lua is never executed.

Job receipts protect acknowledged delivery; artwork reservations protect assets shared by continuing runs and the current game process. Do not reset these files to work around capacity.

## Onboarding

PowerShell wrappers and agents both call `scripts/setup/cli.mjs`. Detection and planning are read-only. Installation locks the selected installation, checks that Isaac and the bridge are stopped, verifies pinned runtime hashes, backs up native/mod files, syncs the allowlist, prepares missing assets, and writes a non-secret receipt.

Native rollback restores only recorded paths after integrity checks. Mod uninstall moves the recognized folder outside mods rather than deleting it. State/backups live in LocalAppData so a newly extracted release can reuse them.

Doctor checks file and service prerequisites without a paid model request. It cannot prove live gameplay. A game session must establish that the loaded runtime, mod callbacks, and generated item all work together.
