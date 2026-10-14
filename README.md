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
   first multi-item run. The same prepare/restart step now predeclares paired
   familiar textures for the bounded familiar capability.

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

The generator window also has a **Randomize** button. Most clicks fill a
plain sentence about stats, tears, or a room reward. Review or change it,
then choose **Generate Item**. The model chooses one region from the meaning
of that sentence: a normal passive, a familiar, an aura, or both. A familiar
or an aura is kept only for the region the model chose.

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
- Explicit stat deltas when the item changes Isaac. A later catalog makes
  this optional: an item that only procs, follows, or pulses an aura sets
  `affects_stats` to false and carries no stat block.
- A bounded declarative behavior profile: triggers, conditions, actions,
  parameters, and runtime state.
- A 32x32 pedestal/inventory/HUD icon.
- A native tinted tear profile with bounded flags.
- Optionally, one bounded familiar with its own ComfyUI-generated full-body
  character sprite, rendered at 8x8 in-game. `sentry` orbits and fires,
  `normal` follows behind Isaac and fires, `melee` closes in and strikes, and
  `shield` stands between Isaac and the nearest threat. A shield removes enemy
  shots that touch it, cancels one hit to Isaac per cooldown, and deals
  contact damage. Sentry and normal familiars require an attack profile:
  `single`, `fan`, `lob`, or `varied`, up to three tear flags, plus color,
  scale (0.5–2), and speed (4–12). Those flags are the shot's only effects.
  `varied` rerolls delivery and size from that same flag list. `familiar.damage`
  is one single shot (0.5–3); each fan shot is 0.7× and a lob is 1.25×. Melee
  and shield familiars omit the attack. An item may also include one bounded
  damage aura.
- Pedestal art is drawn once, floating above the pedestal. The pedestal sprite
  itself keeps the default pedestal graphic.
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

This catalog is intentionally extensible. A new trigger is a versioned catalog
entry with a fixed handler, tests, bounds, and a fallback. It is not a new
phrase the model is allowed to invent.

## Generation flow

1. The terminal command, or the in-game prompt through Isaac's local log,
   supplies the player's item request to the local bridge.
2. The Node.js bridge sends the constrained request and JSON schema
   to a Nebius-hosted structured-output model.
3. The bridge validates and clamps the profile against the local capability
   catalog.
4. The bridge requests the pedestal image and, when requested, a separate
   familiar sprite from ComfyUI; both use paired fixed 32x32 runtime slots.
5. The bridge publishes the profile over `\\\\.\\pipe\\nebius_isaac_bridge_v1`.
6. The Isaac mod validates it again, updates that slot's texture and the
   fixed behavior handlers, spawns a pedestal, and acknowledges only after
   application succeeds.

## Architecture

- **Isaac + REPENTOGON:** in-game prompt, native IPC binding, pre-allocated
  item shell, native visual presentation, and fixed Lua callback mappings.
- **Local bridge (Node.js):** Token Factory client, schema validation,
  asset processing, slot allocation, and fallback handling.
- **Nebius Token Factory:** structured item-profile generation.
- **ComfyUI:** local source-art generation from the item visual prompt.

The live mod pre-registers 64 passive shells and keeps an independent accepted
profile on each one. It does not create item definitions at runtime, and it
does not execute generated code.

## Safety and fallbacks

- Profiles are schema-validated and all numeric parameters are clamped.
- The bridge accepts only known trigger, condition, action, stat, and
  tear-effect IDs.
- The offline validation path falls back to the demo shell icon; production
  image requests leave the previous icon intact when they fail.
- A malformed profile falls back to a named visual item with neutral stats and
  no behavior rule.
- Slot and transient state are cleared on run start and exit.

## How an item is built

The model decides what the wish is, then fills only the parameters that
decision needs. It never writes Lua, callback names, or raw game constants.

1. **Region.** `passive`, `familiar`, `aura`, or `familiar_aura`, from the
   meaning of the prompt. This step is live.
2. **Systems.** A short list of catalog systems the item actually uses, such
   as `stats`, `tears`, `rules`, `familiar`, `aura`, `collision`, or
   `on_hit`. A system the wish does not need is left off. The bridge drops any
   parameter block that does not belong to a marked system, the same way a
   passive region drops a familiar.
3. **Parameters.** Only the marked systems are filled, inside the bounds in
   `content-contract/capabilities.json`.

