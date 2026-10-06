# Monster creation

A monster is a mid-run enemy bound to a preallocated entity slot. The player fills two pages. The model resolves an animation shell, a spritesheet that matches that shell, attacks, projectile looks, sounds, and which vanilla enemies it may replace.

Shell slot: `Dynamic_Monster_1` through `Dynamic_Monster_10`. The bridge assigns it. The model picks the animation archetype, not the slot.

`Sprite:ReplaceSpritesheet()` only swaps pixels inside an animation the shell already has. A free-form portrait cannot become a walking enemy. The movement profile chooses the shell first, and the image model fills that shell's frame grid.

## Player prompt

**Page 1. Look and movement.**

> Describe what the monster looks like and what it does.

Plus required choices:

- Size: small, medium, large. Small and medium use 32×32 frames. Large uses 64×64.
- Movement: Flying, Hopping, Stationary, Chasing. This picks the animation shell.
- Theme: Cursed, Angelic, Tech, Gross, Cosmic, or none.

**Page 2. Combat and placement.**

- Attack pattern, in words. If empty, infer a single attack from page 1.
- Projectile spread, if it shoots. Empty means the model decides.
- Death spawn, in words. Empty means no spawn.
- Replacement list: up to ten vanilla enemy ids this monster may replace for the rest of the run. The player can leave this empty or press Randomize, which fills the list from common room enemies and still runs this prompt.

Randomize on page 1 replaces the description only.

## What has to be decided

| Decision | How it is chosen |
|---|---|
| Animation shell | The movement choice. The model cannot invent a fifth body plan. |
| Frame grid | Fixed by shell and size. The sprite prompt must ask for that grid. |
| HP, speed, collision | Inferred from size and description, then clamped. |
| Attacks | One or two. Each attack names a telegraph, a projectile profile, and a cooldown. |
| Projectile look | Its own profile, same idea as a player's tear. Default tears are not assumed. |
| Death | An animation that already exists on the shell, plus an optional single spawn. |
| Sounds | Spawn, attack, hurt, death. Each has a catalog id. |
| Replacement | Only ids the player listed, or the randomizer listed. Never bosses. |

## System prompt

```
You create one Binding of Isaac: Repentance monster for a live mod.
Return only JSON matching MonsterPayload.

movement is given by the player: flying, hopping, stationary, or chasing.
It selects the animation shell. Do not describe animations the shell does not have.
size is small, medium, or large as given.

sprite_prompt must request the exact frame grid in this file for that shell and
size: a horizontal strip per animation, transparent background, no text, no floor,
no UI. The creature's silhouette must stay inside the cell. Attack frames must
read as the same creature as the walk frames.

You get a list of legal vanilla replacement ids. Copy only from that list into
replacements. If the list is empty, replacements is empty. Never add bosses or
ids that were not provided.

attacks has 1 or 2 entries. Each projectile uses projectile_profile.
weapon_mode for monsters is tear, lob, or laser. Laser is only for a tech theme
or an explicit laser description. Do not use knife or bomb.

projectile_profile.sprite generate uses a 32x32 4-frame strip, even on large
monsters. The body can be 64. The shot stays 32.

Death spawns at most one entity, and only if the player asked. The spawn is
either "none" or one id from the replacement allowlist. Do not spawn the same
dynamic monster (no recursion).

Sounds: catalog_id is required on spawn, attack, hurt, and death. generate is
true only when the description implies a distinctive voice or mechanical noise.
Clips are under 2 seconds.

lua_behavior_hook is optional and sandboxed: no os, io, debug, dofile, require,
load, loadfile, no while true. Prefer data in attacks over custom Lua.
The chunk may return { on_update = function(npc, frame) end } and must not
ReplaceSpritesheet, change the player's items, or spawn more than the death
spawn already declared.

HP and speed must fall inside the clamps. A "tank" is the top of the clamp,
not a new number past it.
```

## Output

