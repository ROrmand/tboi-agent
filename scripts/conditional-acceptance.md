# Conditional expansion live-session runbook

This is an operator checklist, not completed evidence. The 721-item runtime
inventory is available; no live condition/effect/lifecycle cases are accepted.
The checker derives the current case and scenario totals from the registries;
use its report rather than a historical matrix count.
No installation, item enumeration, or terminal commands are required from the
user for the offline audit review.

## Safe session setup

Current user restriction: **Do not touch Save File 1.** The authorized sync
copies only the mod manifest, never saves. For live play the operator must
select Save File 2 or 3 before starting the disposable run; do not start or
continue File 1, change its unlocks, restore it, or overwrite its mod data.
Sync completion alone does not authorize selecting a save slot automatically.

1. Coordinate an uninterrupted disposable Isaac session with the user. Do not
   replace a wanted run, alter unlocks, or change enabled mods without consent.
2. Verify the running game/REPENTOGON versions and active mod list. Reload the
   synced capture-only safety update before running any audit command. Do not
   use the earlier dynamically registered SaveData exporter again.
3. Preserve existing saves before any deliberate gameplay testing. The earlier
   audit payload landed in better donation machines/save1.dat; do not delete,
   restore, or overwrite that file without finding a verified backup and
   coordinating recovery with the user. The runtime JSON is already preserved.
4. Use the real production rule/effect path for test profiles. Record setup,
   expected behavior and actual observation for each case; offline mocks and
   debug-only direct handler calls cannot establish production integration.

## Condition groups: 37 required cases

Each condition has a separate case named condition.<registry name>. Derive the
authoritative names and parameters from content-contract/conditions.mjs and
the shared capability registry, not this grouping. Test both a satisfying and
a failing state; for thresholds include the exact boundary and a neighboring
value. Record missing prerequisites as blocked, not passed.

- Probability and latches (6): chance, luck_chance, once_per_room,
  once_per_floor, once_per_run, once_per_target. Check state consumption only
  after a successful eligible effect; room/floor/Continue resets must match scope.
- Health, resources and slots (9): hearts_at_most, hearts_at_least,
  red_hearts_at_most, red_hearts_at_least, soul_hearts_at_most,
  soul_hearts_at_least, empty_red_hearts_at_least, resource_at_most,
  resource_at_least. Include special-character health and actual co-op owner.
- Active slots (1): active_charge_at_least. Check occupied versus empty slots,
  normal plus battery charge, and explicitly named primary/secondary/pocket slots.
- Room/run (6): room_kind, first_visit, room_clear_state, stage_at_most,
  stage_at_least, difficulty_kind. Do not infer state from trigger names.
- Player state/ownership (8): curse_active, while_moving, while_firing,
  while_grounded, while_flying, character_kind, has_collectible, has_familiar.
  Compare engine capability/ownership with the bounded registry semantics.
- Target/damage/weapon (7): target_is_boss, target_is_champion,
  target_health_at_most, target_health_at_least, target_has_status,
  damage_at_least, weapon_kind. Verify callback target/source attribution and
  targetless failure without committing chance, cooldown or latch state.

## Bounded effects

- extra_tears: count/geometry, actor cap and secondary-tear recursion suppression.
- execute_enemy: one ordinary vulnerable nonboss event target at the observed
  inclusive HP threshold; reject bosses, allies, linked targets, mortal buffered
  damage and invalid HP/source getters before RNG. No-op or removal without
  death must not commit cooldown/latches. Observed death must commit even if a
  downstream callback throws. Check credited source and actual co-op owner.
- target_impulse: push/pull direction, target eligibility and bounded magnitude.
- block_projectiles: hostile-only eligibility, cap and friendly-projectile safety.
- reflect_projectiles: only moving ordinary hostile projectiles (variant/subtype/flags
  all zero) return as plain owned tears. Check reversed direction, bounded speed,
  damage/radius/count, shared tear cap, co-op owner and descendant suppression.
  Failed spawn/removal leaves unreturned bullets intact; partial success commits
  only actual returns. Special projectiles and lasers stay untouched. A hurt
  trigger is post-confirmation and does not prevent the original damage.
- dash: movement/input direction, bounded distance and invalid-direction failure.
- coins_to_charge: occupied normal-charge slot, affordable cost, correct charge
  gain and no spending when the action cannot run.
- temporary_ally: owner, actor cap, timeout, room cleanup and source removal.

## Lifecycle/generation: 18 required cases

Record lifecycle.co_op, lifecycle.continue, lifecycle.source_removal,
lifecycle.reroll, lifecycle.piercing_multihit, lifecycle.simultaneous_kills,
lifecycle.weapon_tear, lifecycle.weapon_bomb, lifecycle.weapon_laser,
lifecycle.weapon_knife, lifecycle.weapon_familiar, lifecycle.creator,
lifecycle.generator_q0, lifecycle.generator_q1, lifecycle.generator_q2,
lifecycle.generator_q3, lifecycle.generator_q4, and lifecycle.singularity.

