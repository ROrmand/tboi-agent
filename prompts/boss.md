# Boss creation

A boss is a large enemy with a name, a health bar, one or two attacks drawn from the player's description, and a floor where it may replace the regular boss. The player can also name two existing bosses to fuse, and can spawn the result in the current room to test it.

Shell slot: `Dynamic_Boss_1` through `Dynamic_Boss_4`. The bridge assigns it. All four shells share one animation grid. The model does not invent a new rig.

Bosses use the same pixel-swap limit as monsters. "Blend their visual identities" means one new sheet that combines the two silhouettes, painted into the boss grid. It does not mean two boss animations playing at once.

## Player prompt

**1. The boss.**

> Describe what the boss looks like and what it does.

The overlay also offers two optional boss picks, chosen from bosses that exist in the current save (vanilla plus bosses this mod already made). Those picks are fusion sources. Their names, attack summaries, and themes are sent with the prompt. The player can leave either pick empty.

**2. The floor.**

One floor family:

- Basement (includes Cellar and Burning Basement)
- Caves (includes Catacombs and Flooded Caves)
- Depths (includes Necropolis and Dank Depths)
- Womb (includes Utero and Scarred Womb)
- Cathedral / Sheol (one choice covers both; the loader maps the path the run actually took)

The overlay refuses a target that is a story lock. The model never receives Mom, Mom's Heart, It Lives, Isaac, Blue Baby, Satan, The Lamb, Mega Satan, Mother, or the end-path bosses as legal replacement targets. If the player types one of those names into the description, the boss can still borrow a mood in the text, but `floor_target` stays the selected floor family and `balance_note` says the story boss was not replaced.

**Test spawn.** A button in the overlay spawns the finished boss in the current room. That button is not a model field. The payload is the same whether the player is testing or assigning a floor.

## What has to be decided

| Decision | How it is chosen |
|---|---|
| Look | The description, biased toward the two fusion sources if they were picked. One sheet on the boss grid. |
| Attacks | Two source bosses: take one attack idea from each, then stop. One source: one attack from it and one inferred from the text. No sources: one or two attacks from the text. |
| HP | Floor family sets the band. Fusion does not add the donors' HP together. |
| Phases | One phase by default. A second phase only if the description or a donor boss is clearly multi-phase. |
| Projectiles | Each attack has its own projectile profile, generated the same way as a monster shot. |
| Intro and portrait | A name for the boss bar, a 64×64 portrait, an intro sound. |
| Floor | The player's floor pick. The model does not move it. |
| Sounds | Intro, attack, hurt, phase, death. Catalog id on every event. |

## System prompt

```
You create one Binding of Isaac: Repentance boss for a live mod.
Return only JSON matching BossPayload.

The player picked a floor family. Copy it into floor_target unchanged.
Do not set floor_target to a story boss. Story bosses are not replaceable:
Mom, Mom's Heart, It Lives, Isaac, ??? / Blue Baby, Satan, The Lamb,
Mega Satan, Mother, Dogma, The Beast, Hush, Delirium.

If fusion_sources has two names, design one attack inspired by the first and
one inspired by the second. Do not import their HP, their sprite sheets, or
more than those two attacks. The sprite_prompt names both silhouettes and
asks for a single creature that reads as both, drawn into the boss frame grid.

If fusion_sources has one name, use one attack inspired by it and one from
the description. If it has none, use the description only.

The animation grid is fixed:
Idle 4, AttackA 6, AttackB 6, Phase 4, Death 8.
Cell size is 96x96. sprite_prompt must request that grid, horizontal strips,
transparent background, no text, no arena, no UI. The same creature appears
in every cell. AttackA and AttackB must be distinguishable.

phases is 1 or 2. Phase 2 starts at 50 percent HP and may only change color
tint, which attack is used, and the Phase animation. It does not add a third
attack or a second sprite sheet.

Each attack has a projectile_profile or is a summon. Summons use one id from
the provided vanilla allowlist, count 1 to 3, and never summon this boss or
another dynamic boss.

HP is the floor band in this file, not the sum of the donors.
Contact damage is 1. Projectile damage is 1 or 2.

Sounds need a catalog_id on intro, attack, hurt, phase, and death.
intro.generate may be true for a short stinger under 2 seconds. Do not
generate music loops.

lua_behavior_hook is optional and sandboxed like the other categories.
Prefer attack data. The chunk may return { on_update = function(npc, frame, phase) end }.
It must not lock the doors by itself, remove the player, or spawn a story boss.

The boss must be killable: Death plays once, no revive, no spawn that replaces
the boss.
```

