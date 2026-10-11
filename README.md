# Nebius Isaac Item Generator

## Native runtime

The current product path uses a bounded native IPC channel between the local
Node bridge and REPENTOGON. The native binding exposes only
`NebiusBridge.Poll()` and `NebiusBridge.Ack(id)` to Lua; pipe I/O happens on a
background worker, so a game update never waits on it. The isolated Stage 1
renderer notes remain in [native/README.md](native/README.md).

## Current scope

This project generates **passive collectibles** for *The Binding of Isaac:
Repentance+* during a run. A player describes an item, and the local bridge
uses Nebius Token Factory to produce a validated item profile and its visual
assets. The mod assigns the accepted result to a pre-allocated item slot,
without requiring a game restart.

The current release deliberately covers passives only. A generated result is
declarative data, never model-produced Lua, and is applied only by fixed,
tested Lua handlers.

## Run the first slice

1. Copy [.env.example](.env.example) to `.env` and set `NEBIUS_API_KEY`.
   Set `ISAAC_MOD_DIRECTORY` to your installed `live_sprite_swap_demo` mod
   directory so generated files reach the copy Isaac is running.
2. Install dependencies with `npm install`.
3. Start the local bridge and leave this terminal running:

   ```powershell
   npm run bridge
   ```

   For local art generation, install and start ComfyUI at `http://127.0.0.1:8188`,
   then download `sd_xl_turbo_1.0_fp16.safetensors` into
   `ComfyUI/models/checkpoints`. Set the same filename in
   `COMFYUI_CHECKPOINT` in `.env`. The project defaults to this local backend;
   no image API key is required.

4. Enable only the **Live Sprite Swap Demo** mod in Isaac, start a run, and
   press top-row or keypad `8`. Enter a passive-item prompt in **Nebius Passive
   Item Generator**, then select **Generate Item**. The prompt writes a fixed
   JSON request to Isaac's log; the bridge delivers the validated result back
   through native IPC and spawns one of 64 independent generated collectibles.

   Before the first native-art run, execute `npm run art:prepare`, then restart
   Isaac. This predeclares 64 texture filenames that Isaac can discover at
   startup. Install the v1.6.1 mod files and fully restart Isaac before the
   first multi-item run. Begin a fresh run when upgrading from v1.5.0.

`npm run ipc:generate -- --prompt "..."` is the terminal fallback; keep the
bridge running and a run open so it can reserve artwork safely.

Use `npm run validate` for an offline fixture validation; it does not call
Token Factory or overwrite installed artwork.

## Run persistence and capacity (v1.6.1)

Each run supports 64 independent generated item IDs and up to 64 artwork slots.
Profiles and rule state are saved with the mod's run data, including on save
and exit. Continue restores both owned items and uncollected pedestals by their
collectible IDs. Artwork stays in the installed mod directory. There is no
permanent item library.

The generator window also has a **Randomize** button. It fills the editable
prompt with a bounded passive-item idea; review or change it, then choose
**Generate Item** normally.

When `IMAGE_BACKEND=comfyui`, the bridge now checks that ComfyUI is reachable
before asking the text model to design an item. Start ComfyUI and wait until it
reports that its server is running at `http://127.0.0.1:8188`; otherwise the
generator returns an actionable error before a text-generation request.
The current bridge reserves an artwork slot before starting the generator, so
even a failed preflight conservatively consumes that session's reservation.

Generation stops with a clear error at either limit; it never wraps around or
replaces an existing item. A new run frees item IDs. Artwork already used by
the current Isaac process stays reserved until Isaac restarts, at which point
continued-run artwork remains pinned. Failed generations conservatively consume
an artwork reservation. Restarting only the bridge does not free any slots.
Do not delete `art-reservations.json`, saved mod data, or generated PNGs to
bypass the limit. This initial implementation targets one active save slot;
switching between separate Isaac save slots with continuable generated runs
is not supported yet.

Stats stack across owned items; tear flags combine, tear scale is clamped to
0.5–2, and the most recently generated owned item's tint wins. Rule limits are
independent per item and player. Missing or invalid run data blocks generation
instead of assigning new profiles to existing collectibles.

## A generated passive item

Every accepted item resolves the following before it is applied:

- Name, short pickup description, quality, and theme.
- Explicit stat deltas: up, down, or unchanged for each supported stat.
- A bounded declarative behavior profile: triggers, conditions, actions,
  parameters, and runtime state.
- A 32x32 pedestal/inventory/HUD icon.
- A native tinted tear profile with bounded flags.
- A catalog-backed proc sound.

Generated content is data, not executable model-produced Lua. Lua maps only
known profile entries to fixed Isaac callbacks.