Check owner isolation; save/load reconstruction; source cleanup; prevention of
duplicate on-hit/on-kill delivery; and accepted-profile ledger updates exactly
once. Generator/Creator/Singularity observations must traverse their respective
production entry points. One live generated item is not a diversity batch pass.

## Record and validate observations

Store real observations in work/conditional-acceptance/live.json as an object
with an observations array. Each observation requires case, game_version,
repentogon_version, character, trigger, expected, observed, recorded_at (actual
UTC timestamp), and passed (boolean). Keep failure observations; do not replace
them with fabricated passes or prefill the array from the registry.
Use an actual ISO timestamp with date and time through seconds, optional 1–3
fractional digits, and an explicit Z or +00:00 UTC suffix. Date-only values,
local times, impossible calendar dates and future observations are rejected.

Condition observations also require a scenario: satisfying or failing. For
comparison predicates whose names end in _at_most or _at_least, additionally
record boundary and adjacent scenarios. Satisfying means an interior eligible
state, failing an ineligible state, boundary the exact inclusive comparison
limit, and adjacent a representable neighboring value across that limit.
For chance predicates use controlled chance parameters and record the actual
setup; for latches include the first eligible event and a repeated gated event.
A failing scenario is a successful test of rejection, so passed is true only
when the actual observed result matches the expected rejection.

The version-2 report exposes scenario_requirements and missing_scenarios. A
condition counts as observed only after all its required scenarios are present;
duplicate positive observations cannot replace a negative or boundary check.
Effects and lifecycle cases use behavior (implicit when scenario is absent);
their expected/observed text must still cover the specific runbook checks.
Older single-observation condition records do not establish full acceptance.
No real observation is generated or backfilled by this schema change.

Run node scripts/conditional-acceptance.mjs to validate completeness. The report
also rejects failures and invalid timestamps, but cannot authenticate evidence.
Screenshots/logs should support the observed text where available.


## Explosion protection and weapon-tint checks

New familiar generation is vaulted; do not treat legacy familiar compatibility
as live acceptance of the broken familiar runtime. The existing familiar
acceptance case remains outstanding rather than being silently removed.

- lifecycle.explosion_immunity: on disposable Save File 2/3, hold a standalone
  immunity item. Check explosion rejection, normal contact/projectile damage,
  co-op nonowners, Continue, item removal and reroll. Protection must stop as
  soon as no qualifying item is owned, without consuming shield cooldowns.
- lifecycle.explosive_tear_safety: generate explosive tears without separately
  rolling immunity. Check nearby blast protection, enemy damage, mixed flags,
  Continue and source loss. This includes preexisting saved explosive profiles.
- lifecycle.weapon_tint: verify clearly colored knives and lasers, additive
  weapon damage without accumulation, no co-op tint leakage, native damage
  recalculation, and tint expiry after source loss.

## Separate pickup investigation

Follow scripts/pickup-probe/README.md in a deliberate developer wrapper.
pickup_kind remains disabled and is not one of the 37 admitted conditions.
Collision, pickup disappearance, animation and inventory deltas alone do not
establish authoritative acquisition or co-op ownership. Preserve raw diagnostics
and settle the production event contract before enabling this condition.


## Repeatable combat and health-safety checks

Use disposable Save File 2/3 only. Do not select, modify or restore Save File 1.
Restart Isaac and the bridge manually after the patched runtime is synced;
old processes do not reload the new contract automatically.

- lifecycle.repeatable_luck_procs: test status effects on several distinct
  impacts/kills in the same room, first at low luck, then higher luck. Confirm
  multiple successful applications without a once-per-room latch or a status
  proc cooldown. One engine event must not run twice. Status duration is still
  measured in frames; duration is not an activation cooldown. Explicit native
  effect safety cooldowns and recursion guards remain intentional.
- lifecycle.summon_accumulation: repeatedly trigger blue fly/spider summons
  during an uncleared combat room. Confirm multiple helpers, enemy damage,
  bounded accumulation and correct cleanup/source removal without co-op owner
  leakage. Custom generated familiars remain vaulted; native helpers are not
  the custom-familiar system.
- lifecycle.friendly_creep: confirm visible puddle lifetime, enemy damage or
  the described slowing behavior, multiple distinct activations and live cap.
  Walk both the owner and a co-op nonowner over each supported puddle color;
  neither should take creep damage. Verify cleanup on room/source changes.
- lifecycle.health_safety: verify actual stat increases and positive half-heart
  rewards on pickup. At very low health, acquiring an old negative-health
  profile must not reduce red, soul, black or total health. New profiles with
  negative health must be rejected before publication. No saved game may be
  edited to construct this test; use a deliberately isolated developer fixture.

Also inspect the displayed weapon bonus: it must state that existing weapons
are required, not promise to grant a knife/laser. Automatic rewards must be
useful without owning such a weapon, and the stated damage bonus must match
actual engine damage. Record observations, not just the absence of log errors.