## Output

```json
{
  "entity_type": "boss",
  "metadata": {
    "display_name": "The Suture",
    "description": "A stitched mask that fires pins, then charges",
    "theme": "cursed",
    "balance_note": ""
  },
  "floor_target": "caves",
  "fusion_sources": ["Pin", "Mask of Infamy"],
  "body": {
    "hp": 220,
    "speed": 0.45,
    "collision": 28,
    "phases": 2,
    "phase_tint": { "r": 0.7, "g": 0.15, "b": 0.15, "a": 1 }
  },
  "sprite_prompt": "one stitched pale mask with a worm body, cursed red thread, 96x96 cells, strips Idle 4, AttackA 6, AttackB 6, Phase 4, Death 8, transparent background, same boss in every cell",
  "portrait_prompt": "64x64 boss portrait of a stitched pale mask, shoulders only, dark background, no text",
  "attacks": [
    {
      "name": "pin spray",
      "phase": 1,
      "animation": "AttackA",
      "cooldown_frames": 70,
      "kind": "projectile",
      "projectile_profile": {
        "weapon_mode": "tear",
        "count": 5,
        "spread_degrees": 50,
        "speed": 9,
        "damage": 1,
        "flags": ["piercing"],
        "color": { "r": 0.8, "g": 0.8, "b": 0.7, "a": 1 },
        "scale": 0.8,
        "sprite": "generate",
        "sprite_prompt": "bone pin, 32x32, 4-frame tumble, no background"
      },
      "summon": { "id": "none", "count": 0 }
    },
    {
      "name": "mask charge",
      "phase": 2,
      "animation": "AttackB",
      "cooldown_frames": 90,
      "kind": "dash",
      "projectile_profile": null,
      "summon": { "id": "none", "count": 0 }
    }
  ],
  "sounds": {
    "intro": { "catalog_id": "BOSS_INTRO", "generate": true, "generated_prompt": "low stitched-leather groan, under two seconds" },
    "attack": { "catalog_id": "MONSTER_YELL_A", "generate": false, "generated_prompt": "" },
    "hurt": { "catalog_id": "MEAT_IMPACTS", "generate": false, "generated_prompt": "" },
    "phase": { "catalog_id": "SUMMONSOUND", "generate": false, "generated_prompt": "" },
    "death": { "catalog_id": "DEATH_BURST_LARGE", "generate": false, "generated_prompt": "" }
  },
  "lua_behavior_hook": ""
}
```

`portrait_prompt` is a separate image from the animation sheet. It is the square face used if the overlay shows a boss card. The in-room sprite is only the 96×96 grid. The boss bar uses `display_name`.

## Floor and HP

The player owns the floor. HP is the Basement-relative number for that family. The loader does not scale bosses a second time on top of this band.

| Floor target | HP band | Speed |
|---|---|---|
| Basement | 120–180 | 0.35–0.7 |
| Caves | 180–260 | 0.35–0.65 |
| Depths | 240–340 | 0.3–0.6 |
| Womb | 300–420 | 0.3–0.55 |
| Cathedral / Sheol | 360–500 | 0.3–0.55 |

`collision` is 24–36. `phases` is 1 or 2. `phase_tint` is applied when phase 2 starts, multiplied over the sheet. There is no second generated sheet.

Replacement is "the boss room of that floor family, on this run." It does not replace story rooms, the first-floor special cases the game forces, or any floor the player did not pick. One dynamic boss per floor family. A fifth boss request reuses the oldest slot only after the bridge says that slot is free. The model does not pick slots.

Test spawn ignores `floor_target` for placement and drops the boss in the current room. Doors stay under the game's normal boss-room rules when the room is already a boss room. In a normal room, the test spawn does not lock the player in. `balance_note` is not involved; the loader handles this.

## Fusion

Two names in, one boss out.

- Attack 1 should be recognizable as the first source (a spray, a hop, a brimstone-like volley) without copying numbers that break the clamps.
- Attack 2 should be recognizable as the second source.
- The sprite prompt names both sources as ingredients and asks for one body. "Half Pin, half Mask" is the instruction to the image model, not two entities.
- HP stays inside the floor band. Averaging two late-game donors into a Basement fight is not allowed; the floor band wins.
- If a source is multi-phase, `phases` may be 2. Otherwise stay at 1 unless the player asked for a second form.

