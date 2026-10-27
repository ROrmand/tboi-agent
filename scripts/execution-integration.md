# Bounded single-target execution integration

Implemented October 25, 2026. Automated integration evidence only; parent review
and live acceptance remain separate. The independently reviewed shortlist and
inventory provenance are in vanilla-audit/execution-review.md. That shortlist
does not establish low-health execution equivalence or an execution frequency.

## Primary API evidence and design decisions

Fetched the primary Entity and callback documentation during implementation:

- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#hitpoints
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#maxhitpoints
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#hasmortaldamage
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#isboss
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#isactiveenemy
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#isenemy
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#isvulnerableenemy
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#isdead
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#kill
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#killwithsource
- https://wofsauge.github.io/IsaacDocs/rep/Entity.html#parent
- https://wofsauge.github.io/IsaacDocs/rep/enums/ModCallbacks.html#mc_post_entity_kill
- https://repentogon.com/enums/ModCallbacks.html#mc_post_entity_take_dmg
- https://repentogon.com/enums/ModCallbacks.html#mc_post_entity_kill

HP changes on the subsequent frame; mortal damage describes lethal buffered
damage. Consequently the threshold is strictly observed current/max HP. Never
subtract event damage, predict pending HP, or claim a natural lethal hit as this
action. Active-enemy/vulnerability/hostility checks narrow eligibility; IsBoss
must explicitly return false. Parent/Child links are conservatively excluded
because the API documents multipart relationships. KillWithSource accepts an
EntityRef, unlike uncredited Kill. IsDead, not removal, establishes the outcome.
The callback docs distinguish the kill callback from a final outcome query and
document REPENTOGON's credited KillSource and post-damage callback arguments.

These sources justify API selection, not undocumented guarantees that every
engine entity dies synchronously. If death cannot be observed immediately,
the action reports no success. There is no asynchronous prediction or polling.

## Authoring and eligibility contract

- Action: execute_enemy; family: target. Required fields are type, hp_ratio,
  cooldown, with no additional fields or legacy amount.
- hp_ratio is finite and inclusive from 0.05 to 0.20; cooldown is an integer
  from 90 to 1800 frames. Weight is 3 + 10 * hp_ratio. Example: ratio 0.15,
  cooldown 120. Summaries explicitly say observed current/max HP and nonboss.
- Only enemy_hit, tear_impact and collision are admitted. Only the normalized
  owned event target is inspected or killed: no room scan, boss damage fallback,
  native item invocation, stat relabel, enemy-type erasure or roomwide kill.
- Exists/IsEnemy/IsActiveEnemy(false)/IsVulnerableEnemy must return true;
  IsDead/IsBoss/HasMortalDamage must return false. Require ToNPC, GetData table,
  callable KillWithSource and known positive integer friendly/charm enums;
  HasEntityFlags must explicitly reject both flags. Missing, throwing or
  malformed eligibility methods, HP, max HP or source references fail closed.
- HP and max HP must both be finite and positive, current must not exceed max,
  and current/max must not exceed hp_ratio. Linked and expanded-secondary
  targets/ancestry are rejected. Existing ownership, source suppression,
  source/owner/action cooldowns and bounded state-capacity guards still apply.

## Preflight, callback ordering and actual success

Pure canRun validates both target eligibility and a credited EntityRef whose
Entity is the triggering player, before condition RNG or successful-effect
latches. It does not kill, spawn, change HP, allocate actors or commit state.
The handler repeats target/source checks, including revalidation immediately
before mutation, inside both the module and main combat guards.

enemy_hit rules containing execution use only the existing confirmed
onPostEntityTakeDamage route, even without damage_at_least. They do not run
from the pre-damage callback where the incoming mortal buffer is not settled.
No fallback to pre-damage execution is provided when that callback is absent.
Tear impact and player collision remain their normal owned target callbacks.

