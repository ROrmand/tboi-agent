# Setup walkthrough

## Before you begin

Use Windows 10/11, Steam Isaac with Afterbirth, Afterbirth+, Repentance, and Repentance+, and the official REPENTOGON launcher. Install Node.js 24 LTS and reopen PowerShell. Keep the game and bridge closed during installation. Back up saves using your normal backup procedure; setup never manages game saves.

Public runtime publication is pending. Until `release-manifest.json` pins it, the standard installation intentionally stops. Existing developers can use the development-only procedure below. Do not download random DLLs or disable Windows security to run a custom build.

## Guided installation

1. Download the Windows ZIP and its `.sha256` file from the project release page. Compare `Get-FileHash .\tboi-agent-vVERSION-windows.zip -Algorithm SHA256` with the published checksum. Extract to a writable location, not the game directory.
2. Open PowerShell in the extracted folder. Run `.\setup.ps1 --dry-run`. Review the game, mod, native-runtime and backup paths.
3. Run `.\setup.ps1`. Approve native replacement only after reviewing those paths. The official REPENTOGON installation must already exist. No blanket administrator access is requested.
4. Setup installs production npm dependencies, verifies the pinned native ZIP and its complete file inventory, backs up affected files, overlays the runtime, syncs the mod, and prepares missing art. It creates `.env` or fills only blank non-secret paths. It never replaces a configured value.
5. Enter `NEBIUS_API_KEY` privately in `.env`. No quotes are needed around values or Windows paths. Never paste your key into an agent prompt, command argument, or bug report.
6. Run `.\doctor.ps1`. A missing key or service is a request for user action, not a successful installation.
7. Run `.\start.ps1`, leave its terminal open, and launch Isaac through REPENTOGON. Enable **Live Sprite Swap Demo**. Use Save File 2/3, start a disposable run, and press 8.

You can also run the underlying commands directly without PowerShell wrappers:

```powershell
node scripts/setup/cli.mjs plan
node scripts/setup/cli.mjs install
node scripts/setup/cli.mjs doctor
node scripts/setup/cli.mjs start
```

## Choosing installation paths

Steam libraries are detected from the registry and `libraryfolders.vdf`. Multiple game installations require an explicit choice:

```powershell
.\setup.ps1 --isaac-directory "D:\SteamLibrary\steamapps\common\The Binding of Isaac Rebirth" --dry-run
```

The default mod path is `<game>\mods\live_sprite_swap_demo`; the default runtime is `<game>\Repentogon`. Keep the mod folder identity for existing runs. Do not run a Workshop copy and this local copy together. Explicit mod/runtime paths must remain within the selected game installation.

Documents may be redirected through OneDrive. Setup resolves Windows My Documents. If needed, set `ISAAC_LOG_FILE` to the actual Repentance+ `log.txt` before starting the bridge.

## Existing developer runtime

This escape hatch neither downloads nor proves compatibility of native DLLs. Use it only when you have already compiled and installed the project binding and confirmed Repentance+ in Steam:

```powershell
.\setup.ps1 --skip-runtime --allow-unpinned-runtime --confirm-repentance-plus --dry-run
.\setup.ps1 --skip-runtime --allow-unpinned-runtime --confirm-repentance-plus
.\doctor.ps1 --allow-unpinned-runtime --confirm-repentance-plus
.\start.ps1 --allow-unpinned-runtime --confirm-repentance-plus
```

These exceptions are explicit each time; a DLL marker is only a presence check. A real game session must verify Poll/Ack delivery. Developer source/build instructions are in [DEVELOPMENT.md](DEVELOPMENT.md).

## Manual installation

This route performs the same operations separately, for people who want to understand each step. Do not bypass missing public-runtime pins.

1. Install Node and the official REPENTOGON launcher yourself. Launch the correct game once, then close it.
2. Copy `.env.example` to `.env` only if it does not already exist. Set `ISAAC_GAME_DIRECTORY`, `ISAAC_MOD_DIRECTORY`, `REPENTOGON_DIRECTORY`, and `ISAAC_LOG_FILE` to your actual paths.
3. Run `npm ci --omit=dev`. This downloads production dependencies using the lockfile.
4. Enter the Nebius key privately in `.env`. Choose `IMAGE_BACKEND=placeholder` initially.
5. Install the pinned custom native runtime using `node scripts/setup/cli.mjs install --accept-runtime-change`; this intentionally still uses the guarded native installer. If you have an externally built runtime, consult the source overlay guide before using `--skip-runtime`. Never copy your entire game or extracted game assets into a release.
6. If syncing the mod manually, stop Isaac and the bridge, run `npm run mod:sync` from a source checkout, then `npm run art:prepare`. The packaged ZIP uses setup for syncing. Restart Isaac after Lua, XML, or artwork-slot preparation changes.
7. Run doctor, then start the bridge and follow the first-item walkthrough in the README.

## Optional generated art

Placeholder mode uses the bundled icon and requires no image service. The item model still generates real mechanics and still requires the Nebius key.

For generated artwork, install ComfyUI following its official instructions. Download `sd_xl_turbo_1.0_fp16.safetensors` into `ComfyUI/models/checkpoints` from a trusted model source, following its license. Start ComfyUI and wait for its server to be ready. Configure:

```dotenv
IMAGE_BACKEND=comfyui
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=sd_xl_turbo_1.0_fp16.safetensors
```

Doctor checks service reachability and that ComfyUI advertises that checkpoint. Hardware requirements, GPU support, and model download time depend on your ComfyUI installation; no minimum GPU is promised here.

Hosted art remains an advanced option: set `IMAGE_BACKEND=nebius` and `NEBIUS_IMAGE_MODEL` to an available model supported by the image endpoint. Model availability and pricing are account-dependent.

## Updates, uninstall, and rollback

1. Close Isaac and the bridge. Extract the next release to a new folder.
2. Copy `.env` privately into it. Keep `ISAAC_MOD_DIRECTORY` pointing at the same installed folder.
3. Run setup again. Identical native files are not reinstalled. Lua/XML updates use a fixed allowlist; generated art, reservations and saves are not replaced.
4. Keep `%LOCALAPPDATA%\tboi-agent` and the receipt it prints. They survive replacement of the extracted ZIP.

Uninstall preserves the complete mod by moving it outside `mods` on the same drive:

```powershell
.\uninstall.ps1 --dry-run
.\uninstall.ps1 --yes
```

Native restoration is separate:

```powershell
npm run rollback -- --dry-run
npm run rollback -- --yes
```

The latest setup-owned backup is selected. Use `--backup "full path printed in receipt"` for an older backup. Rollback verifies backup hashes and refuses to clobber native files changed since installation. It never restores or removes game saves.
