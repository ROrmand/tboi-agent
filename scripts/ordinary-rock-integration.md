# Ordinary-rock removal: safety prerequisite blocked

October 25, 2026. Source-only investigation; **no rock action enabled**.
This records a blocker, not an implemented family or live acceptance.

## Concrete evidence gap

The requested attributed, one-ordinary-rock-only native mutation is not proven
by the inspected primary sources. This is not a claim that every ordinary rock
necessarily has collateral effects.

- IsaacDocs `docs/Room.md` documents `DestroyGrid(index, immediate)` returning
  boolean and affecting rocks, poop/fire and secret doors. The attributed
  `DestroyGridWithSource(index, immediate, EntityRef)` is Repentance+ tagged.
  Its presence and behavior on recorded J273/REPENTOGON dev v1.9.7.12 were not
  verified here. An uncredited fallback is unacceptable.
- Exact `GetGridEntity`/`GetType`, variant, state, collision, identity and position
  checks restrict the selected cell, not all downstream native effects.
  `GetDungeonRockIdx` and `GetTintedRockIdx` have signatures without exhaustive
  hidden-ladder exclusion guarantees. `GetGridPosition` returns positions even
  for invalid indices. Rock state 2 denotes rubble, not an exhaustive whitelist
  of safe live states, variants or unknown flags.
- Local REPENTOGON revision `e2c5aecacbbb83bb5938cfa89c0a58b78e616a36`,
  `repentogon/LuaInterfaces/CustomCallbacks.cpp:3446`, calls native `super`
  before the post-destroy callback. The native implementation is not supplied.
  `LuaInterfaces/GridEntities/LuaGridEntityRock.cpp` exposes `SpawnDrops`,
  `TrySpawnWorms`, `TrySpawnLadder` and `UpdateNeighbors`. These do not prove
  every destruction calls them, but do not prove exclusion for this subset.
- That checkout's `docs/docs/GridEntityRock.md` documents neighbor changes on
  destruction/lifting for multipart variants 1000+. Excluding those variants
  is necessary, not an exhaustive ordinary-variant safety proof.
- `repentogon/Patches/MiscFixes.cpp:181` guards `TrySpawnLadder` only for
  curse-mist/mineshaft rooms, otherwise calling native `super`. That is not a
  general no-crawlspace guarantee. No attributed no-secondary-effects mutation
  or pure preflight side-effect predictor was verified.

Primary online sources inspected: Wofsauge/IsaacDocs `docs/Room.md`,
`docs/GridEntity.md`, `docs/GridEntityRock.md`, `docs/GridEntityDesc.md`,
`docs/enums/GridEntityType.md`. Local sources above and
`libzhl/functions/GridEntityRock.zhl` were inspected; the latter supplies binary
signatures, not the missing native implementation. No binary/game/save
inspection occurred. Mocking that missing behavior cannot settle this blocker.

## Reachable design, not shipped

If native evidence resolves these gaps: one shared `power.rock_breaking` for
nondamaging terrain removal, count fixed 1, radius 20-80, proposed flat weight 4.
Use bounded deterministic scan and distance/index tie-break. Reject unknown
state/flag/variant, every nonordinary type, tinted/dungeon index and multipart
candidate. Acquire original-owner EntityRef before probability/latches in pure
preflight; revalidate exact candidate immediately before guarded mutation.

Observe destruction after the protected call even if a downstream callback
throws. Only actual success consumes cooldown and owner-wide cross-source
room-visit quota. Continue must preserve quota; source loss must not replenish
it. Explicit validated persistence/migration and genuine transition reset are
required, not a profile condition. Current code promises no such rock quota.

Do not substitute tear acid flags, explosions, direct state/collision writes,
`RemoveGridEntity`, `Room:Update`, broad suppression, or deleting drops/ladders
after irreversible mutation. Those broaden scope, lose attribution or confuse
post-hoc repair with prevention. No success/quota/Continue/co-op/callback-error
production matrix is fabricated for an action that was never enabled.

SulfuricAcid463Q2, Terra592Q3, Leo302Q1 and ThunderThighs314Q1 remain reuse
witnesses, not native safety proof; CrackedOrb675 is corroboration only.
No curated prior, inventory, runtime/catalog version or generated metadata
changes are warranted. Parent should adjust acceptance matrix count only if
the action actually lands; it has not landed here.

## Offline validation

Measured results/artifacts are appended to the main plan checkpoint.
`bridge/ordinary-rock.test.mjs` locks absence in Node, production Lua profile
validation, semantic catalog, Creator and planner. These negative tests do not
prove any native mutation safe. Full-goal and live acceptance remain blocked.