The sole mutation is target:KillWithSource(EntityRef(player)). After the call,
always attempt IsDead, even if the protected call reports an error. Newly
observed boolean true means irreversible actual success, so cooldown and parent
latches commit even when a downstream callback threw after death. An error
before death, no-op, removal alone, nonboolean result or failed death query is
not observed success and commits no action cooldown. This refines the earlier
review note's blanket error wording: an exception cannot undo an observed death.
No silent Kill, Remove, HP assignment or TakeDamage fallback exists.

Synchronous attributed and unattributed kill callbacks are suppressed under
the existing expanded/combat guards; they cannot chain generated on-kill rewards
or reenter execution. Guards unwind even on callback errors. Successful action
cooldowns survive room/floor cleanup and Continue, using the existing atomic
snapshot/restore path. Source loss and owner/source isolation remain unchanged.

## Semantic and compatibility integration

Runtime contract16, capabilities10, compact power ledger4. Adding the sorted
power.execution key changes bit positions, so older ledger snapshots are
rejected, not decoded under a changed ordering. Existing profile saves rebuild
the ledger on Continue through normal validation; no user save was changed.
The shared catalog generates Lua derivation and covers every trigger/threshold
as one power. There are now eight actions in six families and 47 power keys.
Planner skeletons use the actual action; Creator execution words request that
power. Generator/Singularity do not get Creator's explicit repetition override.
The curated selection-priors.json and reviewed mappings are unchanged;
execution is neutral (1) at every quality. No audit inventory/report regeneration.

## Automated evidence

Repository-local artifacts, all from the final implementation:

- work/power-diversity/execution-focused.tap: 36/36 Node/Lua checks pass.
- work/power-diversity/execution-production.tap: 3/3 production callback checks
  pass, covering enemy_hit, tear_impact, collision, buffered HP above/boundary,
  mortal-buffer rejection, source-reference failures before RNG, no-op/error/
  removal, death followed by callback error, synchronous attributed/unattributed
  on-kill suppression, parent latch/cooldown commit, room change and Continue.
- work/power-diversity/execution-integration.tap: 59/59 planner, design, power
  context, neutral/reviewed priors, compatibility and server integration checks.
- npm test: 516 tests, 493 pass, 23 fail. The final artifact is
  work/power-diversity/execution-regression.tap. This includes the parent's four
  added acceptance-verifier tests. Failure names exactly match both the UTF16LE
  .test-power-history-final.txt and selection-priors-regression.tap baselines:
  no added or removed failures. Machine comparison:
  work/power-diversity/execution-failure-comparison.json.
- Metadata freshness checks pass as part of npm test. Generated only repository
  effect_metadata.lua and power_ledger.lua via their existing generators.
- execution.json: unchanged milestone4 seed/archetypes, 100/100 accepted and
  Node/Lua-valid at every quality. Q0/Q1 duplicate rates are 53%/52%, capacity
  50 compatible fingerprints versus 96 required. Q2-Q4 duplicates are 0%;
  capacities are 1253/986/986. Other measured gates pass. --enforce-gates exits1
  because Q0/Q1 remain red; no gate or benchmark was relaxed.

## Live acceptance still required

Record effect.execute_enemy with actual game/runtime versions and observations
following conditional-acceptance.md. Exercise an eligible ordinary target at
the threshold and its just-above neighbor; bosses, invulnerable/allied/linked
targets; already-mortal buffered hits; actual owner attribution; one-target
scope; repeated callbacks; downstream kill callbacks; cooldown expiry; room/
floor transitions; Continue and source removal. Verify that death, not mere
disappearance, is the observed successful outcome. Inspect this slice alongside
the parent's report-v2 condition scenario requirements; automated mocks cannot
supply any live observation. The live gate remains 0/63 cases, 0/130 scenarios.

No installed-mod/game/save/export synchronization, game interaction, benchmark
or archetype change, branch creation or commit was performed. Parent offline
review accepted this slice after an independent516/493/23 baseline comparison
and confirmation of no source changes since validation. Whole-plan release
and live acceptance remain outstanding.