`affects_stats` is its own flag. False means the item does not change damage,
tears, shot speed, range, speed, or luck, so it has no `stats` object. A soul
heart on room clear stays a rule action, not a cache stat. Today every profile
still carries a full stat block; the next catalog version makes that block
optional.

## Callbacks, added without a per-frame tax

Each Isaac callback is registered once, when the mod loads. The model does not
name `ModCallbacks`, and accepting an item does not call `AddCallback`. A
handler that no owned item opted into returns before it touches entities.

When a profile is accepted, picked up, removed, or a run starts, the mod
rebuilds a short list per system. `MC_EVALUATE_CACHE` walks only items with
`affects_stats`, and only the cache flags those stats use (`CACHE_DAMAGE`,
`CACHE_FIREDELAY`, `CACHE_SPEED`, `CACHE_SHOTSPEED`, `CACHE_RANGE`,
`CACHE_LUCK`, `CACHE_TEARFLAG`). Gaining, losing, or changing such an item
calls `player:EvaluateItems()`. Stat math never runs from `MC_POST_UPDATE` or
`MC_POST_PLAYER_UPDATE`.

Frame work stays on the lists that need it. Familiar movement, aura ticks, and
projectile scans run for items on those lists. Tear changes run from
`MC_POST_FIRE_TEAR` for items that marked `tears`. An empty list is the entire
hot-path cost.

New handlers follow the same lifecycle, implemented in the mod rather than
generated:

- **Init.** `MC_POST_[ENTITY]_INIT` sets `GetData()`, scale, and starting
  velocity.
- **Tick.** `MC_POST_[ENTITY]_UPDATE` runs only while `entity:Exists()` and the
  entity is not dying. Convert with `ToPlayer`, `ToTear`, `ToNPC`, or
  `ToFamiliar` before using type-specific methods.
- **Cleanup.** `MC_POST_ENTITY_KILL` or `MC_POST_ENTITY_REMOVE` clears child
  entities and effects stored on that entity.
- **Collision.** `MC_PRE_[ENTITY]_COLLISION` returns `nil` or `true` to allow
  the hit and `false` to ignore it.
- **Damage.** `MC_ENTITY_TAKE_DMG` handles on-hit, reflection, and one-shot
  protection after `DamageFlags` and `DamageSource` are checked.
- **Tears.** `MC_POST_FIRE_TEAR` stores custom fields on `tear:GetData()`.
  Impacts and status effects are read later from `MC_PRE_TEAR_COLLISION` or
  `MC_POST_TEAR_UPDATE`.
- **Actives, later.** `MC_USE_ITEM` returns a discharge table such as
  `{ Discharge = true, Remove = false, ShowAnim = true }`. `MC_PRE_USE_ITEM`
  can refuse the use before charge is spent.

Custom state lives on `entity:GetData()` or the item's saved runtime record.
It does not live in an untracked global that survives a room change.

A system ships in four places: a catalog id, schema and numeric bounds, one
fixed handler, and tests. An unknown system is rejected.

## Roadmap

Each new effect is still a versioned catalog system. Unsupported fields are
rejected rather than interpreted.

1. **Optional stats and a system index.** Add `affects_stats`, let the model
   mark systems, and make every live callback consult that index before doing
   work.
2. **Tear and combat systems.** Add bounded tear-impact, status, homing, and
   on-hit families. Each one is a catalog id plus the lifecycle handler above,
   not a new tear flag invented in the prompt.
3. **Richer rule parameters.** Expand actions with cooldown, duration, stack
   limit, pickup subtype, and an effect ledger so overlapping items clean up
   when the source item is gone.
4. **More passive families.** Enemy debuffs, temporary auras, projectile
   modifiers, damage retaliation, and resource conversion, each with the same
   four-part contract.
5. **Presentation.** Art direction, approved sound and animation catalogs,
   in-game profile details, a configurable `8` hotkey, and clearer generation
   errors.
6. **Reliability and balance.** Fuzzed envelopes, deterministic fixtures,
   balance budgets, and REPENTOGON compatibility checks.
7. **Active collectibles.** Only after the passive systems stay idle when
   unused. An active needs its own charge, input, targeting, and
   `MC_USE_ITEM` contract. It is not another passive rule.

## Existing design references

[prompts/item.md](prompts/item.md) contains the current item-design draft and
will be migrated into the machine-readable capability catalog and schema as
implementation begins.
