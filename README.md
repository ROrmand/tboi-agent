# Nebius Isaac Item Generator

Describe an item. Generate its mechanics. Pick it up and play with it in **The Binding of Isaac: Repentance+**, without restarting your run.

The mod combines a local Node bridge, Nebius Token Factory, and a custom REPENTOGON binding. Generated content is validated data consumed by fixed Lua handlers, never model-written code. Choose placeholder icons for quick setup or ComfyUI for generated artwork.

## Beta status

The onboarding and packaging tools are implemented, but a public custom REPENTOGON runtime has **not yet been pinned**. Stock REPENTOGON alone is insufficient. Standard setup and public-release packaging stop with an actionable message until the maintainer publishes the compatible native runtime. Preview ZIPs and existing developer installations remain usable. See the [release checklist](docs/RELEASING.md).

This is experimental software. Offline tests do not establish live-game compatibility. Back up saves separately and use a disposable run on Save File 2 or 3; do not use important Save File 1 for testing.

## Requirements

- Windows 10/11 and Steam Isaac with its DLC through **Repentance+** installed. Repentance without the plus is not the supported target.
- Official [REPENTOGON launcher](https://repentogon.com/install.html), followed by this project's compatible custom native runtime.
- [Node.js](https://nodejs.org/en/download) 24 LTS recommended; minimum 22.12.0. No Visual Studio or CMake for the intended packaged tester path. Git is optional for ZIP users.
- A [Nebius Token Factory](https://tokenfactory.nebius.com/) API key and access to the configured models. Model requests may incur charges.
- Internet for dependency installation and text generation. ComfyUI and its checkpoint are optional.

## Quick start

Once a public runtime is pinned, download a versioned Windows ZIP from [Releases](https://github.com/ROrmand/tboi-agent/releases), verify its checksum, and extract it to a writable folder. Close Isaac and any existing bridge first.

```powershell
.\setup.ps1 --dry-run
.\setup.ps1
# Enter NEBIUS_API_KEY privately in the generated .env file.
.\doctor.ps1
.\start.ps1
```

Setup requests approval before replacing native runtime files, backs them up, syncs only the mod allowlist, and creates missing artwork slots. Existing configuration, artwork, and saves are preserved. It does not install the game, Node, or the official launcher. If PowerShell blocks downloaded scripts, review them first and use `Unblock-File` on specific trusted scripts; do not disable system-wide security.

For another Steam library, add `--isaac-directory "D:\SteamLibrary\steamapps\common\The Binding of Isaac Rebirth"`.

See the [complete human walkthrough](docs/SETUP.md), including manual setup, or give your assistant the [agent setup protocol](docs/AGENT_SETUP.md). Both use the same CLI.

## Your first item

1. Leave the bridge terminal open and launch Isaac through REPENTOGON.
2. Enable **Live Sprite Swap Demo** in Mods. Its name/folder is retained to preserve save identity; do not install a second copy alongside it. Disable unrelated mods for the first test.
3. Select a disposable Save File 2/3 run. Press top-row or keypad **8**.
4. Enter an idea, choose Q0–Q4, and select **Generate Item**. The Creator closes while generation runs.
5. Wait for the pedestal, collect it, and try its effect. Pause and press **Tab** to view generated-item details.

The Creator supports mouse buttons and keyboard navigation: Down selects buttons, Left/Right changes selection, Enter activates, Up returns to the prompt, and Escape closes. Enter in the prompt inserts a newline.

## Artwork options

Set `IMAGE_BACKEND` in `.env`:

| Mode | Requirements | Result |
| --- | --- | --- |
| `placeholder` | No image service | Packaged generic icon; real generated mechanics |
| `comfyui` | Running ComfyUI and SDXL Turbo checkpoint | Locally generated artwork |
| `nebius` | Supported hosted image model configured | Hosted artwork, potentially additional costs |

ComfyUI setup is in [SETUP.md](docs/SETUP.md#optional-generated-art). Restart the bridge after changing configuration.

## Limits, saves, and privacy

- Typed generation creates passive collectibles; active and familiar generation have restrictions documented in the engineering notes.
- Effects are bounded by the capability catalog. Current artwork allocation is 128 slots; item IDs and artwork reservations have separate limits. Never delete ledgers or artwork to bypass capacity.
- Profiles restore on Continue. Artwork and reservations belong to the installed mod directory. Preserve it during updates and when switching save slots.
- Prompts and structured generation context go to Nebius. ComfyUI receives visual prompts when selected. Credentials stay in local `.env`; never include it in bug reports.
- Diagnostic logs may contain prompts, profiles, and server errors. Review/redact before sharing. Doctor checks key presence without a paid model call.

## Updating and recovery

Download the next tagged ZIP into a new folder, copy your `.env` privately, and run setup against the **same installed mod directory**. Stop Isaac and the bridge first. Setup state/backups live outside the ZIP in `%LOCALAPPDATA%\tboi-agent`; the receipt prints their exact location.

Review native restoration with `npm run rollback -- --dry-run`, then use `npm run rollback -- --yes`. Rollback refuses files changed by another update. `uninstall.ps1` moves the installed mod outside `mods`, preserves its files, and leaves REPENTOGON unchanged. No automatic updater is installed.

## Development and support

- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Source development and native builds](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Release process and publication gates](docs/RELEASING.md)
- [Archived detailed mechanics and implementation notes](docs/ENGINEERING_NOTES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The project's original code and documentation are licensed under the
[MIT License](LICENSE). Third-party and modified REPENTOGON components retain
their own licenses and notices.

Pushes to main run CI, not public releases. Manual workflow runs make temporary preview artifacts. Version tags publish permanent releases after tests, version checks, runtime pins, and licensing prerequisites pass.
