# Passive Item Runtime Demo

This is the Isaac/REPENTOGON runtime for the first vertical slice. It has one
predeclared collectible, **Live Profile Core**. Its ID is registered when Isaac
starts; generated profiles only change its approved stats, rules, tear tint,
and artwork while the run is active.

## Console-first test flow

1. Copy this directory to Isaac's `mods/live_sprite_swap_demo` directory and
   set `ISAAC_MOD_DIRECTORY` in the repository `.env` to that installed
   directory. Start the game through REPENTOGON.
2. Start a run and collect **Live Profile Core**, which spawns next to Isaac.
3. From this repository in a terminal, start the local bridge and leave it
   running:

   ```powershell
   npm run bridge
   ```

   Start ComfyUI separately at `http://127.0.0.1:8188`. Place the configured
   `COMFYUI_CHECKPOINT` file in its `models/checkpoints` folder before using
   generated art.

4. In Isaac's console, run:

   ```text
   agent generate
   ```

5. Describe the item in the native **Nebius Passive Item Generator** window,
   then press **Generate Item**. The mod writes the request to Isaac's log,
   polls the bridge status file, then loads
   `generated_profile.lua`, swaps the pedestal/HUD art, applies the item
   profile, and interprets its approved rules.

`agent generated` remains available to load an item generated through the
terminal fallback.

The window continues polling while the console pauses gameplay. It reports
design, validation retry, image generation, sprite preparation, and publication.
Each design gets at most one retry after invalid JSON or schema validation.
Network calls time out, and the bridge stops a job after 350 seconds. Keep the
bridge terminal open; restart it after bridge code changes, and fully restart
Isaac after Lua changes. Closing and reopening the prompt alone does not reload Lua.

Artwork uses a new texture filename for each generation to avoid Isaac's texture
cache. Border-connected white background pixels are removed and the object is
fitted into a transparent 32x32 icon. Complex backgrounds may still need better
art direction. The prior item remains published if artwork generation fails.

## Supported runtime behavior

- Stat deltas: damage, tears, range, luck, shot speed, and movement speed.
- Native tear tint/scale plus up to three allowed tear flags.
- Triggers: room enter/clear, enemy hit, player hurt, pickup, new floor, and
  tear fire.
- Conditions: chance, once per room, once per floor.
- Actions: spawn one allowed pickup or grant soul hearts.

The runtime does not execute model-produced Lua. It only loads a bridge-written
data table after the bridge has validated it.

## Existing visual profiles

`agent switch 1`, `agent switch 2`, and `agent switch 3` still select the
Ember, Verdant, and Void test profiles. `agent generated` selects the newest
validated bridge output instead.