## Initial mechanics catalog

The first vertical slice supports a deliberately small set of item triggers:

- `room_enter`
- `room_clear`
- `enemy_hit`
- `player_hurt`
- `pickup`
- `new_floor`
- `tear_fire`

The model may combine those only with whitelisted conditions and actions. It
cannot invent callbacks, unbounded state, or arbitrary Lua. Runtime state is
owned by the mod and scoped to an item, room, floor, or run (for example, a
"once per room" proc or a cooldown).

This catalog is intentionally extensible. After the passive slice is stable,
we will add triggers through a versioned capability catalog and their matching
Lua callback mappings, tests, parameter bounds, and fallbacks. Adding a
trigger is therefore a controlled runtime feature, not simply a new phrase in
an AI prompt.

## Generation flow

1. The terminal command, or the in-game prompt through Isaac's local log,
   supplies the player's item request to the local bridge.
2. The Node.js bridge sends the constrained request and JSON schema
   to a Nebius-hosted structured-output model.
3. The bridge validates and clamps the profile against the local capability
   catalog.
4. The bridge requests the pedestal image, resizes it to the fixed 32x32
   runtime template, and writes it with the generated profile.
5. The bridge publishes the profile over `\\\\.\\pipe\\nebius_isaac_bridge_v1`.
6. The Isaac mod validates it again, updates the Live Profile Core texture and
   fixed behavior handlers, spawns a pedestal, and acknowledges only after
   application succeeds.

## Architecture

- **Isaac + REPENTOGON:** in-game prompt, native IPC binding, pre-allocated
  item shell, native visual presentation, and fixed Lua callback mappings.
- **Local bridge (Node.js):** Token Factory client, schema validation,
  asset processing, slot allocation, and fallback handling.
- **Nebius Token Factory:** structured item-profile generation.
- **ComfyUI:** local source-art generation from the item visual prompt.

The present vertical slice has one shared generated shell, **Live Profile
Core**. A later multi-item release will pre-register a bounded pool of item
shells and retain an independent accepted profile per shell; it will not create
runtime item definitions or execute generated code.

## Safety and fallbacks

- Profiles are schema-validated and all numeric parameters are clamped.
- The bridge accepts only known trigger, condition, action, stat, and
  tear-effect IDs.
- The offline validation path falls back to the demo shell icon; production
  image requests leave the previous icon intact when they fail.
- A malformed profile falls back to a named visual item with neutral stats and
  no behavior rule.
- Slot and transient state are cleared on run start and exit.

## Roadmap: more passive items, effects, and parameters

The next phase is a versioned **capability catalog**, not unconstrained model
freedom. Each new effect is added in four places: a schema entry, bridge-side
validation and numeric bounds, a fixed Lua handler, and automated plus live
game coverage. Unsupported fields are rejected rather than interpreted.

1. **Multiple generated collectibles.** Replace the single shared shell with a
   bounded pool of predeclared passive shells, profile ownership per shell,
   stable artwork-slot allocation, and clear run/save lifecycle rules.
2. **Broader stat and tear profile.** Add carefully bounded fields for familiar
   passive stats (for example, flying, spectral tears, knockback, tear height,
   projectile speed and scale) plus an explicit allowlist of additional
   `TearFlags`. Every boolean flag remains a known catalog ID, not a raw game
   constant supplied by the model.
3. **Richer rule parameters.** Expand existing actions with bounds such as
   chance, cooldown, duration, stack limit, pickup subtype, spawn count, and
   per-room/per-floor/run scopes. Add a fixed effect ledger so overlapping
   generated items compose predictably and clean up correctly.
4. **Additional passive effect families.** Implement controlled families such
   as familiar spawning, orbitals, enemy debuffs, temporary auras, projectile
   modifiers, room-clear rewards, damage retaliation, and resource conversion.
   Each family receives a small declarative contract and fixed callbacks.
5. **Presentation and player control.** Improve art direction, add optional
   approved sound/animation catalogs, show accepted profile details in-game,
   make the `8` hotkey configurable, and expose clear generation/error status.
6. **Reliability and balance.** Add fuzzed malformed-envelope tests, save and
   continue behavior, slot exhaustion recovery, deterministic replay fixtures,
   balance budgets, and compatibility checks for REPENTOGON upgrades.
7. **Future scope decision.** Consider active collectibles only after the
   multi-item passive catalog is stable. They require their own explicit input,
   charge, targeting, and safety contracts rather than extending passive rules.

## Existing design references

[prompts/item.md](prompts/item.md) contains the current item-design draft and
will be migrated into the machine-readable capability catalog and schema as
implementation begins.
