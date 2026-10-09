# Live Profile Item Demo

This REPENTOGON test contains one real custom collectible: **Live Profile
Core**. Its ID and base definition are registered only at Isaac startup through
`content/items.xml`. Runtime commands never create IDs or modify a global
`resources/items.xml` file.

## What it tests

`agent switch #` changes the active profile in a running game:

| Command | Profile | Live behavior while held |
| --- | --- | --- |
| `agent switch 1` | Ember | +0.75 damage; animated orange tears that burn enemies |
| `agent switch 2` | Verdant | -1 fire delay (tears up); animated green tears that poison enemies |
| `agent switch 3` | Void | +40 range and +2 luck; animated purple tears that inflict fear |

The command also changes the uncollected pedestal sprite and the custom item
icon rendered below the minimap while the item is held. Three predeclared WAV
sounds provide switch confirmation and a rate-limited firing cue. The tears
retain Isaac's native single-tear animation and receive their profile color at
fire time. Leaving and re-entering the pedestal room reapplies the selected
sprite.

## Test procedure

1. Close Isaac, copy this directory to `mods/live_sprite_swap_demo`, and start
   Isaac through the REPENTOGON Launcher.
2. Start a new run. After roughly one second, the custom pedestal appears next
   to Isaac as Ember.
3. Use the in-game console (`\`) to run `agent ping`, then collect **Live
   Profile Core**.
4. Run `agent switch 1`, fire at an enemy, and confirm orange custom tears,
   burn, and the Ember sound. Repeat for `agent switch 2` (green/poison) and
   `agent switch 3` (purple/fear). Only tears fired after each switch use the
   new profile.
5. Confirm the icon below the minimap changes with each selected profile and
   the HUD stats change: Verdant improves tears; Void increases range and luck.
6. Use `agent state` to print the current profile and registered item ID.

The item and sound IDs are registered at startup. The current profile can be
changed live; a newly generated item, tear animation definition, or sound ID
cannot safely be registered mid-run.
