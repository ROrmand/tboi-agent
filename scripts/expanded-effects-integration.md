# Milestone 3: bounded reusable effect families

Production integration completed in the shared checkout October 25, 2026:
strict Node/Lua schemas, generated metadata, weights, summaries, prompt guidance,
fixed runtime dispatch, success-based expanded-action commits, recursion guards,
ownership/caps, lifecycle hooks, and atomic cooldown restore. Eight product
integration regressions complement the standalone module tests. The source
deployment allowlist includes both runtime and metadata; no installed-mod sync,
live Isaac run, or live acceptance was performed. The checklist below remains
the design contract, not a claim that its live-game release gates have passed.

## Delivered contract and API

- content-contract/expanded-effects.json is the authoring registry: eight fixed
  types, all required fields, explicit trigger allowlists, bounds, positive budget
  weights, and one valid generation example per family. Numeric times are frames.
- bridge/expanded-effects.mjs exports expandedEffects, expandedActionTypes,
  expandedActionSchemas (per type), expandedActionSchema (anyOf),
  validateExpandedAction(action, trigger) (empty error array means valid),
  expandedActionWeight(action), and summarizeExpandedAction(action). Invalid
  weights/summaries throw. No arbitrary engine flags, entity IDs, code or callbacks
  are accepted in action JSON.
- include("expanded_effects") returns the Lua module. Its pure functions are
  validate(action, trigger, catalog), weight(action, catalog), and
  summary(action, catalog); invalid inputs return false/nil/nil respectively.
- Module.new(deps, catalog) creates one runtime for the entire generated-item run,
  NOT one per profile/player. Share it so the global actor ceilings are meaningful.
  The catalog is the decoded canonical JSON object, including version=1.
- Returned runtime exposes DOT-call canRun(profile, player, action, effectKey,
  event) and COLON-call :run(profile, player, action, effectKey, event). Both
  return booleans. profile can be the existing profile with index or its stable
  tostring(index). deps.owns receives the normalized string, never the table.
  Do not use wish/name strings or transient entity IDs as profile identity.
- Runtime also exposes :suppressed(entity), :tick(), :removeEntity(entity), :clearActors(),
  :cleanup(profileOrSourceOrNil, ownerOrNil), :snapshot(), and
  :restore(saved, resolveOwnerByInitSeed). cleanup() removes all actors/state;
  cleanup(profile, player) affects only that source/owner pair.
  `:suppressed(entity,true)` is a pure ancestry inspection for dependency
  predicates executing inside the module's own guarded apply phase; callback
  entry points must use ordinary suppression, including the synchronous guard.

## Mechanics (intentionally distinct from existing actions)

| Type | Supported contexts | Semantics and hard ceilings |
| --- | --- | --- |
| execute_enemy | enemy_hit, tear_impact, collision | One ordinary vulnerable nonboss event target at/below 5-20% observed current/max HP. Reject mortal buffered damage, links, allies, invalid getters and unavailable credited EntityRef. KillWithSource only; observed IsDead establishes actual success, including death followed by callback error. Cooldown 90-1800 after observed death. See execution-integration.md for the full safety and acceptance contract. |
| extra_tears | tear_fire, active_use | 1-6 plain BLUE tears; cone spread 0-90 degrees or evenly spaced ring, speed 4-12, fixed damage 0.5-3. No player tear-flag inheritance. 12 live tears per owner across sources, 64 globally; removed at age 90. Cooldown 30-1800. |
| target_impulse | enemy_hit, tear_impact, collision | Set the hit non-boss hostile NPC velocity to a push/pull vector of magnitude 1-8. Does not add to existing velocity, deal damage, or alter the owner/other players. Cooldown 15-1800. |
| block_projectiles | player_hurt, active_use | Immediately remove at most 1-4 hostile projectiles within radius 20-100 of the triggering owner. No persistent shield, reflection, damage cancellation, or invulnerability. Empty scans fail. Cooldown 90-1800. |
| reflect_projectiles | player_hurt, active_use | Return at most 1-4 ordinary unflagged hostile bullets within radius 20-100 as plain BLUE player-owned tears at speed 4-12 and fixed damage 0.5-3, opposite their incoming velocity. Requires variant/subtype/flags zero and finite nonzero velocity. Shares the 12-owner/64-global secondary-tear cap and 90-frame lifetime with extra_tears. Cooldown 90-1800 after actual success. No lasers, special flags, native Deflect ownership assumptions or original-hit cancellation. |
| dash | active_use | One normalized movement-direction velocity assignment at speed 4-10. No teleport, grid bypass, contact damage, persistent speed state or invulnerability. Zero input fails. Cooldown 60-1800. |
| coins_to_charge | room_clear, active_use | Pay 3-15 coins for up to 1-2 NORMAL primary-active charges, capped to its config maximum (1-12); full/empty/unknown/timed/special actives fail. A partly empty charge meter still pays the full cost. Debit/grant is checked and rolled back on synchronous API failure. No batteries or pocket slots are touched. Cooldown 90-1800. |
| temporary_ally | room_clear, active_use | One charmed POOTER variant 0, 30-300-frame lifetime; charm lasts lifetime+1, entity removed at lifetime before charm expires. 2 live allies per owner across all sources, 16 globally. Cooldown 150-1800. |

