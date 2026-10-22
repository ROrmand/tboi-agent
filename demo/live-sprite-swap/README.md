# Passive Item Runtime — v1.13.2

The product mod remains **Live Sprite Swap Demo** in `mods/live_sprite_swap_demo`.
It now registers 64 independent passive shells, Generated Passive 00–63.
The pedestal and the pickup banner show the model's name and one sentence describing the effect.
All generated behavior remains validated JSON applied through fixed Lua handlers.

## Setup

1. Set `ISAAC_MOD_DIRECTORY` to the installed product mod. `npm run bridge`
   copies this directory's Lua and XML there. Restart Isaac to load them.
2. Leave `ISAAC_MOD_DIRECTORY` pointed at that installed directory.
3. Run `npm run art:prepare` before launching Isaac.
4. Start `npm run bridge` and your configured ComfyUI service.
5. Enable only the product mod; leave native probe mods disabled.
6. Start a fresh run when upgrading from v1.5.0 or from a familiar saved before
   v1.13.0. Press top-row or keypad
   `8`, enter a prompt, or click **Randomize**. Randomize fills the prompt
   with one local sentence from the bridge word lists. Review or
   edit it, then click Generate Item. Do not use `agent generate`.

The terminal fallback is `npm run ipc:generate -- --prompt "..."` with a run open.
Acceptance spawns a new collectible and saves its profile before queuing ACK.
The existing paired REPENTOGON DLLs require no changes.

## Persistence and limits

- Up to 64 generated item identities per run and paired pedestal/familiar
  artwork filenames. Familiar art is generated only for profiles that request
  a sentry, melee, normal, or shield familiar. ComfyUI paints an 8-frame strip,
  and the familiar plays the predeclared animation for that slot: Idle, Float,
  Hop, or Spin. `npm run art:prepare` writes all 64 animation files before
  Isaac starts. Movement uses the game's familiar helpers: Brother Bobby follow, Sacrificial
  Dagger orbit, Leech chase, and Dry Baby orbit. A shield blocks shots that
  touch it, cancels one hit per cooldown, and deals contact damage.
  Sentry and normal familiars fire the attack profile on that item: delivery,
  flags, color, scale, and speed. `varied` rerolls delivery using those flags.
  Pedestal art floats above
  the pedestal and is not also stamped onto the pedestal sprite.
- A second generation never changes an earlier item's stats, rules, or artwork.
- Save and exit retains profiles and rule state. Continue restores owned items
  and pedestal presentation from their collectible IDs. PNGs remain on disk.
- A fresh run releases item identities. Used textures remain reserved for the
  lifetime of the Isaac process, including textures used in previous runs.
- After Isaac restarts, artwork referenced by the continued run stays reserved;
  other slots can be reused. A full continued run remains full after restart.
- Failed generation may consume an artwork slot. Bridge reservations persist
  across bridge restarts. Exhaustion reports an error before model/image work.
- No permanent collection library is maintained. Do not manually clear artwork,
  mod save data, or art-reservations.json to bypass capacity.
- One Isaac save slot is supported for now; switching among multiple save slots
  containing continuable generated runs needs a separate ownership registry.
- Invalid or missing generated-item save data blocks generation. Old v1.5.0
  shared-core saves cannot be migrated automatically; begin a fresh run.

Stats add across owned items (including copies). Tear flags combine; combined
scale is clamped to 0.5–2 and the newest owned generated item's tint wins.
Rules execute independently per item/player; once-per-room/floor state persists.
Pickup soul hearts are not re-granted when an item is restored.
The old Ember/Verdant/Void console switching demo has been retired.

## Verification

Run `npm test`. Automated tests execute Lua with mocked game bindings and test
64-item exhaustion, independent ownership, save/continue, rule state,
duplicate/stale delivery, failed persistence, and durable artwork reservations.

Live release gate (still required for v1.6.1):

1. Generate A, collect it, then generate B. Confirm distinct art and IDs and
   that collecting B adds effects without replacing A.
2. Leave another generated pedestal uncollected. Save and exit, close Isaac
   and the bridge, restart both, and continue.
3. Verify both owned effects and the remaining pedestal's art; check a
   once-per-room reward does not repeat solely because of continue.
4. Generate another item; confirm earlier textures remain unchanged.
5. Confirm generation failure preserves accepted items and reports an error.
6. Confirm full-capacity errors without slot reuse (automated 64/65 fixture).
