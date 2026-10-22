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

The implementation also includes the blank **AI Item** and **The Creator** character.
Active collectibles are implemented and covered by tests, but generation is vaulted:
the creator and bridge accept passives only. These additions still
require the live-game acceptance checks in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
A generated result is declarative data, never model-produced Lua, and is applied
only by fixed Lua handlers.

## Run the first slice

1. Copy [.env.example](.env.example) to `.env` and set `NEBIUS_API_KEY`.
   Set `ISAAC_MOD_DIRECTORY` to your installed `live_sprite_swap_demo` mod
   directory so generated files reach the copy Isaac is running. `npm run bridge`
   copies the repository Lua and XML into that directory. Restart Isaac after
   those files change; the running game keeps the Lua it loaded at startup.
2. Install dependencies with `npm install`.
3. Start the local bridge and leave this terminal running:

   ```powershell
   npm run bridge
   ```

   Run only one bridge at a time. If it is already running, the command
   reports its address and exits; the existing bridge remains available.

   For local art generation, install and start ComfyUI at `http://127.0.0.1:8188`,
   then download `sd_xl_turbo_1.0_fp16.safetensors` into
   `ComfyUI/models/checkpoints`. Set the same filename in
   `COMFYUI_CHECKPOINT` in `.env`. The project defaults to this local backend;
   no image API key is required.

4. Enable only the **Live Sprite Swap Demo** mod in Isaac, start a run, and
   press top-row or keypad `8`. Enter a passive-item prompt in the fixed
   **Nebius Item Creator**, choose quality **0** through **4**, then select **Generate Item**. While the creator is
   open, room updates pause without opening Isaac's pause menu. The panel is
   drawn in the game view and keeps its prompt, Randomize, Generate, Close,
   and status controls visible together. The game HUD is hidden while it is
   open. Use Down to select the button row, Left/Right to choose a button, and
   Enter to activate it; Up returns focus to the prompt.    Type with the keyboard, use Backspace
   to edit, Ctrl+C / Ctrl+V to copy or paste, Escape to close, and click the buttons with
   the mouse. Space inserts a space. Enter in the prompt inserts a new line. The prompt
   writes a fixed JSON request to Isaac's log; the bridge delivers the validated result back
   through native IPC and spawns one of 64 independent generated collectibles.

   Before the first native-art run, execute `npm run art:prepare`, then restart
   Isaac. This predeclares 64 pedestal textures, 64 familiar portraits, and 64
   familiar animation files that Isaac can discover at startup. Fully restart
   Isaac after preparing those files. The animation files are blank until a
   familiar is generated.

`npm run ipc:generate -- --prompt "..."` is the terminal fallback; keep the
bridge running and a run open so it can reserve artwork safely.

Use `npm run validate` for an offline fixture validation; it does not call
Token Factory or overwrite installed artwork.

## Run persistence and capacity

Each run supports 64 independent generated item IDs and up to 64 artwork slots.
Profiles and rule state are saved with the mod's run data, including on save
and exit. Continue restores both owned items and uncollected pedestals by their
collectible IDs. Artwork stays in the installed mod directory. There is no
permanent item library.