Existing spawn_creep, refill_charge, convert_resource, spawn_friendly and the
persistent shield familiar already cover related behavior. These new types add
projectile geometry, directional displacement, immediate bounded blocking,
a no-invulnerability dash, paid active charge conversion, and expiring allies
rather than duplicating those existing action meanings.

## Parent integration order

1. Load catalog metadata without adding a new top-level main.lua local (the
   main chunk is near Lua's local-variable limit). Keep references on combat:

   combat.expandedModule = include("expanded_effects")
   combat.expandedCatalog = <decoded canonical registry>
   combat.expandedEffects = combat.expandedModule.new(<deps below>, combat.expandedCatalog)

   Have the parent metadata generation step embed the JSON as a Lua long-string
   passed to the existing json.decode, or emit its equivalent table in generated
   metadata. Do not try to open a repository-relative JSON path from Isaac.
   Generate from the registry, never maintain another hand-copied bounds table.
   Include expanded_effects.lua (and any generated metadata) in bridge/sync-mod.mjs
   and test the deployment allowlist; creating the source alone does not ship it.

2. Add allowlisted types/parameters to capabilities and the generation guidance.
   Replace/extend the shared action schema with the eight per-type schemas. They
   deliberately have NO amount field: count, damage, charge and duration have
   distinct meanings. If using a flat shared schema, make amount optional at
   that outer shape, include every new field, and early-dispatch expanded types
   to the strict expanded validator BEFORE legacy amount/allowedKeys checks.
   Keep legacy amount required in legacy per-type validation. Each new action
   must retain its own required fields and reject every unrelated parameter.
   Use validateExpandedAction for rules AND on_kill/tear_impact/collision entry
   points; on_kill and death remain incompatible with all these eight actions.
   No compatibility should be inferred from the family name.

3. Route action weights and summaries through the new functions before legacy
   dispatch. Lua must call expandedModule.weight/summary with the same catalog.
   Add the expanded action cost once to the existing rule/proc budget; retain
   existing trigger/condition multipliers, but do not discount it again because
   the action has its own cooldown. Base + sum(parameter * parameter.weight)
   is the entire standalone cost. Use the registry examples in generation
   prompts. Do not clamp or silently strip invalid saved action fields.

4. Build an event with owner=the exact triggering player, trigger=context name,
   source=the actual damaging/fired entity (when present), target=the hit NPC
   for target effects, and velocity=tear.Velocity for tear_fire / the owner's
   GetMovementInput() for active-use dash. For active-use cones choose the
   owner's nonzero firing direction explicitly; absent/zero directions fail
   rather than inventing an aim. Room-clear needs owner+trigger only.
   The existing tear_fire producer currently omits event data: extend it.
   Do not fan an owner's event out to other co-op owners.

5. Before ruleMayRun creates/mutates state, draws probability RNG, or commits
   cooldowns/latches, call expandedEffects.canRun(profile, player, action,
   effectKey, event) for EACH expanded action. The key MUST match the subsequent
   :run call (existing rule:<ruleIndex>:<actionIndex> and proc:<actionIndex>
   patterns work). This pure preflight checks action cooldown, owner, event,
   resource/output availability, actor caps, target and movement requirements;
   it does NOT tick, spawn, spend, advance cooldown, roll RNG or touch profile
   condition state. Parent must aggregate costs for a list containing multiple
   paid conversions (including legacy convert_resource consuming coins).
   Individual action preflights are not a multi-action resource reservation.
   Keep selected condition/latch writes pending until at least one action
   actually succeeds; an all-failed action list must not spend parent cooldowns
   or once-per-* latches. :run rechecks availability and commits only its own
   cooldown on true. Pure canRun is necessary, but an engine failure between
   preflight and apply still requires success-based parent commits.

6. Call :run before legacy runAction dispatch and propagate its success result.
   Parent active-use return Discharge/ShowAnim must depend on actual success,
   not merely the presence of an eligible action. Do not make block_projectiles
   return false from a damage callback: it blocks shots, not the original hit.
   Never add damage cooldowns/invulnerability for dash or projectile blocking.

## Required dependency implementations

All function dependencies are explicit and constructor-checked; the module has
no hidden Isaac globals. Put these fields on the dependencies passed to new:

- frame(): Game():GetFrameCount(). Must use the game frame clock, not wall time.
- owns(sourceString, player): find the current accepted runtime profile by stable
  index, require running/not blocked, require that exact player to possess that
  source collectible. An owner dying/disconnecting, a removed source, a rejected
  restore and a transformed/replaced generated item must return false.
- vector(x,y): Vector(x,y); entityRef(player): EntityRef(player).
- spawn(type,variant,subtype,position,velocity,spawner): a fixed safe spawn
  adapter. Prefer Game():Spawn(type,variant,position,velocity,spawner,subtype,
  math.max(1, Random())) so a random zero seed cannot reach entity RNG. The
  module only requests ENTITY_TEAR/BLUE and ENTITY_POOTER/0, with subtype 0.
  No profile may choose an engine entity enum or a seed.
- enums: {tear=EntityType.ENTITY_TEAR, blueTear=TearVariant.BLUE,
  pooter=EntityType.ENTITY_POOTER, primarySlot=ActiveSlot.SLOT_PRIMARY}.
- isEnemy(entity): require a vulnerable hostile NPC, not a charmed/friendly
  entity, not a player/familiar. Do not reuse a broad IsEnemy-only predicate
  without explicitly excluding friendly/charmed flags. Bosses are also refused
  in the handler itself.
- projectiles(): Isaac.FindByType(EntityType.ENTITY_PROJECTILE).
- isHostileProjectile(projectile): require a real hostile projectile; exclude
  ProjectileFlags.CANT_HIT_PLAYER and projectiles from friendly/charmed NPCs,
  players or generated allies. Do not treat every ENTITY_PROJECTILE as hostile.
- chargeLimit(itemId): use Isaac.GetItemConfig():GetCollectible(itemId), return
  MaxCharges ONLY for an explicitly allowed NORMAL charge-type active; return
  nil for absent, timed, special, zero-max, or unknown configs. Deny custom
  actives with nonstandard charge semantics rather than guessing. The handler
  additionally bounds the returned integer to 1-12.
- withGuard(callback): increment existing combat.depth, pcall the callback,
  decrement combat.depth even on error, then return its result or rethrow.
  Function-scoped locals inside this adapter do not consume main chunk locals.
  This external guard is mandatory: native spawn/init callbacks can occur
  BEFORE the newly spawned entity receives its secondary marker.

## Recursion, ownership and lifecycle hooks (required, not optional)

- At the START of MC_POST_FIRE_TEAR, MC_POST_TEAR_UPDATE, MC_PRE_TEAR_COLLISION,
  and damage/kill proc routes, test expandedEffects:suppressed(actualSource).
  Also test it in generated bomb/laser/knife/secondary emission routes before
  copying owner metadata or allowing any existing action to run. With no source,
  :suppressed(nil) still blocks synchronous generated callbacks via depth.
  Damage source is source.Entity, NOT the victim. A kill should use its actual
  source, not stale pre-damage attribution; clear/ignore generatedDamageOwner
  for marked secondary damage so a later kill cannot replay it as primary.
- GetData().expandedSecondary carries source and owner seed for generated tears
  and allies. :suppressed traverses both SpawnerEntity and Parent ancestry with
  a depth/loop fail-closed guard; this covers ally projectiles and descendants.
  Never copy/clear the marker or add secondary generatedTearSources. Existing
  callbacks must opt out as well; checking only the new action runner is not
  sufficient to prevent recursion through old actions.
- Call :tick() once per update even with no relevant event. It removes expired,
  dead, disconnected-owner and source-lost actors and prunes expired cooldowns.
  Spawn caps count still-live owned actors across all source profiles. Secondary
  NPC projectiles remain engine-managed; they do not recursively create module
  actors or effects. Runtime-owned direct actors never exceed 64 tears + 16 allies.
- MC_POST_ENTITY_REMOVE: call :removeEntity(entity) BEFORE the existing familiar
  early return, so unrelated removal cannot leave a cap slot occupied. Removal
  callbacks may reenter; the module untracks before explicit Remove calls.
- Source loss/replacement: :cleanup(profile, player). Run teardown, rejected
  restoration, new run: :cleanup(). Cleanup must happen before
  the existing runtime/profile tables are discarded. Room transition:
  :clearActors(), which removes direct actors but preserves action cooldowns.
  Persistent run/floor condition latches remain the parent's concern.
- Save :snapshot() beside the existing run payload. It contains only source,
  owner InitSeed, effect key and remaining cooldown frames, never entities,
  functions, condition latches or absolute frame times. On a compatible Continue,
  validate ALL profiles first, resolve current players by InitSeed, then call
  :restore(savedExpandedCooldowns or {}, resolveOwner) on a fresh empty runtime
  before running effects. restore rejects malformed, duplicate, over-4096-entry,
  stale-source, unknown-owner or over-1800-frame state atomically. A false result
  must use the existing fail-closed whole-restore/save-preservation path.
  Old saves without this optional field restore an empty expanded state. Actors
  are transient and never recreated from saves. Do not serialize the runtime
  object or write a partially restored snapshot over a rejected save.

## API evidence checked October 24, 2026

Local primary REPENTOGON source/docs inspected:

- .reference-repentogon/repentogon/LuaInterfaces/Entities/LuaEntityPlayer.cpp:
  Lua_PlayerGetActiveCharge and Lua_PlayerSetActiveCharge confirm slot arguments,
  integer charge values, and exact SetActiveCharge(charge, slot) order.
- .reference-repentogon/libzhl/functions/Entity.zhl: AddCharmed source+duration.
- .reference-repentogon/libzhl/functions/EntityTear.zhl: tear flags are settable.
- .reference-repentogon/repentogon/resources/scripts/enums_ex.lua: ChargeType
  NORMAL=0, TIMED=1, SPECIAL=2.
- .reference-repentogon/docs/docs/Isaac.md: FindByType(type,variant,subtype).

Primary Lua API reference pages also checked for signatures/semantics:

- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#addcharmed
- https://wofsauge.github.io/IsaacDocs/rep/EntityPlayer.html#setactivecharge
- https://wofsauge.github.io/IsaacDocs/rep/EntityTear.html#tearflags
- https://wofsauge.github.io/IsaacDocs/rep/Game.html#spawn
- https://wofsauge.github.io/IsaacDocs/rep/ItemConfig_Item.html#chargetype
- https://wofsauge.github.io/IsaacDocs/rep/ItemConfig_Item.html#maxcharges
- https://wofsauge.github.io/IsaacDocs/rep/enums/ProjectileFlags.html

## Automated acceptance (not live acceptance)

### Reflection integration and save safety

reflect_projectiles is an explicit bounded return primitive, not a wrapper
around native Deflect. It converts only moving ordinary unflagged hostile
projectiles into plain tears with the triggering player as spawner. Reversal
uses incoming direction and the configured speed; damage and tear flags are
set explicitly. The enemy bullet is removed only after tear setup succeeds.
An unavailable spawn, failed conversion or unsuccessful removal leaves that
bullet intact and removes the tentative tear. If an earlier return succeeds
and a later one fails, successful returns remain and start the cooldown.
Allocation attempts also stop at count, including unsuccessful attempts.
Return tears inherit secondary-source suppression, owner/global tear caps,
expiry and source/room cleanup. There is no protection from the original
player_hurt event, no continuous shield and no laser or special-flag support.

The distinct power key is power.projectile_reflection. It is not interchangeable
with power.projectile_blocking, even though both remove an enemy bullet. A
new sorted power key changes compact history bit positions, so the ledger
contract is now version 3 and the loaded runtime contract is 15. Older live
snapshots are rejected rather than decoded under a different key ordering.
Existing profile-based saves rebuild their ledger on Continue; no stored
profile or save is migrated or overwritten by a failed validation. Deliberate
source sync and a restart are required before generating against the new
contract; changing source files does not update an already running game.

### Commands

Run from repository root:

    node --test bridge/expanded-effects.test.mjs native/ipc/expanded-effects.test.mjs

Tests execute the actual module with Wasmoon, not a translated simulation.
Coverage includes Node/Lua parameter-boundary parity, strict missing/extra fields,
unsupported triggers, schema parity, weights/summaries, synchronous callback and
ancestry recursion, success-only and per-owner/source/action cooldowns, pure
preflight, cone/ring geometry, hostile-only blocking, boss/friendly immunity,
zero-vector movement, paid/capped charge conversion with rollback, summon/tear
caps, external removal, expiry, source loss, co-op isolation and atomic save
cooldown restore. Mocked engine behavior is NOT proof of live-game acceptance.

After parent wiring, add full-runtime tests through actual rule/proc/active
entry points (including RNG/latch non-consumption), run the broader existing
suite, and deliberately sync/restart to perform a separate live acceptance gate.
