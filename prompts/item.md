# Item creation

An item is a collectible the player can be given mid-run. The overlay collects a description, optional stat overrides, up to five synergies, and a visual theme. The model turns that into a bounded item: stats, a tear or weapon profile, a pedestal sprite, an optional costume, event sounds, and a sandboxed behavior hook.

A blank field is not a skip. The model fills it from the description. A field the player set is an override and must be copied through unchanged, then clamped.

Shell slot: `Dynamic_Item_1` through `Dynamic_Item_20`. The slot is chosen by the bridge, not the model.

## Player prompt

The window is two required steps, plus optional overrides.

**1. The item.** Multi-line text. The player describes what it is, what it does, side effects, and when it matters.

> A shadow dagger that multiplies damage based on how fast you are moving. Fires short dark blades.

A Randomize button replaces this text with a seeded concept. Randomize still runs the same schema. It does not bypass tear, sprite, or sound generation.

**2. Synergies.** The player picks up to five items they are holding. The list is the current run, including items this mod already created, with a search box. Each pick is sent as its real name, description, and quality, not just an id. The player can also type a relationship ("synergize with Technology into a laser sword slash").

Optional, and empty means "infer":

- Stat checklist: Damage, Tears (fire rate), Shot Speed, Range, Luck, Speed, Soul Hearts. Empty cells are inferred. Filled cells override the description.
- Theme: Cursed, Angelic, Tech, Gross, Cosmic, or none. Theme directs art, color, and sound family. It does not add mechanics the description did not ask for.
- Active or passive. Empty means passive unless the description clearly spends a charge, a key, or a one-shot use.

## What has to be decided

The description is allowed to be vague. The payload is not. Every item resolves all of the following before anything is written into the mod folder.

| Decision | How it is chosen |
|---|---|
| Passive or active | Player override, else inferred. Actives need a charge count and a use behavior. Passives have no charge. |
| Quality 0–4 | Inferred from power. 0 is a small downside or trinket-like passive. 4 is a run-defining effect. |
| Stats | Player checklist wins per field. Missing fields come from the description. Unmentioned stats stay 0. |
| Tear / weapon look | A separate profile. Fire rate in `stats.tears` never describes appearance. |
| Pedestal sprite | One 32×32 sheet from `sprite_prompt`, drawn in the theme. |
| Costume | Only if the item would be visible on the body (hat, wings, a held dagger). Otherwise `none`. |
| Sounds | One clip intent per event. Playback always has a catalog sound id even when a generated clip is requested. |
| Synergy rules | One explicit rule per selected item. No selected item means an empty list. |
| Behavior hook | Lua for what stats and tear flags cannot express. Empty string when the profile is enough. |

## System prompt

```
You create one Binding of Isaac: Repentance collectible for a live mod.
Return only JSON matching ItemPayload. Do not invent extra keys.

The player text is a wish. The schema is the item. Fill every required field.
If the player set an override, copy it and clamp it. Do not "improve" it.
If the player left a field empty, infer a conservative value from the description.

Stats are deltas applied once on pickup, not per-frame multipliers, except
damage_multiplier which is an explicit separate field.

Fire rate goes in stats.tears. How the shot LOOKS goes in tear_profile.
Never hide tear shape, color, weapon mode, or sound choice inside lua_behavior_hook.

Weapon modes: tear, laser, knife, bomb, lob, controlled.
Use laser, knife, bomb, lob, or controlled only when the description or a named
synergy requires that weapon. Otherwise use tear.

Tear flags must come from the allowlist. Do not combine more than three flags.
Explosive, knife, and bomb are high impact: at most one of them.

Sprite prompts are pixel-art directions for a fixed frame grid, not a scene.
Describe silhouette, palette, and the theme. Do not request text, UI, or a background.

Sounds: set catalog_id on every event to a name in the provided sound catalog.
Set generate to true only when the description asks for a distinctive noise.
generated_prompt is one short sound (under 2 seconds), not music.

lua_behavior_hook may be empty. When present it is a single Lua chunk that
returns a table of callbacks. It must not call os, io, debug, dofile, require,
load, or loadfile. It must not contain while true. It must not loop without a
frame counter. It may read the tear_profile and stats the game passes in. It
must not reimplement them.

Synergy rules name the other item and the resulting tear_profile or stat change.
Do not claim a synergy with an item the player did not select.

Clamp to the bounds in the schema. If you cannot satisfy the description inside
the bounds, satisfy the closest safe reading and say so in metadata.balance_note.
```

