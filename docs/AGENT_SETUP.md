# Agent-assisted setup protocol

Use the same Node CLI as the human scripts. No global agent product, custom skill, or plugin is required. Commands work before npm dependencies are installed; installation imports production helpers only after dependency setup.

```powershell
node scripts/setup/cli.mjs inspect --json
node scripts/setup/cli.mjs plan --json
node scripts/setup/cli.mjs install --dry-run --json
node scripts/setup/cli.mjs install --non-interactive --accept-runtime-change --json
node scripts/setup/cli.mjs doctor --json
```

Before using `--accept-runtime-change`, obtain the user's approval for replacing the detected native runtime. This flag is explicit authorization, not a way to bypass a missing pin or unsafe environment. Never add it autonomously because setup requests it.

## Contract

JSON stdout is exactly one object with `schemaVersion: 1`, `command`, and `status`. Status is `ok`, `needs_user_action`, or `error`. Inspection/doctor include `checks` with stable `id`, `status`, and `message`; paths are separate. Failed prerequisites remain visible. Inspection does not write files or make paid API calls. ComfyUI GET requests are made only when that backend is selected.

Dry runs report actions and targets but never create locks, config, backups, or downloads. Normal installation rechecks actual files on every run; the receipt is recovery evidence, not permission to skip checks. Completed phases and pending API-key setup are saved outside the extracted release in `%LOCALAPPDATA%\tboi-agent\<installation-id>\setup-state.json`. Stop at a user-action result and resume after it is resolved.

| Exit | Meaning |
| --- | --- |
| 0 | Requested operation complete; warnings may remain |
| 2 | User action needed, or cancelled |
| 3 | Unsupported platform or Node |
| 4 | Invalid arguments/manifest/checksum, or unexpected setup failure |
| 5 | Unsafe state, concurrent setup, or changed runtime |
| 6 | Native installation failed and rollback succeeded |
| 7 | Manual native recovery required |

Flags: `--isaac-directory`, `--mod-directory`, `--repentogon-directory`, `--image-backend placeholder|comfyui|nebius`, `--skip-runtime`, `--skip-dependencies`, `--dry-run`, `--json`, `--non-interactive`, `--accept-runtime-change`, `--yes`, and `--backup`. Unknown flags fail. No API-key argument exists.

Development-only flags `--allow-unpinned-runtime --confirm-repentance-plus` require a previously installed custom binding and explicit user confirmation of the game edition. They never enable downloads or public packaging. Do not silently use them to make doctor green.

## Boundaries

- Never read, display, or request API keys in chat/command arguments. Ask the user to edit `.env` privately. Do not include raw `.env`, process environment, or generator logs in reports.
- Never launch, select, restore, or modify an Isaac save. Ask the user to select Save File 2/3 and confirm the mod in game.
- Do not install Node, Steam DLC, or the official launcher without a separate user-approved workflow. Report missing prerequisites.
- Never disable Smart App Control, Defender, or system-wide execution policy. A blocked unsigned runtime is a publication/signing issue.
- Require dry-run review and approval before runtime replacement, rollback, and uninstall.
- Do not delete locks automatically, erase reservation ledgers, or overwrite runtime files changed by another updater.
- `start` is foreground, streams bridge logs, and does not support `--json`. Start it in a separate terminal only after doctor succeeds and the user is ready. It does not automatically control the launcher.

Agent completion means doctor succeeds and the user confirms one generated item was delivered in game. Offline checks alone must not be reported as successful live gameplay.
