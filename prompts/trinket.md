# Trinket creation

A trinket is a small passive the player holds in the trinket slot. It is weaker than an item, shorter to describe, and stricter to clamp. The overlay has one text prompt. The model still has to resolve stats, a trigger, a sprite, sounds, and a tear change when the wording asks for one.

Shell slot: the ten preallocated trinket ids from `items.xml`. The bridge assigns the slot.

## Player prompt

One text field.

> Explain what you want the trinket to do. You can also hit Randomize.

That is the whole window. There is no synergy grid and no stat checklist. Randomize fills the text and then runs this same prompt.

What the player does not fill, the model must still decide: trigger timing, magnitude, sprite, and sounds. The description's tone (utility, drop rate, room trigger, tiny stat) is the only creative input.

## What has to be decided

| Decision | How it is chosen |
|---|---|
| Trigger | Inferred. One primary trigger, optional second. |
| Magnitude | Inferred, then clamped to trinket bounds, which are tighter than items. |
| Tear change | Only if the description mentions shots, tears, or status on hit. Otherwise the tear profile is unchanged. |
| Sprite | Always. One 32×32 trinket icon. |
| Sounds | Pickup, and a proc sound if the trigger is audible. |
| Stacking | Trinkets do not multiply by copies. One slot, one effect. |

Trinkets do not grant costumes, active charges, or soul hearts. Those belong to items. If the description asks for them, `balance_note` explains the cut and the closest legal effect is used (a small stat, a room trigger, or a mild tear flag).

## System prompt

```
You create one Binding of Isaac: Repentance trinket for a live mod.
Return only JSON matching TrinketPayload.

The player wrote one description. Infer a single small effect from it.
Prefer a room trigger, a drop-rate nudge, or a tiny stat. Do not build an item.

Bounds are the trinket clamps in the schema, not the item clamps.
If the wish is too large, shrink it and explain the shrink in metadata.balance_note.

triggers is a list of one or two entries from this allowlist:
room_enter, room_clear, enemy_hit, player_hurt, pickup, new_floor, tear_fire.

At most one tear flag, and only when the description is about shots.
weapon_mode must stay "tear". Trinkets cannot switch the player to laser, knife,
bomb, lob, or controlled.

stats are deltas. Leave unused stats at 0. Do not use multipliers above 1.15.

sprite_prompt is one trinket icon: a small object, 32x32, no character, no text,
no background.

sounds.pickup always has a catalog_id. sounds.proc uses catalog_id "NONE" when
the trigger is silent (a passive stat with no moment of activation).

lua_behavior_hook may be empty. Use it only for the trigger. The same sandbox
as items: no os, io, debug, dofile, require, load, loadfile, no while true.
The chunk returns { on_trigger = function(player, trigger_name) end }.

Do not reference items the player did not name. Do not invent a second trinket.
```

## Output

```json
{
  "entity_type": "trinket",
  "metadata": {
    "display_name": "Bent Nail",
    "description": "Rooms hurt less",
    "theme": "gross",
    "balance_note": ""
  },
  "triggers": ["room_enter"],
  "stats": {
    "damage": 0,
    "tears": 0,
    "shot_speed": 0,
    "range": 0,
    "speed": 0,
    "luck": 1
  },
  "tear_profile": {
    "apply": false,
    "flags": [],
    "color": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "scale": 1,
    "sprite": "tint",
    "sprite_prompt": ""
  },
  "sprite_prompt": "rusty bent nail, 32x32 trinket icon, dull iron and dried blood, no background",
  "sounds": {
    "pickup": { "catalog_id": "THUMBSUP", "generate": false, "generated_prompt": "" },
    "proc": { "catalog_id": "BONE_SNAP", "generate": false, "generated_prompt": "" }
  },
  "drop_rate": {
    "applies": false,
    "target": "none",
    "delta": 0
  },
  "lua_behavior_hook": ""
}
```

There is no quality field. Trinkets are not items. `metadata.description` is the short pickup line.

## Triggers

One primary trigger is required. A second is allowed only when the description clearly has two moments ("on hit, and also when the room is cleared").

| Trigger | Fires | Typical use |
|---|---|---|
| `room_enter` | A new room starts | Temporary stat, a small heal, a curse |
| `room_clear` | The room is cleared | A penny, a bomb, a short buff |
| `enemy_hit` | The player's tear hits an enemy | A status proc. Needs the tear flag or the hook, not both for the same status |
| `player_hurt` | The player takes damage | A counterattack, a stat bump, a payout |
| `pickup` | The trinket is smelted onto the slot or first held | One-shot grants |
| `new_floor` | The floor changes | A drop, a map effect |
| `tear_fire` | The player shoots | Shot-shaping only |