## Output

```json
{
  "entity_type": "item",
  "metadata": {
    "display_name": "Shadow Dagger",
    "description": "Speed is power",
    "quality": 3,
    "kind": "passive",
    "charge": 0,
    "theme": "cursed",
    "balance_note": ""
  },
  "stats": {
    "damage": 0,
    "damage_multiplier": 1,
    "tears": 0.7,
    "shot_speed": 0.1,
    "range": 0,
    "speed": 0,
    "luck": 0,
    "soul_hearts": 0
  },
  "tear_profile": {
    "weapon_mode": "tear",
    "flags": ["piercing"],
    "color": { "r": 0.15, "g": 0.05, "b": 0.2, "a": 1 },
    "scale": 0.85,
    "sprite": "generate",
    "sprite_prompt": "tiny curved dagger made of black glass, 4-frame wobble, dark purple edge, no background"
  },
  "visuals": {
    "pedestal_prompt": "small black glass dagger on a 32x32 icon, cursed purple glint, no text, no background",
    "costume": "head",
    "costume_prompt": "short black glass horn, front-facing, Isaac costume layer, transparent background"
  },
  "sounds": {
    "pickup": { "catalog_id": "BOOK_PAGE_TURN", "generate": false, "generated_prompt": "" },
    "fire": { "catalog_id": "TEAR_FIRE", "generate": true, "generated_prompt": "short soft knife swish, dry, no echo" },
    "proc": { "catalog_id": "NONE", "generate": false, "generated_prompt": "" }
  },
  "synergies": [
    {
      "with_item": "Technology",
      "rule": "Shots become a short laser shaped like a dagger slash.",
      "tear_profile_override": {
        "weapon_mode": "laser",
        "flags": ["piercing"],
        "color": { "r": 0.4, "g": 0.1, "b": 0.6, "a": 1 },
        "scale": 1,
        "sprite": "generate",
        "sprite_prompt": "thin curved purple laser slash, 4 horizontal frames, no background"
      }
    }
  ],
  "lua_behavior_hook": ""
}
```

`metadata.description` is the in-game pickup line: a few words, present tense, no punctuation required. The mechanical explanation stays in the player prompt and in `balance_note` when the wish was narrowed.

`charge` is 0 for passives. Actives use 1 to 6. 12 is not allowed. Timed recharge is expressed as a charge count, not as real-time seconds in Lua.

## Stats

Deltas apply through `MC_EVALUATE_CACHE` on the matching cache flag. The hook must not write stats every frame.

| Field | Meaning | Clamp |
|---|---|---|
| `damage` | Flat damage added | −10 to 15 |
| `damage_multiplier` | Multiplier after flat damage. 1 means unchanged | 0.5 to 4, and never above the global cap of 50 combined with other items |
| `tears` | Fire-rate delta. Positive is faster. Tear delay after all mods stays ≥ 1 | −5 to 10 |
| `shot_speed` | Shot speed delta | −1 to 1.5 |
| `range` | Range delta | −10 to 20 |
| `speed` | Move speed delta. Final move speed stays ≤ 2 | −1 to 0.5 |
| `luck` | Luck delta | −5 to 10 |
| `soul_hearts` | Granted once on pickup | 0 to 4 |

Soul hearts are a grant, not a cache stat. The loader adds them on pickup and does not add them again if the item is re-evaluated.

If the description says "doubles damage while you are fast," that is not a flat `damage` number. It stays in `lua_behavior_hook` as a cache callback that reads velocity, and `damage_multiplier` stays 1 so the two do not stack by accident.

## Tears and weapons

This is the whole visual of the player's shot. The loader builds it from `tear_profile`. The Lua hook may not spawn its own tear sprites.

`weapon_mode`:

| Mode | What the player sees | When to use it |
|---|---|---|
| `tear` | A tinted, scaled tear, or a custom 4-frame tear if `sprite` is `generate` | Default |
| `laser` | A thin instant shot using the laser shell | Technology-like synergies and "laser" wording |
| `knife` | A held blade on the knife shell | Dagger, sword, slash wording |
| `bomb` | A lobbed bomb on the bomb shell | Only when the description asks for bombs |
| `lob` | An arcing tear | "Lobs", "mortar", "rainbow" style shots |
| `controlled` | A single tear the player steers | Only when the description asks for a controlled shot |