The creator window also has a **Randomize** button. By default it fills the prompt
with one local sentence built from word lists in `bridge/words/`
(adjectives, nouns, verbs, adverbs, prepositions, and places). Set
`INSPIRATION_BACKEND=local` and `INSPIRATION_MODEL` to use an already installed
OpenAI-compatible local text model instead. The default request budget is 2.5 seconds;
timeouts, invalid output, and repeated ideas fall back to word lists. No model
download is required, and Randomize does not reserve item or artwork slots.
Review or change the idea, then choose **Generate Item**. The item model
chooses the region and the systems from that sentence. Sparse prompts stay
flavor for the player. A fast
catalog planner (`NEBIUS_PLANNER_MODEL`, default
`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) chooses supported mechanics before
`NEBIUS_TEXT_MODEL` writes the item JSON. If that planner fails, expansion
uses a bounded local design brief instead.

After submission, the creator closes and a lower-left animated indicator shows
bridge progress while the run resumes. A failed request reopens the creator
with the prompt preserved. Generation and UI failures are written as JSON lines
by default to `runtime/generated/generation-errors.jsonl` with a timestamp, request ID,
phase, category, and diagnostic detail. Each finished item or sentence request
also appends one line to `runtime/generated/generation-timings.jsonl`: total
duration, outcome, quality, and milliseconds spent in each stage (`startup`,
`expand`, `text`, `repair`, `image`, `art`, `familiar_art`, `familiar_anim`,
`publish`, `deliver`). Repeated stages stay in order and are summed, so a slow
text call or artwork poll is visible without rerunning the request. Restart
Isaac after updating the mod's Lua files.

When `IMAGE_BACKEND=comfyui`, the bridge now checks that ComfyUI is reachable
before asking the text model to design an item. Start ComfyUI and wait until it
reports that its server is running at `http://127.0.0.1:8188`; otherwise the
generator returns an actionable error before a text-generation request.
Runtime compatibility and ComfyUI health checks happen before reserving artwork.
After reservation, failures conservatively retain the slot because artwork may
already have been written or loaded.

Generation stops with a clear error at either limit; it never wraps around or
replaces an existing item. A new run frees item IDs. Artwork already used by
the current Isaac process stays reserved until Isaac restarts, at which point
continued-run artwork remains pinned. Failed generations conservatively consume
an artwork reservation. Restarting only the bridge does not free any slots.
Do not delete `art-reservations.json`, saved mod data, or generated PNGs to
bypass the limit. The reservation ledger protects the union of continuable runs
across all three save slots as well as artwork loaded by the current game process.
The 64 artwork files are shared, not 64 new files per save. Missing or corrupt
initialized manifests fail closed. Cross-save behavior still needs live acceptance.

Stats stack across owned items; tear flags combine, tear scale is clamped to
0.5–2, and the most recently generated owned item's tint wins. Rule limits are
independent per item and player. Missing or invalid run data blocks generation
instead of assigning new profiles to existing collectibles.

## A generated passive item

Every accepted item resolves the following before it is applied:

- The model's name, one sentence describing the effect, quality, and theme.
  The pedestal and pickup banner show that name and sentence.
- Stat deltas only when the item marks the `stats` system. `affects_stats`
  is false otherwise, and that item is left out of `MC_EVALUATE_CACHE`. A
  soul heart on room clear stays a rule, not a cache stat.
- A bounded declarative behavior profile: triggers, conditions, actions,
  parameters, and runtime state.
- A 32x32 pedestal/inventory/HUD icon.
- A native tinted tear profile with bounded flags.
- Optionally, one bounded familiar with its own ComfyUI portrait and an
  8-frame animation sheet. The familiar plays that sheet from one of 64
  predeclared animation files: Float, Spin, Hop, or Idle. `sentry` orbits and fires like
  Sacrificial Dagger, `normal` follows behind Isaac like Brother Bobby,
  `melee` chases like a Leech, and `shield` orbits like Dry Baby. A shield removes enemy
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

## Implemented mechanics catalog

The fixed rule handlers support these triggers:

- `room_enter`
- `room_clear`
- `enemy_hit`
- `player_hurt`
- `pickup`
- `new_floor`
- `tear_fire`
- `bomb_explode`
- `active_use`
- `pill_use`
- `card_use`
- `boss_kill`
- `player_death`

The catalog also includes `on_kill`, `tear_impact`, and `collision` procs;
familiars and auras; and bounded `tear_update`, bomb, laser, and knife systems.
Those systems have handlers, but their effects are limited to the parameters
in `content-contract/capabilities.json`. Distinct combat actions include a bounded
damage burst on kill, hurt, or contact; slow, burn, fear, poison, charm,
confusion, and freeze on the catalog's status triggers; contact retaliation;
and confirmed-player-hurt retaliation, including nearby retaliation on hurt
and contact. Temporary stat grants cover damage, tears, luck, speed, range,
and shot speed. Legacy reward actions remain supported, along with extra
pickup subtypes, gold, rotten, and container hearts, dip and Minisaac
friendlies, creep, charge refill, charm/poison/confusion auras, bomb burn and
fear, spiral and accelerate tears, and an orbiting contact familiar. Costumes,
weapon replacement, and model-written Lua stay out of the catalog.
Rules and procs support bounded frame cooldowns; room-stat grants can declare
durations and stack limits, pickup actions can select approved subtypes, and
resource conversion atomically spends input before granting output. The model may
combine catalog entries only with whitelisted conditions and actions. It
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
4. The bridge requests the pedestal image and, when requested, a familiar
   portrait plus an 8-frame animation sheet from ComfyUI. Portraits use fixed
   32x32 slots. Each animation sheet is written into one of 64 predeclared
   animation files.
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

The live mod pre-registers 64 passive shells, the blank AI Item, and eight unused
active shells. A run can accept 64 generated passive profiles. Active generation
is vaulted.
The existing passive IDs stay unchanged. It does not create item definitions at runtime, and it
does not execute generated code.

## Safety and fallbacks

- Profiles are schema-validated and all numeric parameters are clamped.
- The bridge accepts only known trigger, condition, action, stat, and
  tear-effect IDs.
- The offline validation path falls back to the demo shell icon; production
  image requests leave the previous icon intact when they fail.
- Malformed production output receives one bounded correction attempt and then
  an actionable error; a neutral fallback is not reported as successful generation.
- Durable jobs distinguish queued publication from acknowledged application.
  Queued profiles recover after bridge restart; ambiguous interrupted model/art
  requests fail without blind replay. Saved Lua receipts prevent duplicate delivery.
- New runs clear their gameplay state, not artwork protected by other continuable
  saves or the current process. Saved-state version 3 explicitly reads version 2;
  the profile format remains version 1 and the runtime compatibility contract is 12.

## How an item is built

The model decides what the wish is, then fills only the parameters that
decision needs. It never writes Lua, callback names, or raw game constants.

1. **Region.** `passive`, `familiar`, `aura`, or `familiar_aura`, from the
   meaning of the prompt.
2. **Systems.** The catalog ids the wish actually needs:
   `stats`, `tears`, `rules`, `familiar`, `aura`, `on_hit`, `on_kill`,
   `tear_impact`, `collision`, `tear_update`, `bomb`, `laser`, and `knife`.
   The bridge drops a block the system list does not include, and it rejects
   a system with no matching block. `display_name` and `description` are each
   at most 64 UTF-8 bytes.
3. **Parameters.** Only the marked systems are filled, inside the bounds in
   `content-contract/capabilities.json`.

`rules` owns room enter, room clear, pickup, new floor, and tear fire.
`on_hit` owns player hurt and enemy hit. `on_kill`, `tear_impact`, and
`collision` are separate procs with the same conditions and actions. `region`
is removed before publish. `systems` and `affects_stats` are part of the
profile Isaac validates.

## Callbacks, added without a per-frame tax

Each Isaac callback is registered once, when the mod loads. The model does not
name `ModCallbacks`, and accepting an item does not call `AddCallback`. A
handler that no owned item opted into returns before it touches entities.

When a profile is accepted or a run starts, the mod rebuilds a short list per
system and per rule trigger. `MC_EVALUATE_CACHE` walks only items that marked
`stats`, and only for `CACHE_DAMAGE`, `CACHE_FIREDELAY`, `CACHE_SPEED`,
`CACHE_SHOTSPEED`, `CACHE_RANGE`, and `CACHE_LUCK`. Picking up such an item
calls `player:EvaluateItems()`. Stat math never runs from `MC_POST_UPDATE`.

Familiar movement and aura ticks run only for items on those lists. Tear tint
and flags run from `MC_POST_FIRE_TEAR` only for items that marked `tears`.
`MC_POST_ENTITY_KILL`, `MC_PRE_TEAR_COLLISION`, and `MC_PRE_PLAYER_COLLISION`
return immediately when no owned item marked `on_kill`, `tear_impact`, or
`collision`. Proc latches and cooldowns are scoped to each item/player and,
where appropriate, each tear/target. Generated damage is guarded against recursive
burst/retaliation chains. New kill combat effects use credited ownership; legacy
kill rewards retain their all-player semantics.

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
- **Actives.** `MC_USE_ITEM` returns a discharge table such as
  `{ Discharge = true, Remove = false, ShowAnim = true }`. `MC_PRE_USE_ITEM`
  can refuse the use before charge is spent.

Custom state lives on `entity:GetData()` or the item's saved runtime record.
It does not live in an untracked global that survives a room change.

A system ships in four places: a catalog id, schema and numeric bounds, one
fixed handler, and tests. An unknown system is rejected.

## Creator controls

- Press `8` (or keypad `8`) to open the creator. Type in the prompt like a normal
  text field, including Ctrl+C / Ctrl+V. A controller can use Map + Drop, menu
  directions, Confirm, and Back; on-screen keyboard entry is deferred for
  controller support. Generation is passive only.
- Use the console command `nebius hotkey KEY_F6` to save a different keyboard
  hotkey. `nebius replace on` / `nebius replace off` saves the optional Creator
  replacement setting outside run state.
- The Creator starts with an AI Item. Collecting a blank queues a player-owned
  entitlement and opens the editor when available. Successful generation exchanges
  one blank for the generated item; closing, cancellation, errors, and capacity
  exhaustion keep it. `nebius cancel` cancels a pending request.
- Replacement only applies while The Creator is present and the setting is on.
  Eligible passive/familiar pedestals preserve shop/choice data; actives, quest
  items, generated shells, and unsupported special pedestals are excluded.
- Active generation is vaulted. Tab no longer switches item type, and the bridge
  refuses an active request before it calls the model. The radial-burst handler
  remains in the mod for profiles already accepted.

## Implementation and release status

[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) records the implementation
checklist, automated evidence, and remaining live checks separately. All eight
milestones have implementation paths; this is not a claim of game acceptance.
The automated suite uses deterministic profiles, Lua engine mocks, local fake
model/art services, and durable restart/ACK fixtures. Run `npm test` and
`npm run validate` before syncing.

Generation progress uses readable stage labels and stable error codes. Profile
summaries derive from validated mechanics rather than trusting model-written
flavor. Presentation choices are limited to approved sounds and animations with
fallbacks. Local inspiration stays opt-in until latency and variety have been
measured with an installed model.

Before validation, known prompt phrases repair contact damage, hurt-nearby
retaliation, extra Mom's Knife damage, and explicit room-clear resource trades.
The active-shell repair remains for the vaulted code path. The creator does not
request it.
Unknown fields and catalog IDs are still rejected before these repairs. These
repairs affect newly generated items, not profiles already held in a run.

For game acceptance, deliberately sync with `npm run mod:sync`, prepare artwork
with `npm run art:prepare`, and fully restart Isaac and the bridge. Check co-op
attribution, source removal, shop and choice pickups, cancellation/continue,
save A -> save B -> continue A, and active charges in the actual game. Record the
Isaac/REPENTOGON build and results in the plan. Do not replace REPENTOGON binaries
or delete manifests as a recovery shortcut.

## Existing design references

[prompts/item.md](prompts/item.md) is an older design exploration, not the
implemented contract. Its 20-slot design, synergies, costumes, arbitrary active
effects, and generated Lua hooks are not product features. The current contract is
`content-contract/capabilities.json` plus the bridge and Lua validators.