`pickup` plus a cache stat does not double-grant. Stats go through cache. `pickup` is for something that happens once, like spawning a single coin.

The hook runs after the loader applies `stats` and `tear_profile`. It must not reapply them.

## Magnitude

Trinket clamps are intentionally smaller than items so several generated trinkets cannot stack into an item.

| Field | Clamp |
|---|---|
| `damage` | −1 to 1.5 |
| `tears` | −1 to 1.5 |
| `shot_speed` | −0.3 to 0.3 |
| `range` | −4 to 6 |
| `speed` | −0.2 to 0.15 |
| `luck` | −1 to 2 |
| `drop_rate.delta` | −0.05 to 0.15 |

No `damage_multiplier` field. No soul hearts. No black hearts. A "heart on room clear" wish becomes a soul-heart grant of at most 1, and only inside the hook, with a per-floor counter the loader provides as `context.hearts_granted_this_floor`. The hook may not exceed that counter.

`drop_rate.target` is `coin`, `key`, `bomb`, `heart`, or `none`. `delta` is added to the room-clear drop chance, not a guaranteed spawn, unless `delta` is above 0.1, in which case the loader treats it as "one extra drop of that type the first time a room is cleared on this floor" and ignores further clears. That keeps "more keys" from flooding a floor.

## Tears

Default is `tear_profile.apply: false`, which leaves the player's shot alone.

When the description is about tears:

- `apply` is true.
- At most one flag from `homing`, `spectral`, `piercing`, `poison`, `burn`, `slow`, `fear`, `charm`, `bounce`, `glow`.
- `scale` is 0.85 to 1.25.
- `sprite` is `tint` unless the description is specifically about the shape of the tear ("tears look like nails"). Then `sprite` is `generate` and the sheet is the same 32×32, four-frame strip used by items.
- `weapon_mode` is not a field. Trinkets cannot replace the weapon.

If an equipped item from this mod already set a tear profile, the trinket may add its single flag and, if it generated a sprite, it does not replace the item's sprite. Item art wins. The trinket contributes the flag and the tint only when the item used `tint`.

## Sprite

Always one image. 32×32, one frame, trinket icon, transparent background. No pedestal, no costume, no animation strip.

The prompt should name a single small object and a material. Theme words from the description (cursed, gross, holy, machine) go into the prompt as palette words. If the description has no look, invent a simple object that matches the effect and name it in `display_name`.

The shell trinket graphic is rebound with `Sprite:ReplaceSpritesheet()` on layer 0.

## Sounds

| Event | Plays when |
|---|---|
| `pickup` | The trinket is held |
| `proc` | A trigger fires and should be heard |

Stat-only trinkets set `proc.catalog_id` to `NONE` and `generate` to false. Room-clear payouts and on-hit procs get a catalog id. Generated audio follows the item rule: under two seconds, catalog id always present, generated slot is best-effort because custom sound reload mid-run is not guaranteed.

Do not generate a sound for `tear_fire`. The player's shot already has a fire sound. A trinket may only replace it when `tear_profile.sprite` is `generate`, and then it uses `proc` as the fire sound so there is still a single channel.

## Behavior hook

Most trinkets should ship with an empty hook. The loader already applies stats, drop-rate nudges, and a single tear flag.

The hook is for timed or conditional logic the fields cannot say: "the first time you are hit each room, fire a burst of nails," "luck only applies in curse rooms."

```lua
return {
  on_trigger = function(player, trigger_name, context) end
}
```

`context` includes `hearts_granted_this_floor`, `drops_this_floor`, and `trigger_name`. The hook may read them and may ask the loader to spawn one allowlisted pickup (`coin`, `key`, `bomb`, `heart`). It may not spawn monsters, items, or another trinket.

Sanitizer failure loads the trinket fallback: the icon still applies, all stats 0, tear profile not applied, no trigger.

## Fallback and cleanup

A failed sprite keeps the shell's placeholder icon and still applies the effect, so a trinket is never an invisible stat with no name. The name and description still show.

The slot is wiped with the rest of the run on `MC_POST_GAME_STARTED` and `MC_PRE_GAME_EXIT`. A trinket does not write a save entry unless the player later chooses Save Custom Mod. That action is outside this prompt.