`sprite`:

- `tint` uses Isaac's tear (or the weapon shell) multiplied by `color` and `scale`. No image request.
- `generate` asks the image model for a sheet. The grid is fixed: 32×32, four frames in a horizontal strip, loop, transparent background. The bridge rejects any other size.

`scale` is 0.5 to 2. `color` channels are 0 to 1.

Flag allowlist: `homing`, `spectral`, `piercing`, `poison`, `burn`, `slow`, `fear`, `charm`, `bounce`, `split`, `orbit`, `glow`. At most three. `explosive` is off this list; explosions go through `weapon_mode: "bomb"` so the sandbox can count them.

A synergy override replaces the tear profile only while that item is also held. It does not edit the base profile.

## Sprites

Two image jobs, both optional in cost but both decided explicitly.

**Pedestal.** Always generated. One frame, 32×32, the inventory and pedestal icon. Prompt rules: one object, theme palette, no letters, no floor, no character. The shell's `gfx` is rebound with `Sprite:ReplaceSpritesheet()` on layer 0.

**Costume.** `none`, `head`, or `body`.

- `none` when the item is a stat or tear change with no worn object.
- `head` for horns, halos, masks, hats. Sheet is the front head layer of the preallocated costume shell.
- `body` for coats, wings, body marks. Same rule, body layer.

Costume prompts must say "Isaac costume layer, transparent background" and must not include a full character. The game already draws the body.

Theme palettes the prompt should lean on:

| Theme | Palette cue |
|---|---|
| Cursed | Black, dried blood, violet |
| Angelic | White, gold, pale blue |
| Tech | Cyan, copper, hard highlights |
| Gross | Olive, pink, wet highlights |
| Cosmic | Deep blue, star white, magenta |

## Sounds

Three events. Each one needs a `catalog_id` from the mod's sound catalog so the run still has audio if generated files cannot be reloaded mid-run.

| Event | Plays when |
|---|---|
| `pickup` | The item is collected or granted |
| `fire` | The player shoots, if the tear profile changed the shot |
| `proc` | A special trigger from the Lua hook. `catalog_id: "NONE"` if the item has no proc |

`generate: true` also writes `generated_prompt` and asks the audio model for a clip under two seconds. The clip is stored on the next free preallocated sound slot. Playback tries the generated slot, then the catalog id. Music, voice lines, and loops are out of scope.

## Behavior hook

Use Lua only for rules that stats and `tear_profile` cannot state. Typical cases: damage that scales with speed, a chance on hit, a room-clear trigger, an active-item `MC_USE_ITEM`.

The chunk returns a table:

```lua
return {
  evaluate_cache = function(player, cache_flag, stats, tear_profile) end,
  use_item = function(player) end,
  proc = function(player, entity) end
}
```

Missing callbacks are fine. The loader binds only the functions that exist.

Forbidden inside the chunk: `os`, `io`, `debug`, `dofile`, `require`, `loadfile`, `load`, `while true`, unbounded recursion, `Entity:Remove()` on the player, and any write to another item's slot. On sanitizer failure the slot loads `Fallback_Template.lua`: the pedestal sprite still applies, all stats are 0, tear profile is a normal tinted tear, and no proc runs.

## Synergies

There is one rule object per selected item, in the order the player picked them. A rule is either a `tear_profile_override`, a stat delta, or a one-line proc. It is not a second full item.

The model sees the selected item's real description so "synergize with Technology" can become `weapon_mode: "laser"` instead of a vague comment. If the selected item already changes tears, the override must say what the combined shot is, not list both effects side by side and hope.

Cap: five rules. The loader applies them in order. Later rules replace tear fields they set, and add stat deltas.

## Fallback and cleanup

Missing JSON, a failed sprite, or a failed sound does not block the item. The order is: valid stats and tear flags first, catalog sounds, tint instead of a custom tear sheet, no costume, then the behavior hook. The player still receives a named item.

The slot is released on `MC_POST_GAME_STARTED` and `MC_PRE_GAME_EXIT`. Saving the item for a later run is a separate action and is not part of this prompt.
