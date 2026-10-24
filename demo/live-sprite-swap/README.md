# Passive Item Runtime — v1.14.0

The product mod remains **Live Sprite Swap Demo** in `mods/live_sprite_swap_demo`.
It now registers 64 independent passive shells, Generated Passive 00–63.
The pickup banner shows the model's name and one sentence describing the effect.
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

AIsaac uses the copied grey Isaac sheet plus the vanilla Tech X goggles. His
pedestals become Generator 0–4. Picking one up builds an item of that quality
in the corner indicator and does not open the creator.

AIsaac starts with the fixed Singularity Terminal active and one full charge so
the run can begin with an immediate generation. After that first use, it uses
the game's normal 12-room charge meter; using it queues a random-quality
AI passive and keeps the Terminal for the next recharge. Each use first selects
one random quality from 0 through 4, then asks the random-idea service for a
sentence and builds that idea at the selected quality. The Terminal is never
converted into a Generator, including when granted at startup or dropped onto
a pedestal. Generator 0-4 are separate quality-matched pickup tokens, not five
versions of the Terminal. Continuing a run preserves its current charge.

In `content/items.xml`, collectible `gfx` values are filenames relative to
`gfxroot` plus the engine's implicit `collectibles/` directory. Do not prefix
them with `collectibles/` again: that resolves to a nonexistent nested folder
and leaves both pedestal sprites and the active HUD icon invisible. The
asset tests validate these resolved paths and their inclusion in `mod:sync`.

For AIsaac, normal collectible pedestals are converted immediately on spawn and
rechecked on update and before collection. Rerolls, dropped/touched items,
cycling choices, revealed Flip items, shop items, and devil deals use the
original item's quality; the AI Item is converted too. No replacement toggle or
working generation service is required to see the circles. Progression/quest
items and already-generated AI collectibles are deliberately left intact.

The terminal fallback is `npm run ipc:generate -- --prompt "..."` with a run open.
Acceptance spawns a new collectible and saves its profile before queuing ACK.
The existing paired REPENTOGON DLLs require no changes.

## AIsaac assets and playtest

The packaged body is a byte-for-byte copy of the installed game's grey Isaac
sheet. The goggles use a copied Tech X animation and texture under mod-specific
filenames; no Tech X collectible or laser effect is granted. The stage portrait
is a grayscale copy of Isaac's portrait. Generator and generated-item icons are
32×32; the character animation sheet and stage portrait intentionally use their
own larger formats. Character-select portraits are smaller black-and-white
drawings: a robot perched on AIsaac and an angelic Creator. The Who Am I panel
uses each character's real name rather than the fallback Random label. AIsaac's
cosmetic Tech X goggles have blue lenses and are bound directly to the AIsaac
character definition; the Creator's halo and wings are cosmetic only.

Run `npm run characters:art` to rebuild the character-select portraits and
Creator costume without extracted game resources. Generated-item descriptions
no longer remain above pedestals or in the yellow HUD status; error status
messages still appear.

To rebuild these assets, extract your own game resources first, then run:

```powershell
npm run aisaac:prepare -- --source "C:/path/to/extracted/resources"
npm run mod:sync
```

The source directory must contain `gfx/characters/395_techx.anm2`,
`gfx/characters/costumes/character_001_isaac_grey.png`,
`gfx/characters/costumes/costume_395_techx.png`, and
`gfx/ui/stage/playerportrait_isaac.png`. On this installation the body, portrait,
and animation came from `afterbirthp.a`; the normal goggles texture came from
`afterbirth.a`. Extraction must include DLC archives, not just `repentance.a`.
The local extraction workaround used Gibbed.Rebirth 1.0.2 and the installed
ResourceExtractor filename list; downloaded tools are not shipped with the mod.
Run it through `scripts/run-resource-extractor.ps1` to retain only the newest
1,000 lines of `ResourceExtractor_log.txt` after each extraction. The log is
generated locally and intentionally excluded from Git changes.

Restart Isaac after syncing. Start a fresh AIsaac run with the bridge and image
backend running. Check grey skin and cosmetic goggles, then collect all five
Generator qualities (gray, green, blue, purple, yellow). Verify that an active
pedestal produces an active build, prices and choices remain correct, and
save/continue preserves a pending pickup. These are still live acceptance checks.

Each pickup tries up to eight unique ideas before reporting failure; a failed
or cancelled request keeps the Generator. This bound avoids an unlimited paid
model loop when the service or available mechanics cannot satisfy the request.

## HUD artwork and generated-item descriptions

Generated icons now occupy the native Extra HUD history slots instead of a
separate fixed grid: Normal renders 32x32, Mini renders 16x16, and Off requests
no history artwork. Native item ordering, visibility limits, HUD offset, and
twin-player offsets are preserved. Missing artwork keeps the default icon.
Pedestals and explicit library previews remain independent of Extra HUD Off.

Open Isaac's pause screen and choose the lower-right **VIEW AI ITEMS [TAB]**
button (or press Tab). Each accepted item in this run has a page with its name,
icon, Q0-Q4 quality, description, actual effect summary, enabled systems, and
tear/familiar/bomb flags. PREV/NEXT page through items; UP/DOWN scroll details.
Use the mouse, or Left/Right and Enter to activate buttons; Escape or Back
returns to the pause screen. This viewer does not affect Creator drafts or a
pending generation request. Continue restores descriptors from existing run
profiles; a new run clears them.

Live acceptance after syncing and restarting Isaac: compare generated icons
with their native slots in Normal and Mini, verify Off hides history art but
not pedestals, vary HUD offset and minimap size, fill multiple rows, and check
twins. Open the library, scroll a long descriptor, verify quality and flags,
then save/continue and confirm the same entries. Automated Lua mocks cover
these contracts, but pixel alignment still requires an in-game check.

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