```json
{
  "entity_type": "monster",
  "metadata": {
    "display_name": "Glass Leech",
    "description": "A wet shard that hops and spits needles",
    "theme": "gross",
    "balance_note": ""
  },
  "body": {
    "size": "small",
    "movement": "hopping",
    "hp": 18,
    "speed": 0.6,
    "collision": 12,
    "mass": 8,
    "champion": false
  },
  "sprite_prompt": "small glass leech, olive and pink, 32x32 cells, strips: Idle 2 frames, Hop 4 frames, Attack 4 frames, Death 6 frames, transparent background, same creature in every cell",
  "attacks": [
    {
      "name": "needle spit",
      "telegraph_animation": "Attack",
      "cooldown_frames": 50,
      "range_tiles": 6,
      "projectile_profile": {
        "weapon_mode": "tear",
        "count": 3,
        "spread_degrees": 28,
        "speed": 8,
        "damage": 1,
        "flags": ["piercing"],
        "color": { "r": 0.7, "g": 0.8, "b": 0.75, "a": 1 },
        "scale": 0.7,
        "sprite": "generate",
        "sprite_prompt": "tiny glass needle, 32x32, 4-frame spin, pale green, no background"
      }
    }
  ],
  "death": {
    "animation": "Death",
    "spawn": "none",
    "gib_color": { "r": 0.6, "g": 0.7, "b": 0.55, "a": 1 }
  },
  "sounds": {
    "spawn": { "catalog_id": "MONSTER_ROAR_0", "generate": false, "generated_prompt": "" },
    "attack": { "catalog_id": "BLOODSHOOT", "generate": true, "generated_prompt": "short wet glass click" },
    "hurt": { "catalog_id": "MEAT_IMPACTS", "generate": false, "generated_prompt": "" },
    "death": { "catalog_id": "DEATH_BURST_SMALL", "generate": false, "generated_prompt": "" }
  },
  "replacements": [],
  "lua_behavior_hook": ""
}
```

Catalog ids in examples are illustrative. The live prompt injects the mod's real catalog and the model must pick from that list.

## Animation shells

The player’s movement choice locks the shell. The image model is asked for one sheet per animation, cells packed left to right. The bridge slices on the cell size and rejects a sheet whose dimensions are not `cell × frame_count` by `cell`.

**Chasing** walks on the ground toward the player.

| Size | Cell | Animations and frame counts |
|---|---|---|
| small, medium | 32 | WalkDown 4, WalkHorizontal 4, WalkUp 4, Attack 4, Death 6 |
| large | 64 | same counts |

**Flying** ignores ground gaps. It bobs in place in the walk cycles.

| Size | Cell | Animations and frame counts |
|---|---|---|
| small, medium | 32 | Fly 4, Attack 4, Death 6 |
| large | 64 | same counts |

**Hopping** stands, then commits to a hop.

| Size | Cell | Animations and frame counts |
|---|---|---|
| small, medium | 32 | Idle 2, Hop 4, Attack 4, Death 6 |
| large | 64 | same counts |

**Stationary** does not path. It may turn in Idle.

| Size | Cell | Animations and frame counts |
|---|---|---|
| small, medium | 32 | Idle 4, Attack 6, Death 6 |
| large | 64 | same counts |

WalkHorizontal is drawn facing right. The loader flips it for left. Do not ask the image model for a separate left strip.

Attack is the telegraph. The projectile spawns on the last attack frame, from a null the shell already has (center of the cell, biased toward the facing direction). The model cannot add nulls.

Death is the last animation. It must not loop. When it finishes, the loader kills the NPC so the room can clear.

`champion: true` is only for medium and large, and only when the description says "elite" or "champion". Champions use the engine tint. They do not get a second sheet.

## Body numbers

| Field | Small | Medium | Large |
|---|---|---|---|
| `hp` | 8–24 | 20–45 | 40–80 |
| `speed` | 0.4–1.1 | 0.35–0.9 | 0.25–0.7 |
| `collision` radius | 8–14 | 13–18 | 18–28 |
| `mass` | 3–10 | 8–16 | 14–30 |

Flying enemies use the lower half of the mass range. Stationary enemies use speed 0. Hopping speed is the hop distance factor, still inside the same clamp.