If a fusion source is itself a dynamic boss from this mod, the prompt includes that boss's attack names and sprite prompt, not its Lua. The new boss still gets its own slot and its own sheet.

## Attacks

Maximum two attacks. Each is `projectile`, `dash`, or `summon`.

| Kind | Required data | Notes |
|---|---|---|
| `projectile` | A projectile profile. `summon.id` is `none`. | Same grid as monster shots: 32×32, 4 frames, modes `tear`, `lob`, or `laser`. |
| `dash` | `projectile_profile` is null. Animation plays, then the shell lunges. | Cooldown at least 80 frames so the dash can finish. |
| `summon` | `summon.id` from the vanilla allowlist, `count` 1–3. | Adds are normal enemies, not bosses. They do not drop boss rewards. |

`phase` on an attack is 1, 2, or `both`. A one-phase boss marks both attacks as 1. A two-phase boss should not leave phase 2 with zero attacks.

Projectile clamps: `count` 1–8, `spread_degrees` 0–360 (360 is a ring), `speed` 4–12, `damage` 1 or 2, cooldown 50–140 frames. Flags: at most two, from the monster allowlist. A ring of eight homing shots is legal on Cathedral / Sheol and illegal earlier; on Basement through Womb, homing plus a ring must drop to `count` 5 or drop `homing`. The model does this before returning JSON.

Lasers telegraph on AttackA or AttackB for the full six frames before the beam exists. The beam lasts at most 40 frames and uses `color`.

Dashes deal the shell's contact damage (1) and cannot cross the room more than once per cooldown.

## Phase change

At 50 percent HP the loader plays `Phase` once (four frames), applies `phase_tint`, plays `sounds.phase`, and switches which attacks are eligible. The boss is invulnerable only during those four frames. It cannot heal, cannot restart phase 1, and cannot play `Phase` again.

If `phases` is 1, `Phase` is still in the sheet so the grid stays valid, and the loader never plays it.

## Sprites

**Body sheet.** Five strips, 96×96, frame counts above. The bridge checks dimensions and rejects the sheet on mismatch. The placeholder boss sheet stays until a valid one arrives, so a test spawn can still happen.

**Portrait.** 64×64, one frame, head and shoulders, simple background. This is the only image allowed to have a background. It is not drawn on the entity.

No costume, no pedestal, no separate death-gib sheet. Death gibs use a dark red default unless `theme` is Angelic (pale gold) or Tech (cyan sparks). Those tints are loader-side, not extra images.

## Sounds

| Event | Plays when |
|---|---|
| `intro` | The boss finishes spawning. This is the one place a generated stinger is worth it. |
| `attack` | Either attack starts |
| `hurt` | Damage, rate-limited to once every 25 frames |
| `phase` | The Phase animation starts. Unused when `phases` is 1, but the catalog id is still required |
| `death` | Death starts |

Catalog ids always exist. Generated clips are under two seconds and fall back to the catalog if the sound bank did not reload. Do not request a looping track. The game's floor music stays.

## Room clear

The boss is finished only when the shell plays `Death` to the last frame and the NPC is removed. The hook must not revive it, morph it into another boss, or spawn a successor with boss HP. Summoned adds may still be alive; the loader kills adds from this boss when `Death` completes so the room can clear.

Rewards are the room's normal boss-room rewards when this boss was a floor replacement. A test spawn in a normal room drops nothing.

## Behavior hook

Empty unless a dash needs to aim at the player's tile or a projectile needs a lead.

```lua
return {
  on_update = function(npc, frame, phase, declared_attacks) end
}
```

Same sandbox as the other categories. No file access, no `while true`, no story-boss spawns, no door locks beyond what the room already did.

On sanitizer failure the floor mapping is kept, the placeholder sheet is kept, and the fallback behavior is a single aimed 3-tear shot on a 90-frame cooldown with catalog sounds. The boss remains killable.

## Fallback and cleanup

Four boss slots are the whole budget. Floor claims clear with the slot on `MC_POST_GAME_STARTED` and `MC_PRE_GAME_EXIT`. A boss that fails image generation still occupies its slot until the run ends, so a broken sheet cannot be retried onto a second slot in the same run unless the player discards it from the overlay. Discard is a client action, not a model field.
