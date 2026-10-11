# Passive Item Runtime Demo

This is the Isaac/REPENTOGON runtime for the first vertical slice. It has one
predeclared collectible, **Live Profile Core**. Its ID is registered when Isaac
starts; generated profiles only change its approved stats, rules, tear tint,
and artwork while the run is active.

## Native IPC test flow

1. Copy this directory to Isaac's `mods/live_sprite_swap_demo` directory and
   set `ISAAC_MOD_DIRECTORY` in the repository `.env` to that installed
   directory. Start the game through REPENTOGON.
2. Before launching Isaac after a fresh install, predeclare native artwork
   slots once:

   ```powershell
   npm run art:prepare
   ```

3. Start a run. Do not use `agent generate`; the legacy ImGui prompt is not
   part of this path.
4. From this repository in a terminal, start the local bridge and leave it
   running:

   ```powershell
   npm run bridge
   ```

   Start ComfyUI separately at `http://127.0.0.1:8188`. Place the configured
   `COMFYUI_CHECKPOINT` file in its `models/checkpoints` folder before using
   generated art.

5. Press top-row `8` (or keypad `8`) in the run to open the fixed prompt window.
   Enter a passive-item prompt and click **Generate Item**. The window closes
   on submission to release ImGui's game pause. Duplicate clicks are ignored
   while that request is pending. Reopening shows live IPC progress even while
   paused; use **Close** to resume gameplay and apply a ready profile.

   The CLI fallback remains available in a second terminal:

   ```powershell
   npm run ipc:generate -- --prompt "A cursed iron nail that poisons enemies and grants a small damage bonus"
   ```

6. The bridge publishes one bounded JSON profile through the named pipe. The
   mod validates it again, updates the `Live Profile Core` profile, spawns its
   pedestal, applies the fixed passive handlers, then queues its acknowledgement.
   Expect `PROFILE ACCEPTED: <name>; pedestal spawned; ACK queued` in-game and
   `Native IPC acknowledgement: <job-id>` in the bridge terminal.

The game mod never reads bridge status files or `include()`s generated Lua.
Every received envelope and profile is bounded and validated by fixed Lua before
application. Artwork paths are restricted to a predeclared bridge-generated
slot pattern so Isaac can discover them at startup, then rendered natively over
the generated pedestal once loaded.

Artwork uses a new texture filename for each generation to avoid Isaac's texture
cache, selected sequentially from 64 predeclared slots. Restart **both Isaac and
the bridge together** before resetting the slot counter or after exhausting it;
restarting only the bridge can reuse a cached texture. Border-connected white background pixels are removed and the object is
fitted into a transparent 32x32 icon. Complex backgrounds may still need better
art direction. The prior item remains published if artwork generation fails.

## Supported runtime behavior

- Stat deltas: damage, tears, range, luck, shot speed, and movement speed.
- Native tear tint/scale plus up to three allowed tear flags.
- Triggers: room enter/clear, enemy hit, player hurt, pickup, new floor, and
  tear fire.
- Conditions: chance, once per room, once per floor.
- Actions: spawn one allowed pickup or grant soul hearts.

The runtime does not execute model-produced Lua. It accepts declarative JSON
from the native bridge and maps it only through fixed handlers.

## Existing visual profiles

`agent switch 1`, `agent switch 2`, and `agent switch 3` still select the
Ember, Verdant, and Void test profiles. A native profile replaces the generated
slot when its envelope is accepted.

## Phase 2E/2F release verification

The automated suite executes the product Lua with mocked game/native bindings;
it does not prove that the custom engine's native ImGui implementation is crash-free.
The replacement prompt has passed its initial live game test. `UI_CALL_BEGIN`
/ `UI_CALL_OK` log markers remain available to identify any future native UI
regression. No DLL changes are needed for this UI build.

- Disable the Stage 1/2A/2B probes; enable only the product mod for this test.
- Restart Isaac and the bridge, press or hold `8`, close/reopen the window, and
  confirm one window is created without a crash.
- Try an empty prompt; it must not submit. Submit a real prompt and double-click
  Generate; the bridge must receive exactly one request ID.
- Verify matching `PROFILE_ACCEPTED`, `NATIVE_ART_READY`, and bridge ACK markers.
- Collect the pedestal and check actual generated JSON values, not just the
  original prompt: stat deltas, tear color/scale/flags, soul-heart half-units,
  and a room-clear pickup rule. Test a second generation in the same session;
  its image slot must differ and its art must update.
- The runtime has one shared generated profile, not independent generated item
  IDs. A second acceptance replaces the profile for existing cores/pedestals.
- With the image service unavailable, verify the prior profile stays unchanged
  and the new request reports an error. Restore the service and retry.

Passing `npm test` plus this live acceptance is the release gate. Save/continue
persistence and configurable hotkeys are outside this slice.