These are base floors (Basement-equivalent). The loader scales HP by floor depth. The model does not multiply HP by floor. It writes the Basement number.

Contact damage is not a free field. It is 1 for small, 1 for medium, 2 for large, applied by the shell. The hook must not raise it.

## Attacks and projectiles

One attack is the default. A second attack is allowed when the description has two distinct actions ("spits, and sometimes leaps"). More than two is cut down, with a `balance_note`.

| Field | Clamp and meaning |
|---|---|
| `cooldown_frames` | 30–120. The telegraph animation must finish inside this window. |
| `range_tiles` | 3–12. Outside this range the monster keeps moving (or idles, if stationary) and does not attack. |
| `count` | 1–6 projectiles per attack. |
| `spread_degrees` | 0–90 around the facing direction. |
| `speed` | 4–12. |
| `damage` | 1 or 2. Half hearts in a normal room, not a boss hit. |
| `flags` | At most two of `homing`, `spectral`, `piercing`, `poison`, `burn`, `slow`, `fear`. |

`weapon_mode` `tear` is a tear entity using `color`, `scale`, and either a tint or the 4-frame generated sheet. `lob` arcs and uses the same sheet. `laser` uses the monster laser shell and ignores `sprite` (always tinted by `color`).

A monster with no ranged attack sets `attacks` to one entry with `count: 0` and a contact lunge. Hopping and chasing shells can lunge by playing Attack and applying a short speed burst. Flying and stationary shells may not lunge; if the description has no shot and the shell cannot lunge, give them a single slow tear and say so in `balance_note`.

Projectiles must not spawn other monsters and must not use the player's tear profile.

## Death, gibs, and spawns

`death.animation` is always `Death` for these shells. `gib_color` tints the blood splash the shell already plays. There is no separate gib sprite job.

`death.spawn` is `none` or one allowlisted vanilla id. One entity, at the corpse, no chain. "Splits into copies of itself" is not legal on a dynamic slot, because that recurses into the same generator output and can fill the room. The balance note should offer a vanilla splitter from the allowlist instead, or no spawn.

## Sounds

| Event | Plays when |
|---|---|
| `spawn` | The NPC is added to the room |
| `attack` | The telegraph starts, not when the projectile is born |
| `hurt` | The NPC takes damage. The loader rate-limits this to once every 20 frames |
| `death` | Death animation starts |

Each event has a catalog id. `generate: true` is for a creature voice or a material sound (glass, metal, wet). The generated clip is bound to a preallocated sound slot and falls back to the catalog id if the engine still has the old bank loaded.

No music stinger on a normal monster. That is reserved for bosses.

## Replacements

`replacements` is a list of up to ten `{ "type", "variant" }` pairs copied from the list the overlay sent. The loader, when a room spawns one of those pairs, may swap it for this dynamic slot.

Rules the model must respect because the loader will enforce them:

- Do not replace bosses, mini-bosses, or shopkeepers.
- Do not replace more than ten ids.
- If several generated monsters claim the same id, the first allocated slot keeps it.
- An empty list means this monster exists only when something in the run spawns it directly (a death spawn or a test spawn). It does not roam the floor by itself.

Randomize on page 2 fills this list from ordinary room enemies on the current floor. The model does not "improve" that list.

## Behavior hook

Leave it empty unless an attack needs aiming the shell cannot do (a shot that leads the player, a hop that lands on the player's tile). Even then, prefer fields.

```lua
return {
  on_update = function(npc, frame, declared_attacks) end
}
```

The update runs once per NPC per frame. It must return quickly. It cannot loop over the whole room without a cap of 16 entities. It cannot call `NPC:Morph` into a boss.

Sanitizer or sheet failure: the slot still spawns using the shell's placeholder sheet, one contact or single-tear attack, catalog sounds, and no death spawn. A broken image must not cancel the enemy, or replacement slots would become empty rooms.

## Fallback and cleanup

Monster slots clear on `MC_POST_GAME_STARTED` and `MC_PRE_GAME_EXIT`, with their replacement claims and sound-slot bindings. A saved mod export is a later, separate action.
