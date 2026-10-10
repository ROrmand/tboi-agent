# Nebius Isaac Item Generator

## Native runtime spike

The isolated Stage 1 probe and acceptance steps are in [native/README.md](native/README.md).
It creates a live 32x32 procedural image through REPENTOGON's native renderer
bindings. It does not replace the existing bridge, repair its inbound handoff,
or modify installed engine DLLs. In-game verification is required before the
native milestone is accepted.

## Current scope

This project generates **passive collectibles** for *The Binding of Isaac:
Repentance+* during a run. A player describes an item, and the local bridge
uses Nebius Token Factory to produce a validated item profile and its visual
assets. The mod assigns the accepted result to a pre-allocated item slot,
without requiring a game restart.

The first release deliberately covers passives only. Active collectibles are
the next scope once passive generation, validation, and hot-swapping are
reliable.

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

4. In Isaac, with the demo mod installed, collect **Live Profile Core** and
   enter `agent generate` in the in-game console. The native prompt window
   sends the request to the local bridge through Isaac's log (the mod sandbox
   cannot open network sockets) and automatically loads the completed item.

`npm run generate -- --prompt "..."` remains available as a terminal fallback.

Use `npm run validate` for an offline fixture profile and placeholder icon; it
does not call Token Factory.

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
5. The Isaac mod hot-swaps the slot's texture and applies its validated stats
   and rule profile.

## Architecture

- **Isaac + REPENTOGON:** in-game overlay, pre-allocated item shells, and
  fixed Lua callback mappings.
- **Local bridge (Node.js):** Token Factory client, schema validation,
  asset processing, slot allocation, and fallback handling.
- **Nebius Token Factory:** structured item-profile generation.
- **ComfyUI:** local source-art generation from the item visual prompt.

The mod pre-registers generic `Dynamic_Item_1` through `Dynamic_Item_20`
definitions at startup. During a run it only changes data and graphics within
those slots, using `Sprite:ReplaceSpritesheet()` and `Sprite:LoadGraphics()`.

## Safety and fallbacks

- Profiles are schema-validated and all numeric parameters are clamped.
- The bridge accepts only known trigger, condition, action, stat, and
  tear-effect IDs.
- The offline validation path falls back to the demo shell icon; production
  image requests leave the previous icon intact when they fail.
- A malformed profile falls back to a named visual item with neutral stats and
  no behavior rule.
- Slot and transient state are cleared on run start and exit.

## Roadmap

1. Test generated profiles in Isaac, including malformed payloads and asset
   failures.
2. Add custom tear sheets and generated audio after the passive core is stable.
3. Test state cleanup and slot reuse.
4. Expand the passive trigger catalog.
5. Add active collectibles after the passive system is proven.

## Existing design references

[prompts/item.md](prompts/item.md) contains the current item-design draft and
will be migrated into the machine-readable capability catalog and schema as
implementation begins.
