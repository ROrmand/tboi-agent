# Bounded execution: evidence and integration review

Reviewed October 25, 2026. This is a design/evidence note, not live acceptance.
Implementation and regression acceptance are recorded separately in the main
conditional expansion plan.

## Why this mechanic

The plan explicitly includes execution below a threshold among target-effect
primitives. Current semantic tracking distinguishes damage bursts and retaliation
but has no execution power. Finishing one sufficiently weakened eligible target
is mechanically distinct from adding fixed damage. Numeric thresholds, trigger
variants and conditions must all remain the same execution power.

## Actual EID evidence

Source: the existing reconciled 721-item runtime inventory, taxonomy 1.0.4,
report SHA256 b2b46c5f968eb81f05ee34403945c5d0175da88bb117cc4719558d9bcfe212a7.
Manual clause review found the following related, but not equivalent, mechanics:

| ID | Item | Quality | Relevant mechanic in description | Not reproduced |
| --- | --- | --- | --- | --- |
| 291 | Flush! | 1 | Instant elimination of poop enemies/bosses | Enemy-type filtering, roomwide effect, boss elimination |
| 503 | Little Horn | 3 | A hand kills enemies and damages bosses | Hand actor, proc rules, boss damage |
| 638 | Eraser | 1 | A thrown eraser kills an enemy | Thrown actor and persistent enemy-type erasure |

Damocles IDs 577 and 656 refer to killing Isaac, not enemies, and are not
positive evidence for this mechanic. None of these descriptions proves the
proposed low-health threshold semantics or complete vanilla item support.
Do not add their counts to the curated frequency-prior snapshot or make an
execution selection prior from this manual shortlist. Execution remains neutral.

## Engine semantics requiring tests

Primary source: https://wofsauge.github.io/IsaacDocs/rep/Entity.html

- The documented HitPoints property changes on the subsequent frame, not
  synchronously with damage. Evaluate observed current/max HP; do not subtract
  callback damage, infer post-hit HP or promise prediction of pending damage.
- HasMortalDamage reports whether buffered damage is already lethal. Reject
  already-doomed targets so ordinary lethal hits cannot be counted as execution.
- IsBoss, IsVulnerableEnemy, Exists and IsDead supply necessary eligibility and
  outcome checks. Missing/throwing getters, nonfinite HP, nonpositive max HP,
  bosses, allies, dead targets and nonhostile targets must fail closed.
- KillWithSource accepts an EntityRef. Require owner attribution; do not silently
  fall back to an uncredited kill. Observe death before committing cooldown.
- Guard the synchronous kill path against secondary generated effects and
  reentrant execution. A call error alone establishes neither success nor
  failure: observed death must still commit cooldowns after a downstream error.
  Ineffective calls and pre-death errors without observed death are not success.

The handler must stay single-target and bounded, using normalized owned event
context and existing successful-effect latch/cooldown ordering. Production tests
must exercise callback routing, not just call the handler directly. Room/floor
and Continue behavior must preserve existing save/cooldown safety.

## Diversity limit

Before execution, Q0/Q1 have 49 compatible passive power fingerprints. Adding
one distinct power provides at most one additional single-primitive fingerprint
under the unchanged low-quality archetype; different triggers or thresholds do
not add powers. Even the optimistic 50-fingerprint capacity leaves at least 50%
duplicates in a 100-item batch. The strict below-5% gate requires at least 96
unique fingerprints. This slice cannot honestly close that gate by itself.

Keep the release gate red until measured evidence satisfies it; do not count
stats, health costs, conditions, visuals or numerical variants as new powers.
No game interaction, installed-mod synchronization, fresh export, save mutation
or live evidence was used in this review.
