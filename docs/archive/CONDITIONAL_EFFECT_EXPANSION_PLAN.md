# Conditional and effect expansion plan

Status: whole-plan implementation authorized October 24, 2026. The production
registry has 37 conditions; vanilla audit tooling, eight bounded actions across
six effect families,
the persisted semantic ledger, and local power planning are integrated.
Q0-Q4 pass the deterministic offline diversity gates under the user-approved
capacity-aware Q0/Q1 policy. Whole-plan completion remains blocked by the
disabled pickup predicate, live behavior/balance acceptance, and unresolved
native-behavior decisions. Reviewed frequency priors are
integrated for four semantic powers. A runtime
inventory now joins 721/721 items; see the October 25 runtime audit checkpoints.
Latest verification (October 26): **566/566 automated tests pass**. A guarded,
explicitly opt-in pickup diagnostic capture is available, but is not an
acquisition producer; pickup_kind remains disabled. Formal live acceptance is
still **0/66 cases and 0/133 scenarios**. New familiar generation is temporarily
vaulted; saved familiar profiles remain compatible, not live-accepted.

## Incremental planning workflow

Work through reviewable delivery slices and update this document after each.
The user's latest request authorizes implementation of the whole plan, without
another approval checkpoint between slices. Resolve semantics using the shared
contract, authoritative API evidence, and automated acceptance checks. Preserve
existing saves and unrelated work. This does not authorize commits, arbitrary
engine behavior, or claims of live-game acceptance without observed evidence.
The slice-2B goal is complete. The whole-plan goal is not complete; remaining
implementation and release gates below must pass before it is complete.

### Slice 1: condition registry and trigger compatibility

Implementation status: registry, generated Lua metadata, compatibility checks,
success-only latch commits, and saved-profile diagnostics implemented. Automated
checks pass for the focused scope; no mod sync or live-game acceptance performed.

**Outcome:** Give the existing 10 conditions a shared metadata contract and
reject combinations whose event context cannot support their evaluation.
Do not add new conditions or effects in this slice.

**Starting point verified before implementation:**

- The existing capabilities JSON already lists condition names and allowed
  parameter names; extend that contract rather than introducing a second catalog.
- The live-sprite-swap Lua runtime maintains separate condition-name and
  parameter tables, validates through validCondition, and evaluates rules
  through ruleMayRun.
- Both rule triggers and direct proc systems need compatibility coverage; a
  rules-only check would leave another entry point unchecked.

**Implementation boundaries:**

- Describe parameter requirements, bounds, event requirements, compatible
  triggers/proc systems, and evaluation category for existing conditions.
- Trace the actual event producers before declaring which contexts provide a
  target. Do not infer compatibility from an event's name alone.
- Keep Lua evaluation as explicit handlers. Ship generated Lua registry
  metadata and verify parity against the JSON contract.
- Enforce the same compatibility rules in Node and Lua. Generation guidance
  should avoid invalid combinations, but validators remain authoritative.
- Preserve existing parameter meanings and power weights. Any discovered
  semantic correction becomes an explicit decision, not an incidental refactor.

**Acceptance checklist for this slice:**

- [x] Record focused test results and existing failures before code changes;
  historical test logs are not a verified current baseline.
- [x] Map every existing condition to its parameters and evaluation category.
- [x] Map rule triggers and direct proc systems to available event context.
- [x] Test valid combinations and reject unsupported condition/context pairs in
  both validators, including target-dependent conditions on targetless events.
- [x] Detect registry/validator/handler drift automatically.
- [x] Evaluate pure predicates and latch eligibility before canonical-order
  probability checks; commit latches and cooldowns only after all pass.
- [x] Agree on rejection rather than silent repair for incompatible saved
  profiles, and cover whole-restore rejection and save preservation in tests.
- [ ] Deliberately sync and restart Isaac/bridge, then record live acceptance.

**Decision agreed: reject incompatible saved profiles.**

- Reject the entire incompatible profile, not just its invalid condition or
  rule. Do not silently weaken its requirements, regenerate it, or migrate it.
- Preserve the saved data for recovery; an unsuccessful continue must not
  replace the original save with a partially restored or empty run.
- Report the profile/request identity, condition path, trigger or proc context,
  and rejection reason. Surface a short user-facing message and retain detailed
  diagnostics for troubleshooting.
- Keep Continue fail-closed rather than loading only the compatible subset.
  The current continuation path already validates each saved record, blocks on
  failure, and clears restored records/runtime for ordinary validation failures.
  It now logs the record/request identity, condition path, context, and rejection
  reason, and shows a short message that the original save is preserved.
- Add regression cases for an incompatible profile after a valid one, unchanged
  saved data on failure, and a fully compatible save restoring normally. Verify
  that rejected restoration leaves no generated effects active.

**Decision agreed: JSON registry with generated Lua metadata.**

Use the existing capabilities JSON as the authoring source. Generate a small
Lua metadata module during development/staging, and ship it with the mod;
do not require Node, a bridge request, or runtime JSON loading to validate an
item inside Isaac. Keep executable predicates handwritten in Lua.

Each condition entry should declare:

- Parameter names, requiredness, value types, numeric bounds, and enum values.
- Evaluation category: pure predicate, probability check, or success-only latch.
- Required context fields and explicit supported rule/proc contexts.
- State scope for latches; preserve existing identities and reset behavior.
- Human-readable guidance for prompts and rejection diagnostics.

Keep condition names and profile payloads unchanged in this slice. Derive any
legacy name/parameter lookup tables from the registry instead of maintaining
parallel handwritten definitions. Slice 1 advanced the capability catalog to 5;
profile payload version 1, save versions 2/3 read support, and runtime contract
13 are unchanged. No saved records are rewritten as a migration.

The generated module must be deterministic. A check command should fail on
stale generated output, missing/extra Lua handlers, or disagreement in parameter
and compatibility metadata. Add that check to the existing test/staging flow
so a source change cannot ship without its matching Lua metadata.

**Implementation record:**

- Authoring source: `content-contract/capabilities.json`, with
  `condition_registry` and `event_contexts`. The legacy condition-name and
  parameter lists are derived exports in `content-contract/conditions.mjs`.
- Node schema, validation, prompt guidance, and normalization use those exports.
  Lua loads `demo/live-sprite-swap/condition_metadata.lua` and retains an explicit
  handler table; summaries identify probability predicates through metadata.
- Run `npm run conditions:generate` after changing the registry. Commit/ship
  the generated module with the source; never edit it by hand.
- `npm run conditions:check` checks generated output and handler names. Both
  `npm test` and mod staging guard against drift; staging includes the module
  and rejects stale metadata or mismatched handlers before copying any files.
- Existing parameter bounds, health units, state identities/reset behavior,
  and effect weights are unchanged. Probability checks now have a stable order
  independent of condition array order. Failed predicates no longer consume
  collision/kill/tear-impact deduplication latches.

**Verified event-context mapping:**

- Targetless: room enter/clear, pickup, new floor, tear fire, active use,
  pill use, and card use. These reject `once_per_target` in both validators.
- Entity target present: enemy hit, boss kill, on-kill, tear impact, collision,
  bomb explosion (the bomb), and player death (the player).
- Player hurt has an optional source entity. `once_per_target` is allowed but
  fails without consuming RNG/latches/cooldowns when that source is absent.
  Compatibility means a condition can fire, not that every event satisfies it.

**Automated validation record, October 24, 2026:**

- Before changes: 318 tests, 295 passed, 23 failed, captured in
  `.test-condition-baseline-output.txt`.
- After changes: 329 tests, 306 passed, the same 23 failed, captured in
  `.test-condition-final-output.txt`. Failure names were compared; no new
  failures or baseline fixes were introduced.
- Existing failures: 1 job-store test, 19 passive-completion fixture failures,
  1 runtime-source assertion, and 2 slot-ledger tests. They remain out of scope.
- Focused conditions/generator/pipeline/sync/product suite: 187 passed, 0
  failed, captured in `.test-condition-focused-output.txt`. Includes all 160
  condition/context pairs, bounds/required fields, ordering and failed-chance
  state behavior, direct-proc deduplication, player/item/scope isolation,
  compatible Continue, and incompatible later-record restoration.
- `npm run conditions:check`, `npm run validate`, and `git diff --check` passed.
  Engine-mocked tests do not replace live acceptance. No mod sync, game restart,
  or live-game checks were performed; README/main-plan release claims remain
  unchanged pending that acceptance.

**Deferred:** New predicate families, vanilla mechanic research, new effect
families, generation diversity, and power saturation remain later slices.

### Slice 2A: coin, key, and bomb predicates

Implementation status: complete with automated coverage following the request
to continue. No mod sync or live acceptance performed. Explicit health and
active-charge semantics remain slice 2B.

**Scope and behavior:**

- Add `resource_at_most` and `resource_at_least`, with required `resource` and
  `amount` fields. Resolve the resource enum from the existing `resources`
  catalog: coin, key, and bomb only; no new resource grant/spend actions.
- Authored thresholds are integers from 0 through 99, inclusive. This bounds
  the generator's threshold, not the player's inventory: read and compare the
  actual count without clamping it to 99.
- Compare the event player's current count before actions execute. Read through
  the existing resource catalog getter, never through player zero. These are
  pure, event-scoped predicates compatible with all 16 current contexts.
- A missing getter fails the predicate rather than pretending the count is
  zero. Evaluation does not spend resources, cache inventory, consume RNG, or
  add persistence state. Re-evaluate inventory on every eligible event.
- Preserve the legacy health condition bounds of 1-12 and their existing units.
  Shared schema properties currently reject differing definitions of `amount`;
  widen the schema's numeric envelope from registry entries, then enforce each
  condition's exact bounds in the existing Node and Lua semantic validators.
- Resolve object-backed enum references from catalog keys so resource names
  are not maintained as another handwritten list. Keep generated Lua metadata
  and handler parity checks in the existing workflow.
- Show the resource requirement in derived effect summaries using registry
  summary templates. Prompt guidance already includes each registry entry.

**Acceptance checks:**

- [x] Capture a fresh pre-change test baseline.
- [x] Accept resource thresholds 0 and 99; reject missing, negative, fractional,
  nonnumeric, and above-99 thresholds in both validators.
- [x] Accept only coin/key/bomb; reject missing or invented resource names and
  resource fields on unrelated predicates.
- [x] Preserve legacy health thresholds: 0 and 13 still reject, 1 and 12 accept,
  despite the wider shared JSON-schema envelope.
- [x] Test true/false/equality cases for each resource, counts above 99,
  missing getters, repeated inventory changes, and event-player ownership.
- [x] Prove failed resource predicates do not roll chance or consume latches
  or cooldowns; prove resource checks do not mutate inventory.
- [x] Extend parity coverage to all 192 condition/context combinations and
  verify that compatible saves containing the new predicates continue safely.
- [x] Record focused/full results separately from existing failures. Keep live
  acceptance pending until deliberate sync and Isaac/bridge restart.
- [ ] Deliberately sync and record live resource-condition acceptance.

**Implementation and validation record, October 24, 2026:**

- Capability catalog version 6 now contains 12 conditions. Profile payload and
  saved-run versions remain unchanged; these predicates add no persistent state.
- Shared schema construction merges same-type numeric bounds and string enums
  into a permissive envelope. Node and Lua still enforce the selected condition's
  own required parameters, enum, and exact bounds. Conflicting parameter types
  fail schema construction rather than being silently coerced.
- Example condition: `{"type":"resource_at_least","resource":"coin","amount":5}`.
  A zero-key check uses
  `{"type":"resource_at_most","resource":"key","amount":0}`.
- Before this sub-slice: 329 tests, 306 passed, 23 failed, captured in
  `.test-resource-baseline-output.txt`.
- After this sub-slice: 336 tests, 313 passed, the same 23 failed, captured in
  `.test-resource-final-output.txt`. Failure names were compared; no new
  failures or unrelated baseline fixes were introduced.
- Focused conditions/generator/pipeline/sync/product suite: 194 passed, 0 failed,
  captured in `.test-resource-focused-output.txt`. Seven additional tests cover
  schema envelopes, normalization, resource runtime behavior, failed-condition
  state safety, co-op event dispatch and summaries, Continue, and legacy health
  bounds. Existing table-driven tests now cover all 192 context combinations.
- `npm run conditions:check`, `npm run validate`, and `git diff --check` passed.
  No installed mod files were synced and no Isaac/bridge restart or live-game
  acceptance was performed.

**Deferred to slice 2B:** Explicit red/soul/empty-red health predicates, special
character health semantics, and active-charge slot/battery-charge policy. No
silent changes to the legacy health predicates are part of slice 2A.

### Planning checkpoint

- Slice 1: implemented with automated coverage; deliberate mod sync and live
  acceptance remain pending.
- Slices 2A/2B and the remaining enabled condition families are implemented
  with automated coverage. `pickup_kind` remains explicitly disabled pending
  authoritative successful-acquisition semantics, not collision heuristics.
- Audit tooling, bounded effects, and persisted power-aware generation are
  integrated. The October 25 record below distinguishes passing automation
  from unmet release gates; no release-ready or live acceptance claim is made.
- Next prerequisites: authorize a disposable live test session and source sync,
  capture actual ItemConfig provenance, and review low-quality fingerprint
  capacity before making a deliberate catalog/archetype or benchmark decision.

## Goal

Make generated collectibles draw from a broad, testable catalog of Binding of
Isaac mechanics instead of repeatedly falling back to the same tear flags and
room-entry stat grants.

This work has two separate deliverables:

1. Expand the declarative condition system and prove every condition in both
   the Node validator and the Lua runtime.
2. Inventory vanilla collectible mechanics, map the reusable mechanics into
   bounded generator capabilities, and make generation actively diversify its
   choices.

"All conditionals" means all predicates in the versioned generator catalog.
It does not mean exposing arbitrary Lua, every hard-coded vanilla synergy, or
unbounded collectible IDs to the model. Each admitted predicate needs a stable
engine query, trigger compatibility, parameter bounds, a weight when it affects
power, and tests on both sides of the bridge.

## Baseline before slice 1

The pre-slice catalog exposed these same 10 conditions:

- chance and luck-scaled chance
- once per room, floor, run, or target
- total hearts at most or at least
- room kind
- while flying

The pre-slice Node and Lua validators mirrored these by hand and accepted
conditions without a trigger-compatibility check, allowing target-only
conditions on targetless events. Slice 1 replaces the duplicated definitions
with registry metadata and rejects those combinations. Runtime evaluation
remains in `ruleMayRun` in `demo/live-sprite-swap/main.lua`.

The saved design sample confirms a selection problem. Of 28 design artifacts:

| Dimension | Observed concentration |
| --- | --- |
| Systems | 20 tears, 14 rules, 9 stats; every other system appears 3 times or fewer |
| Tear flags | 14 bounce, 3 slow; every other observed flag appears once |
| Rule triggers | 12 room enter, 3 room clear, 1 player hurt |
| Conditions used | 6 once per room, 6 once per run, 4 chance, 1 luck chance |
| Regions | 28 passive; no familiar or aura region in this sample |

Adding predicates alone will not correct that distribution. The planner needs
catalog-aware sampling and run-scoped power saturation as a separate milestone.

The repository worktree also has pre-existing changes in the runtime and tests.
The full suite is not green at this baseline, so the first implementation PR or
commit must record the existing failures and avoid attributing them to this
work.

## Authoritative research inputs

Use these sources in this order and record their version/date in generated
audit output:

1. Isaac's runtime `ItemConfig` for collectible ID, type, quality, tags,
   charges, and other machine-readable metadata.
2. The installed English External Item Descriptions data for maintained
   descriptions of vanilla collectible behavior.
3. REPENTOGON enums, callbacks, and API bindings for what can be implemented
   reliably in Lua.
4. Targeted live-game probes for behavior that the descriptions or API do not
   settle.

The game executable is closed-source. REPENTOGON is a hook/API implementation,
not the source of every vanilla item effect. The audit must label claims by
source rather than presenting description text as decompiled game logic.

## Architecture changes before adding predicates

### One condition registry

Move condition metadata into `content-contract/capabilities.json` (or a
generated module derived from it) so each condition declares:

- allowed parameters and numeric/enumerated bounds
- compatible triggers and proc families
- required event fields such as target, damage, pickup, or weapon
- state scope: event, target, room, floor, or run
- display text and prompt examples
- whether evaluation is pure or consumes a latch only after all predicates pass

Node schema construction, Node validation, prompt guidance, normalization, Lua
validation, Lua evaluation, and effect summaries must be checked against this
registry. Keep Lua's fixed handler table, but add a parity test that fails when
the JSON catalog and Lua handler names differ.

### Condition evaluation contract

Evaluate pure predicates first, then probabilistic predicates, then commit
once-only latches and cooldowns only after every condition passes. This avoids
condition ordering changing behavior and preserves the existing rule that a
failed chance does not consume state.

Reject incompatible condition/trigger pairs during generation and again in
Lua. Never accept a profile that is valid JSON but impossible to fire.

## Milestone 1: complete the practical condition catalog

Implement in small families. Every family includes catalog/schema changes,
prompt guidance, Node tests, Lua validator tests, runtime tests, persistence
tests where applicable, and one live acceptance case.

### 1A. Correct and finish player resources

- `red_hearts_at_most`, `red_hearts_at_least`
- `soul_hearts_at_most`, `soul_hearts_at_least`
- `empty_red_hearts_at_least`
- `resource_at_most`, `resource_at_least`, with resource limited to coin, key,
  or bomb
- `active_charge_at_least`

Keep the existing `hearts_at_*` names readable for profile-version 1, but define
their exact half-heart behavior and migrate prompt guidance toward the explicit
health predicates. Cover Keeper, The Lost, bone hearts, and co-op ownership in
tests instead of assuming red-heart characters.

### 1B. Room, floor, and run state

- `first_visit`
- `room_clear_state` (clear or hostile), where compatible with the trigger
- `stage_at_most`, `stage_at_least`
- `difficulty_kind` (normal, hard, greed, greedier)
- `curse_active`, limited to named engine curse flags

Extend `room_kind` only with room types that can be queried consistently. Do
not encode room names as free text.

### 1C. Player state

- `while_moving`
- `while_firing`
- `while_grounded` as the explicit inverse of `while_flying`
- `character_kind`, using a bounded semantic group rather than arbitrary player
  type numbers where possible
- `has_familiar` or `has_collectible` only if backed by an allowlisted semantic
  tag; do not let the model request arbitrary collectible IDs

### 1D. Event and target state

- `target_is_boss`
- `target_is_champion`
- `target_health_at_most` and `target_health_at_least`, expressed as a bounded
  health fraction
- `target_has_status`, limited to catalog statuses
- `damage_at_least`
- `weapon_kind`, limited to tear, bomb, laser, knife, and familiar shot
- `pickup_kind`, limited to the existing pickup catalog

These must be restricted to triggers that actually provide the required event
data. Normalize event construction across kill, impact, collision, hurt, bomb,
card, pill, pickup, and active-use callbacks before enabling the predicates.

### Milestone 1 acceptance

- A catalog parity test enumerates every condition and its Lua handler.
- A table-driven test proves valid and invalid parameters for every condition
  in both validators.
- A table-driven runtime test proves true and false cases for every condition.
- Pairwise tests prove latch/cooldown behavior is independent of condition order.
- Every condition has at least one compatible trigger and every incompatible
  pair is rejected before a pedestal or ACK.
- Save/continue tests cover all stateful conditions.
- Live acceptance records game version, REPENTOGON version, character, trigger,
  expected result, and observed result.

## Milestone 2: build the vanilla mechanic inventory

Add a read-only audit tool under `scripts/` with outputs under `work/vanilla-audit/`:

1. A small Isaac/REPENTOGON exporter writes collectible metadata from
   `ItemConfig` to JSON.
2. A Node parser ingests the installed EID English data and normalizes markup
   into one record per collectible.
3. A classifier assigns zero or more mechanic tags, preserving the source text
   and a confidence field. Start rule-based; do not silently treat an LLM guess
   as authoritative.
4. A report joins item ID, name, quality, type, tags, descriptions, conditional
   phrases, mechanic tags, and implementation status.

Use a taxonomy that separates concepts which the current generator conflates:

- trigger: when evaluation starts
- condition: whether it may run
- action: immediate result
- modifier: persistent stat/projectile/weapon alteration
- actor: familiar, orbital, wisp, fly, spider, summon
- field: aura, creep, beam, trail, explosion
- economy: pickup, charge, shop, deal, reroll, room/item-pool interaction
- lifecycle: duration, stacking, room/floor/run persistence, transformation
- synergy/override: depends on another item, weapon, character, or mode

The report must have four dispositions:

- supported now
- reusable and safe to add
- possible but needs a new bounded runtime system
- excluded (arbitrary code, unsafe mutation, bespoke UI/level logic, or an
  effect too item-specific to justify as a generator primitive)

### Milestone 2 acceptance

- Every vanilla collectible ID returned by `ItemConfig` has exactly one joined
  row, even if its description is missing.
- Unknown/unclassified description clauses are reported, never discarded.
- Quality 0-4 counts reconcile with the live export.
- The report includes mechanic frequency by quality so weights can be based on
  observed vanilla patterns rather than intuition alone.
- A checked-in fixture makes the parser/classifier tests independent of the
  user's Steam installation. Full local data remains generated and untracked.

## Milestone 3: expand effects by reusable families

Prioritize families by vanilla frequency, distinctiveness, API reliability, and
ability to compose safely. Each new effect needs a fixed Lua handler, bounds,
weight, summary text, generation examples, and ownership/recursion tests.

Recommended order:

1. Projectile delivery and multishot: rate-limited extra tears, rings, cones,
   chained or returning shots, and impact spawns.
2. Target effects: mark, execute below threshold, knockback strength, pull/push,
   vulnerability, and bounded status propagation.
3. Defensive effects: projectile block/reflect, timed invulnerability,
   room-scoped shields, and damage reduction with explicit cooldowns.
4. Movement and contact: dash, trail/creep while moving, contact damage, and
   speed-dependent effects.
5. Economy and room rewards: charge conversion, pickup transformation, chest
   or shop modifiers, and bounded rerolls where APIs are deterministic.
6. Summons and orbitals: additional bounded familiar archetypes, flies,
   spiders, wisps, and temporary allies.

Do not add a mechanic merely because one vanilla item has it. Prefer primitives
that cover multiple items and combine cleanly with existing triggers and
conditions.

## Milestone 4: make generation diversify deliberately

### Catalog planner

- Replace prose-only catalog guidance with stable mechanic IDs and compatible
  combinations.
- Sample a candidate skeleton locally before the writing model runs. Choose its
  distinctive power family first, then select any compatible trigger,
  condition, stat, health change, and delivery details without treating those
  supporting choices as consumed for the run.
- Let the model name and theme the skeleton and choose bounded parameters. A
  specific player request may override the skeleton, but flavor-only requests
  should not default to tears plus room entry.

### Run power-saturation tracker

Make repeat avoidance a deterministic bridge/runtime feature, not a suggestion
that the writing model may ignore. Every accepted generated profile contributes
only its distinctive Isaac power keys to a run-scoped saturation ledger.
Rebuild the ledger from the run's saved profiles on Continue rather than
trusting a second mutable counter.

The purpose of this ledger is for Isaac to accumulate different powers over the
run. It is not a general novelty score for the whole item profile.

Track these power categories:

- Isaac tear flags such as slow, burn, poison, bounce, homing, piercing, split,
  orbit, explosive, continuum, boomerang, grow, shrink, sticky, and wiggle
- tear-update behaviors such as homing movement, pulse, spiral, shrink, and
  acceleration
- permanent abilities such as flight
- distinctive weapon powers for bombs, lasers, and knives
- distinctive offensive or defensive powers added later, such as projectile
  blocking, reflection, dash, shielding, execution, pull/push, or status
  propagation
- aura and proc outcomes when they grant the same player-facing power as an
  existing tear or weapon effect

Normalize equivalent player-facing powers into one family. For example, a slow
tear flag, a slow aura, `apply_status: slow`, and slowing creep all contribute
to `power.slow`. This prevents the generator from technically changing systems
while giving Isaac the same effective power again.

Do **not** add any of the following to the saturation ledger:

- triggers such as `room_enter`, `room_clear`, `enemy_hit`, or `player_hurt`
- conditions such as chance, once per room, room kind, health threshold, or
  while flying
- positive or negative stats, including damage, tears/fire rate, range, shot
  speed, movement speed, luck, and multipliers
- health gains, health losses, heart containers, or heart-type rewards
- ordinary resource and pickup rewards
- cooldowns, durations, stack limits, quality, region, or system names by
  themselves

Those supporting mechanics remain freely reusable. In particular, generation
must continue producing stat ups, stat downs, health ups, and tradeoffs at their
normal quality-appropriate rates. The power tracker must never suppress or
reweight them just because an earlier item changed the same stat or health
resource.

Each accepted profile records only:

- its normalized power families
- its power-only fingerprint
- acceptance order, quality, and generation source (Creator, Generator, or
  Singularity)

Count a power when a profile is accepted into the run, including an
uncollected generated pedestal. Do not count failed, repaired-but-rejected, or
cancelled designs. Delivery retries and duplicate ACKs must be idempotent.

Data flow:

1. Lua derives the usage map from its validated `records` list and includes a
   compact `power_usage` snapshot plus the last three power fingerprints in the
   published run context. Version 2 also includes bounded, lossless accepted
   power history so duplicate avoidance is not limited to those three items.
   This history is derived from the same records, never a second saved counter.
2. The bridge validates that snapshot and gives it to the local catalog
   selector before either the catalog-planning model or item-writing model is
   called.
3. The selector chooses a compatible, weighted mechanic skeleton and includes
   its stable IDs in the design brief. The final profile must contain that
   skeleton unless an explicit player wish supplied a different mechanic.
4. Lua remains authoritative: after accepting the profile it recomputes and
   republishes the ledger. A bridge restart therefore cannot forget the run's
   existing effects.

Version the IPC context when this field becomes required. An older running mod
must fail preflight with restart instructions rather than silently generating
without repetition control.

Apply the ledger before the item-writing request by reweighting only power
choices in the local catalog planner. Use an unused-first rule so Isaac gains a
new power whenever the requested quality and compatible catalog make one
available:

| Existing accepted uses | Power-choice multiplier while an unused compatible power exists |
| --- | --- |
| 0 | 1.00 |
| 1 or more | 0 by default |

If every compatible power is already present in the run, choose among the
least-used compatible power families with a small fallback weight rather than
falling back to the catalog's first entry. Permanent binary abilities such as
flight remain unavailable after the first grant even in this fallback pool,
because a second copy gives Isaac no new capability. Reject and locally
resample an exact power-fingerprint duplicate before asking the writing model
to repair it. This resampling must leave stats, health, triggers, and conditions
untouched unless they are incompatible with the replacement power.

An explicit mechanical wish overrides saturation for the mechanics it names.
For example, a player who asks for slowing tears can still receive them. Flavor-
only prompts, automatic Generator requests, and the Singularity path receive
the full penalties. An explicit request for one repeated power must not remove
penalties from unrelated power choices.

The ledger is internal balancing data. Model output cannot declare an effect
unique, reset counts, or choose its own multiplier. A small catalog at quality
0 must always have a valid least-saturated fallback.

Add a derived debug report to the generated-item library showing each item's
power keys and current run counts. Do not display triggers, conditions, stats,
or health as saturated. This makes cases such as two slow items out of three
immediately diagnosable without inspecting JSON files.

Required tracker tests:

- profiles using tear slow, slow aura, slow status, and slowing creep all
  increment the same power family
- room enter, room clear, and every condition can repeat without changing any
  power multiplier
- repeated positive stats, negative stats, health gains, and health tradeoffs
  do not enter the ledger and retain their normal generation weights
- flight is offered normally before it is granted and suppressed afterward
- one prior use removes the power family while any unused compatible family is
  available
- when every compatible family has been used, only least-used non-singleton
  powers enter the bounded fallback pool
- explicit slow requests bypass only the slow penalty
- rejected/cancelled jobs and duplicate delivery do not increment counts
- Continue and bridge restart reconstruct identical counts and recent history
- older accepted combinations remain known after falling out of recent history;
  compact history must reconstruct all usage and reject inconsistent snapshots
- Creator, Generator, and Singularity requests use the same ledger
- a fully saturated quality tier still selects a deterministic least-used valid
  power while preserving eligible stat and health changes

### Quality-aware archetypes

Define what each quality buys instead of only enforcing a maximum weight:

- Q0: one small primitive or a tradeoff
- Q1: one clear mechanic, optionally one small stat
- Q2: one primary power plus one compatible secondary mechanic
- Q3: a distinctive combination with a meaningful trigger or actor
- Q4: a build-defining combination with stronger parameters, not merely more
  unrelated clauses

Use the vanilla inventory report to tune archetype frequencies and weights.

### Milestone 4 acceptance

Run a deterministic batch for every quality and report:

- valid-generation rate and repair rate
- region/system/trigger/condition/action distribution
- most common power fingerprint and exact duplicate rate
- distance between consecutive power fingerprints
- semantic power-family counts and saturation multipliers
- stat-up, stat-down, health-up, and health-tradeoff rates, which must remain
  independent of saturation
- weight utilization by quality

Initial release gates for a 100-item flavor-only batch:

- no single tear flag exceeds 20% unless the prompt explicitly requests it
- after one `power.slow` item, otherwise eligible flavor-only generations do not
  select slow again while another unused compatible power is available
- repeated triggers and conditions produce no saturation penalty
- stat and health distributions remain within the baseline tolerance after the
  power tracker is enabled
- at least 70% of supported power families appear
- exact power fingerprint repeats meet the user-approved quality policy:
  Q0/Q1 exclude capacity-forced repeats before the below-5% check; Q2-Q4 retain
  the absolute below-5% check (see the authorized policy checkpoint below)
- 100% of accepted profiles pass both validators and weight checks

Tune these gates after the first vanilla-frequency report; keep the metrics even
if the thresholds change.

## Milestone 5: integration and live acceptance

1. Run focused Node and Lua tests after each family.
2. Run the full suite and separate pre-existing failures from regressions.
3. Sync the mod, restart Isaac and the bridge, and test a matrix covering every
   new condition/effect at least once.
4. Exercise co-op, continue, source removal, rerolls, piercing/multihit targets,
   simultaneous kills, and all supported weapon types.
5. Generate repeated items through Creator, all Generator qualities, and the
   Singularity path; compare the live distribution report with offline batches.
6. Update README and the main implementation plan only after the live matrix is
   recorded.

## Suggested delivery slices

Keep changes reviewable and bisectable:

1. Condition registry plus trigger compatibility, without new conditions.
2. Player resource and health conditions.
3. Room/floor/run conditions.
4. Player, event, and target conditions.
5. Vanilla metadata exporter and EID parser.
6. Mechanic classifier and coverage report.
7. First high-value effect family.
8. Persisted power-saturation tracker, repeat-aware planner, and batch
   diversity gates.
9. Remaining effect families, one family per change set.
10. Live acceptance and balance tuning.

The first implementation slice should be the registry and compatibility layer.
It removes the current duplicated definitions, makes impossible profiles fail
early, and gives every later condition a single, testable path into the system.


## Slice2B implementation record — October 24, 2026

**Status:** Implemented and focused automated acceptance passed in the shared
checkout. No mod sync, live-game acceptance, commit, or branch. This appended
record supersedes the earlier statements that slice 2B is still backlog; later
slices and whole-plan acceptance remain separate work.

### Settled semantics and primary evidence

Research preceded the implementation. Verified the online Isaac API documentation
and the local REPENTOGON source, whose checkout HEAD is
`e2c5aecacbbb83bb5938cfa89c0a58b78e616a36`:

- [Isaac EntityPlayer API](https://wofsauge.github.io/IsaacDocs/rep/EntityPlayer.html):
  GetHearts reports red filling, including filling in bone hearts, in half-heart
  units. GetSoulHearts includes black hearts; GetBlackHearts is a mask, not an
  additional count. GetEffectiveMaxHearts includes red capacity in bone hearts.
- **Decision:** Explicit red predicates use raw GetHearts, including engine rotten
  occupancy without adding a second rotten count. They measure occupied engine
  units, not the number of hits a rotten heart can absorb. GetRottenHearts has no
  documented getter-unit explanation; no conversion is guessed or required.
  Bone shells themselves add no filled health. Empty red capacity is
  max(0, GetEffectiveMaxHearts() - GetHearts()), including unfilled bone capacity.
- **Decision:** Preserve special-character engine values, including Keeper's
  coin-health representation and any hidden soul value on The Lost. Never invent
  health, normalize a character, inspect another form, or aggregate co-op/twins.
  Local `.reference-repentogon/repentogon/LuaInterfaces/CustomCallbacks.cpp`
  explicitly clears red/bone health and assigns one soul unit in its no-health
  conversion; UI appearance is not an authoritative zero-health query.
- [ActiveSlot API](https://wofsauge.github.io/IsaacDocs/rep/enums/ActiveSlot.html):
  primary=0, secondary=1 (Schoolbag), pocket=2, pocket2=3 (Dice Bag).
  GetActiveItem returns zero for an empty slot. EntityPlayer documents
  GetBatteryCharge separately as the second charge bar.
- [REPENTOGON bindings at the inspected revision](https://github.com/TeamREPENTOGON/REPENTOGON/blob/e2c5aecacbbb83bb5938cfa89c0a58b78e616a36/repentogon/LuaInterfaces/Entities/LuaEntityPlayer.cpp):
  LuaCheckActiveSlot accepts 0-3; GetActiveItem, GetActiveCharge and
  GetBatteryCharge each forward the selected slot. Also checked the local copy
  at `.reference-repentogon/repentogon/LuaInterfaces/Entities/LuaEntityPlayer.cpp`.
- **Decision:** active_charge_at_least requires an explicit named slot and an
  occupied item, then compares normal+battery charge in that slot only. Empty
  slots fail even for threshold zero; occupied uncharged slots satisfy zero.
  It does not sum slots, infer the slot used by an event, include blood/soul or
  subcharge, or claim the item is usable/full. Timed items use raw engine charge
  units. The value is queried at event evaluation, not reconstructed before use.

### Delivered contract and runtime

- Added red_hearts_at_most/least, soul_hearts_at_most/least,
  empty_red_hearts_at_least and active_charge_at_least. There are now 18 registry
  conditions and 288 condition/context pairs. All six additions are pure,
  event-player predicates supported by all 16 existing contexts.
- New health thresholds are integers 0-24 half-heart units; charge thresholds
  are integers 0-99. Actual query values are not clamped to those authoring
  bounds. Charge requires slot in primary/secondary/pocket/pocket2; slot is
  forbidden on unrelated predicates. The schema envelope remains amount 0-99,
  while both semantic validators enforce each selected condition's bounds.
- Kept capability catalog version 6, profile/save versions, legacy hearts_at_*
  bounds 1-12, and the exact legacy GetHearts+GetSoulHearts behavior unchanged,
  including its old missing-getter fallback. New predicates instead fail closed
  for missing/non-callable/throwing getters and nil, nonnumeric, negative,
  fractional, NaN or infinite query results. This fail-closed addition does not
  silently change legacy saves or meanings.
- Added registry summaries and generation guidance; generated condition_metadata.lua
  from the registry and verified handler parity. No cache or persistent state was
  added. Existing pure/latch/probability ordering and success-only commits remain
  the implementation path, not a parallel mechanism.
- Eight additional tests cover Node bounds/normalization/slots; Lua raw health,
  rotten/black/bone and special-character snapshots; all four slots with normal
  and battery-only charge; invalid getters; RNG/latch/cooldown ordering; actual
  co-op ownership and summaries; live re-query after Continue for all six
  predicates; and whole-restore rejection/save preservation for invalid health
  thresholds or missing/invalid active slots. Existing generic Lua validator
  tests now cover all 288 pairs and every condition's required/extra fields
  and lower/upper boundaries.

### Exact validation results

- Fresh pre-edit full baseline: **336 tests, 313 passed, 23 failed**, captured in
  `.test-slice2b-baseline-output.txt`. The known failures were job-store 1,
  passive-completion 19, runtime 1, and slot-ledger 2.
- Final focused command:
  `node --test bridge/conditions.test.mjs bridge/generate.test.mjs bridge/pipeline.test.mjs bridge/sync-mod.test.mjs native/ipc/product.test.mjs`
  — **202 tests, 202 passed, 0 failed**, captured in
  `.test-slice2b-focused-output.txt`.
- `npm run conditions:check`, `npm run validate`, and `git diff --check`
  passed after the final code changes. Validate output is in
  `.test-slice2b-validate-output.txt`. Whitespace check emitted only existing
  LF-to-CRLF Git notices, not whitespace errors.
- A non-final full run while independent agents created new modules reported
  **355 tests, 330 passed, 25 failed** in `.test-slice2b-final-output.txt`.
  This included an in-progress expanded-effects placeholder and an interim
  catalog-version assertion (the catalog version was retained at 6 before the
  final focused run). A subsequent narrowed invocation still discovered another
  in-progress power-context test: **345 tests, 321 passed, 24 failed**, in
  `.test-slice2b-baseline-scope-final-output.txt`. Neither is a final whole-plan
  regression comparison; the parent explicitly owns that comparison after
  power transport/contract14 integration. No unrelated failures were repaired.
- main.lua remains on compatibility contract13 for the parent's subsequent
  integration. Live acceptance stays pending until a separately authorized sync
  and Isaac/bridge restart.

## Whole-plan integration checkpoint (October 24, 2026)

Historical checkpoint; later October 25 integration and regression sections
supersede its pending-work statements and measured rates.

Slice 2B is integrated. The production registry now has 37 conditions across
16 contexts (592 compatibility pairs), with contract14 on both bridge and Lua.
Nineteen additional predicates use bounded, fail-closed queries. Confirmed
post-damage callbacks supply actual nonfake damage; weapon predicates use the
actual source, including REPENTOGON ExtraSource, never equipped-weapon guesses.
`pickup_kind` remains disabled: pickup collision does not prove acquisition.
An authoritative successful-acquisition producer is still required.

The semantic power ledger is rebuilt from accepted persisted profiles, including
uncollected pedestals, and retains powers after source removal. Bridge context,
local quality-aware skeleton planning, final semantic design validation, Library
summaries, and a queued-delivery race guard are integrated. The generated Lua
mirror handles the actual JSON4Lua empty-object sentinel. Planner tests pass,
but the 100-item duplicate-fingerprint release gate does NOT: observed duplicate
rates for Q0-Q4 are 60%, 59%, 5%, 24%, and 18% (required strictly below 5%).
Do not weaken that gate or describe the generation milestone as release-ready.

Vanilla audit export/parser/classifier/report tooling and fixtures are present.
Fixture reconciliation passes; installed EID parsing finds 732 distinct IDs,
which is NOT a live collectible count. A fresh runtime ItemConfig export with
actual game/runtime provenance is still missing, so live frequency and balance
conclusions remain blocked.

All six expanded effect primitives have standalone tests, but production
dispatch, lifecycle, schemas, and semantic planner admission remain pending.
Their detailed integration contract is in `scripts/expanded-effects-integration.md`.
The live evidence validator exists; no mock evidence counts as live acceptance.
No installed-mod sync, game restart, live export, or live acceptance occurred.

Verification before effect integration: product runtime 184/184; planner20/20
(reports unmet release gates); design/context/generation16/16; server16/16.
`npm run validate` and `git diff --check` pass. Full-suite comparison is captured
in `.test-whole-plan-integration.txt`; failure identities are reviewed separately
against the original 336-test baseline, rather than comparing totals alone.

## Bounded effects and generation integration (October 25, 2026)

### Delivered and automatically verified

- [x] Integrate all six bounded families: extra-tear cone/ring, target push/pull,
  hostile projectile blocking, movement-input dash, paid coin-to-charge, and
  temporary allies. These are fixed handlers with catalog parameters, not
  arbitrary engine entity IDs, callbacks, or Lua. Dash does not grant immunity;
  projectile blocking does not cancel the original damage callback.
- [x] Use strict per-type Node schemas, strict Lua validation, shared weights,
  summaries/examples, generated `effect_metadata.lua`, and drift checks. Legacy
  amount requirements remain intact; expanded actions have distinct fields.
  Normalization preserves those fields instead of deleting cost/duration/radius.
- [x] Preflight expanded actions before parent RNG/latches/cooldowns. Aggregate
  paid coin costs across expanded and legacy conversions. Mixed lists containing
  expanded actions commit only if an apply succeeds; pure legacy lists retain
  their previous execution semantics. All-failed engine spawning and mixed
  legacy/expanded no-ops have dedicated production-entry-point regressions.
- [x] Guard synchronous spawn callbacks and secondary ancestry throughout
  existing tear, weapon, damage, and kill routes. Internal projectile inspection
  bypasses only the apply-phase guard, never secondary ancestry. Secondary
  damage clears stale primary kill ownership and cannot replay it later.
- [x] Tick actor ownership/caps/expiry; untrack removal before familiar-specific
  early returns; clear actors on room transitions; clean up on run teardown and
  rejected restore. Persist remaining action cooldowns, not entities, and reject
  malformed cooldown saves atomically (including false/string state). Original
  rejected saves remain untouched. Continue does not recreate transient actors.
- [x] Admit distinctive effect families to semantic power mapping and compatible
  local skeletons. Push shares knockback, blocking shares projectile blocking,
  and temporary pooters share the summon family. Paid charge is ordinary economy
  and does not consume a distinctive power family. Regenerate the Lua mirror.
- [x] Preserve supported explicit Creator stat-only wishes, requested tear
  delivery, named familiars/auras, and named supporting stats. Do not turn a
  stat-only request into a random power or force unrelated powers into a specific
  request merely to fill a quality archetype. Automatic/flavor batches retain
  independently sampled supporting choices and their saturation rules.
- [x] Update pipeline mocks to provide required trusted run context and to theme
  the actual local skeleton. Add source-sync metadata guards; do not sync the
  installed mod. Include all six effects in the live evidence validator.

Eight new full-product effect tests cover success-only commits, Continue/source
loss, mixed paid costs, actual movement, boss immunity, confirmed hostile-only
blocking, synchronous/descendant recursion, actor removal, and save rejection.
Standalone module tests additionally cover co-op isolation, hard caps, rollback,
and boundary parity. These are mocked engine tests, not live observations.

### Regression acceptance

- Focused integration command (product, planner, expanded effect schema, pipeline,
  and sync tests): **227 tests, 227 passed, 0 failed**, recorded in
  `.test-whole-plan-focused.txt`.
- Earlier integration `npm test`: **468 tests, 445 passed, 23 failed**, recorded in
  `.test-whole-plan-final.txt`. Comparing failure names against
  `.test-slice2b-baseline-output.txt` finds **zero new failures and the same 23
  baseline failures**: job-store 1, passive-completion 19, runtime source
  assertion 1, and slot-ledger 2. No unrelated baseline failure was repaired.
- `npm run validate`, condition/effect/power metadata checks, and
  `git diff --check` pass. Final validation/whitespace logs are
  `.test-whole-plan-final-validate.txt` and `.test-whole-plan-diff-check.txt`.
- Vanilla audit fixture still reconciles all eight synthetic rows. It is not a
  substitute for the missing live ItemConfig capture.

### Current diversity gates: Q0/Q1 remain red

`npm run powers:batch -- --output=work/power-diversity-current.json` correctly
exits 1. The batch report is a local supported-skeleton simulation, not model
or live-game generation. No thresholds were loosened.

| Quality | Accepted / requested | Exact duplicates | Compatible fingerprints | Family coverage |
| --- | --- | --- | --- | --- |
| 0 | 100 / 100 | 56% | 48 | 97.78% |
| 1 | 100 / 100 | 53% | 48 | 100% |
| 2 | 100 / 100 | 2% | 1154 | 97.78% |
| 3 | 100 / 100 | 0% | 887 | 97.78% |
| 4 | 100 / 100 | 0% | 887 | 100% |

These are the latest full-run-history results, recorded in
`.test-power-history-diversity.txt`. Q2-Q4 now pass every offline batch gate;
Q0/Q1 fail only the exact-duplicate gate. The earlier recent-history-only rates
were 56%, 57%, 8%, 13%, and 17%; those are superseded, not a changed benchmark.

Strictly below 5% exact duplicates in 100 items requires at least 96 distinct
power-only fingerprints. Under the current single-primitive Q0/Q1 archetypes,
only 48 are compatible across the sampled supporting choices. Even an ideal
selector therefore has an optimistic duplicate floor of 52%. Renaming items,
changing triggers/conditions, or modifying stats cannot manufacture new semantic
powers. This is a catalog/archetype-versus-benchmark conflict, not a test failure
to hide by adjusting the threshold or fingerprint definition.

Q0 request index 72 has only one affordable fingerprint after its independent
stat/health sample; that power is in the last-three history. The original
implementation rejected it, but that contradicted this plan's explicit bounded
least-saturated fallback requirement. The October 25 correction permits a recent
repeat **only when no eligible nonrecent compatible choice exists**, after
filtering already-used singletons. It recomputes unused-first/least-used
multipliers over that constrained pool, without resampling support, changing
active/passive type, or mutating the ledger. A genuinely unavailable catalog
(such as already-used flight as the only allowed mechanic) still fails closed.

The local skeleton and model brief explicitly report `constrainedRepeat` /
`constrained_repeat_fallback`; the batch artifact lists each occurrence in
`constrainedRepeatFallbacks`. This is a validity fallback, not a diversity-gate
exemption. The Q0 batch records exactly one constrained repeat, at index 72;
Q1-Q4 record none. All five batches now validate 100/100 profiles in both
validators and satisfy weights. Tear-frequency, slow-unused-first, support
independence, and family-coverage gates pass. Exact-duplicate gates originally
failed at every quality; the full-run-history slice below resolves Q2-Q4.
No threshold or power fingerprint was changed.

Focused planner/design/pipeline verification passes **31/31 tests** in
`.test-constrained-power-fallback.txt`, including deterministic exhausted Q0,
forced least-used recent-repeat selection, active Generator fallback at every
quality, singleton suppression, and unchanged supporting choices. The batch
command's earlier expected exit 1 and full results are recorded in
`.test-constrained-power-diversity.txt`. `work/power-diversity-current.json`
now contains the newer full-run-history results.

### Inert pickup observation aid - October 25, 2026

- [x] Add `pickup_probe.lua` as an inert, manually instantiated read-only
  diagnostic. Production `main.lua` does not load it, and `pickup_kind` remains
  disabled. The source-sync allowlist contains the file; no sync was performed.
- [x] Correlate exact pickup/collider-player references across pre/post collision
  and later frames. Record raw resource, health, active-slot, and pickup state;
  missing/throwing getters stay unknown. Never infer successful acquisition from
  collision, animation, removal, or inventory deltas.
- [x] Bound pending references and completed logs; report drops, support draining,
  and clear room/run-transition state explicitly. Register no callbacks and
  mutate no inventory, RNG, entities, or saves.
- [x] Document manual callback-return safety, co-op attribution limits, and the
  future live observation protocol in `scripts/pickup-probe/README.md`.

The focused probe/sync run passes **6/6 tests**, covering exact co-op pairing,
skipped/mismatched post callbacks, unavailable/removed entities, bounded buffers,
drain/clear, and no production auto-loading. These are mocked tests, not evidence
of authoritative pickup acquisition or live acceptance. The run is recorded in
`.test-pickup-probe-focused.txt`.

### Fallback/probe regression checkpoint - October 25, 2026

- Final `npm test` after the fallback/probe changes: **474 tests, 451 passed,
  23 failed**, recorded in `.test-pickup-fallback-final.txt`. Failure-name
  comparison with `.test-slice2b-baseline-output.txt` confirms the same 23
  baseline failures, no newly failing names, and no removed baseline failures.
- `npm run validate` passes (`.test-pickup-fallback-validate.txt`). The full test
  command also passes all three generated metadata checks before its test run.
- `git diff --check` passes (`.test-pickup-fallback-diff-check.txt`).
- Re-running `npm run acceptance:live` returns the expected exit 1: **blocked,
  0/61 live cases**. No live observations were supplied or fabricated.
- Read-only process inspection finds no running `isaac` / `isaac-ng` process.
  No installed-mod sync, game launch/restart, or save write was performed.

### Full-run semantic history and compatible pairing - October 25, 2026

Inspection found two remaining offline causes of higher-quality duplication:
the selector forgot accepted combinations older than its three-item window,
and unrestricted pairing could strand powers with fewer compatible partners.
These could be corrected without changing the power taxonomy, sampled support,
least-used rule, quality weights, or release thresholds.

- [x] Version the power snapshot/catalog contract to **2**. `power_history`
  records a compact signature for each accepted profile, in acceptance order.
  A canonical lowercase hex bitset over the catalog's sorted power keys is
  lossless, including powers above bit 31; `0` represents no distinctive power.
  It is an encoding of the existing fingerprint, not a new novelty definition.
- [x] Rebuild history from accepted profiles in both Node and generated Lua.
  Duplicated deliveries do not append; source removal does not erase history.
  No mutable history is added to SaveData, so existing saved profiles rebuild
  directly on Continue without a save migration. The outer runtime contract
  remains 14; an older version-1 power snapshot fails preflight with explicit
  Isaac/bridge restart instructions instead of silently losing repeat control.
- [x] Validate every compact signature, reconstruct the entire usage map, and
  require exact agreement with the last-three fingerprints. Reject noncanonical
  encodings, unknown high bits, inconsistent usage/order, missing history, or
  more than 128 accepted entries. The 63-family encoding ceiling fails closed
  if the catalog ever exceeds it; that change would require a new encoding.
- [x] Prove that even 128 full-power history entries fit the existing 16,384-byte
  CLI context bound. Model output still cannot supply or reset ledger state.
- [x] Keep singleton/unused-first/least-used filtering authoritative. Within the
  eligible quality archetype, prefer fingerprints absent from accepted history.
  Pair powers with fewer distinct eligible partners first, with deterministic
  weighted choices among ties. Never resample supporting stats/health or relax
  an explicit wish to manufacture diversity. If no unseen eligible fingerprint
  exists, retain a valid least-used fallback rather than failing generation.
- [x] Report `repeatedPowerFingerprint` in the local skeleton and its derived
  model brief. The batch adds `fingerprintRepeatFallbacks` and
  `constrainedArchetypes`; repeated fingerprints still count against the strict
  gate. Q2's default batch records two repeats and 14 constrained single-mechanic
  selections; Q3/Q4 record zero repeats and three/four constrained selections.

Default Q2-Q4 duplicate rates are now **2%, 0%, 0%**. Two additional deterministic
seeds (`diversity-a`, `diversity-b`) each run 100 profiles per Q2-Q4 quality with
both Node and extracted Lua validators. All six batches pass every gate, with
duplicate rates **0%, 0%, 1%** and **2%, 1%, 0%**, respectively. All supporting
stat/health deltas are exactly zero. This is offline skeleton validation, not
model-generation or live gameplay acceptance. Seed evidence is recorded in
`.test-power-history-seeds.txt`.

### Latest regression checkpoint - full-run history

- Focused planner/design/context/compatibility/pipeline/server/product run:
  **248/248 passed** (`.test-power-history-focused.txt`). Coverage includes old
  nonrecent combinations, compact corruption/high bits, least-used/singleton
  rules, unchanged support, maximum transport, Lua parity, duplicate ACKs, and
  Continue reconstruction.
- Final `npm test`: **478 tests, 455 passed, 23 failed**
  (`.test-power-history-final.txt`). Comparing failure names with
  `.test-slice2b-baseline-output.txt` confirms the same 23 known failures and
  **zero new failures**; no unrelated baseline failure was repaired.
- All three generated-metadata checks pass in the full test command.
  `npm run validate` and `git diff --check` pass
  (`.test-power-history-validate.txt`, `.test-power-history-diff-check.txt`).
- `npm run powers:batch -- --output=work/power-diversity-current.json` retains
  expected exit 1 solely because Q0/Q1 still fail the unchanged duplicate gate.
  Their compatible catalog has only 48 fingerprints for 100 requests; adding
  full history cannot overcome that structural capacity bound.
- No installed-mod sync, game launch/restart, live export, or live acceptance
  was performed. Pickup acquisition and the 61-case live matrix remain pending.

### Requirement-level completion audit - October 25, 2026

The preceding goal turn made verified implementation progress. This audit does
not treat those changes, a passing focused suite, or the absence of new failures
as proof of whole-plan completion. It checks the original milestone boundaries
and retains the unfulfilled runtime/data requirements.

| Requirement | Current authoritative evidence | Completion finding |
| --- | --- | --- |
| Shared condition registry, parameter contracts, summaries/guidance, handler parity and context rejection | `content-contract/capabilities.json`, generated `condition_metadata.lua`, `bridge/conditions.test.mjs`, `native/ipc/expanded-conditions.test.mjs`; 37 admitted conditions across 16 contexts | Implemented and automatically checked; not a live acceptance result |
| Milestone 1A resources/health/active slots, legacy bounds, special-character and co-op behavior | Product tests and the health/charge checkpoints above; raw event-player queries, no cached inventory or extra persistence | Implemented with mocked engine coverage; live cases missing |
| Milestones 1B/1C room/run/player predicates and bounded semantic ownership tags | `expanded_conditions.lua`, production registry, table-driven validator/runtime tests | Implemented with bounded/fail-closed queries; live cases missing |
| Milestone 1D target/damage/weapon predicates and normalized events | `event_context.lua`, production callbacks, event-context/expanded-condition/product tests | Implemented except successful ordinary-pickup acquisition; collision remains insufficient |
| `pickup_kind` and its successful-acquisition producer | Proposal remains gated, absent from the production condition registry; inert `pickup_probe.lua` emits diagnostics only | **Incomplete**; no authoritative acquisition observation or implementation acceptance |
| Read-only runtime exporter, EID parser, taxonomy, confidence, unknown-clause preservation and joined report | `scripts/vanilla-audit/`, `vanilla_audit.lua`; fresh fixture joins eight synthetic IDs and reconciles every quality | Offline tooling verified; synthetic inputs are explicitly not runtime evidence |
| Every live returned ItemConfig ID joined once; actual quality reconciliation and mechanic frequency | Current generated data contains only a fixture report and an EID-only inventory; the latter has 732 description IDs and no runtime qualities | **Missing**; no actual ItemConfig export supplied or captured |
| Six admitted bounded effect families, schemas/weights/examples/summaries, ownership, recursion and cleanup | `expanded-effects.json`, Node/Lua handlers, generated effect metadata, standalone/product tests and integration contract | Implemented and automatically checked; vanilla-frequency prioritization and live acceptance remain unverified |
| Other suggested effect families such as chaining, reflection, execution or room/pool overrides | The plan lists these as recommended expansion directions, not six delivered handlers | Not implemented by the six-family slice; do not claim comprehensive vanilla-mechanic coverage or preempt the frequency-based prioritization decision |
| Rebuilt accepted-profile saturation, source/acceptance order, uncollected pedestals, retry idempotency, Continue/restart and library debug output | `powers.mjs`, generated `power_ledger.lua`, product/context/planner/server tests; version-2 history reconstructs exact usage and recent order | Implemented and automatically checked; no separate saved mutable counter |
| Local planning before model calls, explicit wishes, singleton/unused-first/least-used rules and independent supporting choices | Planner/design/pipeline tests and batch reports; source paths share the authoritative context | Implemented; accepted model/live distributions still need observation |
| Deterministic quality gates and baseline comparisons | Current batch artifact and `.test-power-history-seeds.txt`; Q2-Q4 default passive Generator batches pass all gates | **Partial**: Q0/Q1 duplicate gates fail; those passive results are not an active-item diversity claim |
| Active request type and bounded exhaustion behavior | Active Generator fallback tests pass at every quality; current active primitive catalog has one power fingerprint | Valid fallback is implemented, not active catalog breadth or active diversity acceptance |
| Whole-suite regression separation and dry-run/metadata checks | Latest full suite: 478 total / 455 pass / identical 23 baseline failures; metadata, validate and whitespace checks pass | Verified for automated scope, not a green whole suite or gameplay result |
| Live condition/effect/lifecycle matrix, Creator/all Generator qualities/Singularity distribution, balance and release documentation | Fresh live checker reports blocked with 0/61 current required cases; no running Isaac process or authorized session | **Missing**; README release claims remain unchanged |

Fresh audit commands and results:

- Condition/effect/power metadata checks all pass
  (`.test-completion-audit-metadata.txt`).
- Registry, expanded conditions/effects, event context, audit parser/exporter,
  and live-evidence-validator tests pass **80/80**
  (`.test-completion-audit-focused.txt`). This does not replace the broader
  478-test regression record or actual runtime observations.
- `node scripts/vanilla-audit/cli.mjs --fixture` returns `kind=fixture`,
  `joinedItems=8`, `reconciled=true` (`.test-completion-audit-fixture.txt`).
- Running the audit CLI without an export exits 1 with **Runtime ItemConfig
  export required** (`.test-completion-audit-missing-export.txt`). The existing
  installed EID report is `eid-only-no-runtime-export`, not a substitute.
- `npm run acceptance:live` exits 1 with **blocked: 0/61 live cases**
  (`.test-completion-audit-live.txt`). No observations were manufactured.
- Independent inspection of the **entire current primitive catalog**, not just
  one seed, finds 48 passive and one active power fingerprints. Q0/Q1 select
  one primitive; 100 items with strictly fewer than 5% duplicates need 96 unique
  fingerprints. Their optimistic passive duplicate floor is therefore 52%
  before budgets/support restrict it further
  (`.test-completion-audit-capacity.txt`). Different names, seeds, supporting
  conditions/stats or numerical parameters cannot solve that capacity bound.

### External handoff and blocked-goal decision

The same runtime-data/authorization blocker has persisted across the last three
goal turns while feasible offline fallback, history/pairing, and diagnostic work
was completed. This audit finds no safe remaining action that can produce an
actual ItemConfig inventory, authoritative acquisition evidence, or live matrix
without an external input or explicit session authorization. It also cannot
honestly make the Q0/Q1 gate pass by changing a seed or weakening the metric.
The whole-plan goal is therefore **blocked, not complete**.

To resume the blocked phase, authorize installed-mod source sync and a
disposable Isaac/bridge test session, or supply an actual unchanged runtime
ItemConfig export with its real provenance. The latter can unblock the join
and frequency review, but does not by itself satisfy pickup or live acceptance.
After the frequency report, deliberately choose catalog/archetype expansion or
an explicitly approved benchmark revision; do not silently redefine success.
Record the actual acquisition/matrix evidence before enabling `pickup_kind` or
updating release documentation. No game, sync, or save operation was performed
as part of this audit.

### Outstanding whole-plan requirements

- [x] Capture an actual runtime ItemConfig export with actual session provenance,
  join installed EID, reconcile every quality, and inspect unknown classifications.
- [ ] Resolve authoritative successful resource-pickup acquisition semantics
  before enabling `pickup_kind`; collision alone remains insufficient.
- [x] Use the vanilla-frequency evidence to review breadth and resolve the
  Q0/Q1 benchmark conflict under the explicitly approved capacity-aware policy;
  unchanged-seed offline release gates now pass at every quality. This does not
  assert new catalog capacity or live-model diversity.
- [x] Obtain authorization for mod sync and a disposable session, excluding
  Save File 1; record the completed allowlisted sync and save-protection receipt.
- [ ] Reload the repaired bridge/game and record the condition/effect/lifecycle
  matrix. The current evidence checker reports **blocked, 0/63 cases and
  0/130 scenarios**; authorization and offline tests are not observations.

The whole-plan goal remains incomplete. The earlier pre-export handoff is
superseded by the runtime audit below: an authorized source sync and runtime
export occurred, but live gameplay acceptance did not. Do not infer the current
game process or loaded-source state from historical handoff notes. Existing
unrelated user changes are preserved; no commit or branch was created.

### Runtime audit session - October 25, 2026

- Installed-mod sync and a disposable REPENTOGON session were explicitly
  authorized. After restart, `nebius audit vanilla` captured `721` runtime
  vanilla-enum ItemConfig rows at `2026-10-25T14:36:41Z` from game `J273` /
  `REPENTOGON dev v1.9.7.12`, with EID `5.25_d7aab88` enabled.
- The unchanged runtime JSON is preserved at
  `work/vanilla-audit/itemconfig.json`. The joined EID report at
  `work/vanilla-audit/inventory.md` reconciles `721/721` rows, all quality
  counts (Q0 `89`, Q1 `225`, Q2 `203`, Q3 `166`, Q4 `38`), zero missing EID
  descriptions, and `1,625` unknown/partial clauses.
- REPENTOGON resolved the initial dynamically registered audit save to the
  existing `better donation machines` mod slot instead of a dedicated slot.
  The `180,611`-byte runtime payload was copied unchanged before further work.
  This is an exporter integration defect, not a dedicated-save success; the
  command is now capture-only and `audit.write` requires an explicitly supplied
  dedicated audit mod object. Do not run the earlier saving wrapper again.
- The live audit unblocks frequency review but not the remaining `pickup_kind`
  acquisition evidence or the `61`-case condition/effect/lifecycle matrix.

### Corrected frequency review - October 25, 2026

- Taxonomy 1.0.1 removes a false positive: "deals damage" was classified as
  a shop/deal mechanic. Regression coverage retains explicit shop, price,
  Devil Deal, Angel Room and deal-with-the-devil phrases.
- Regenerating from the unchanged runtime JSON preserves 721/721 joins,
  zero missing descriptions, all quality totals and 1,625 unknown/partial
  clauses. Shop/deal-tagged items decrease from 204 to 32; the previous
  shop-heavy frequency ranking must not guide implementation weights.
- Leading heuristic tags are spawn (178 items), damage (170), additive
  stats (131), pickups (127), probability (97), duration (92), and familiars
  (55). Q0/Q1 spawn counts are 29/66; damage 34/68; pickups 24/44;
  familiars 9/24. Tags overlap and partial matches remain manual-review
  candidates, not evidence that those complete vanilla items are supported.
- Working direction: retain the strict power-only duplicate benchmark and
  investigate bounded, genuinely distinct economy/summon/combat primitives.
  Do not promote low-quality items to multi-power archetypes solely to pass
  the metric. This prioritization does not resolve the 48-fingerprint capacity
  limit or authorize a benchmark change. Q0/Q1 release gates remain red.
- The audit proves data capture and reconciliation, not full semantic coverage:
  700 items retain conservative new-system/manual-review classifications.
  Numeric generation weights remain unchanged pending clause-level review.
- Focused audit/exporter tests: 21/21 passed, including rejection of missing
  explicit audit save targets before any SaveData call. No game interaction,
  installed-mod sync, or new save write occurred in this offline slice.
- The next live-session procedure is in scripts/conditional-acceptance.md.
  Pickup acquisition and all 61 live acceptance cases remain unverified.

### Post-export integration regression checkpoint - October 25, 2026

- A broader check found a new regression after the live audit integration:
  main.lua imports vanilla_audit at load time, but the two production Lua test
  harnesses did not supply its source. This caused unrelated product tests to
  fail during include, before reaching the behavior under test.
- Both harnesses now load the real vanilla_audit.lua module. A new production
  console-path regression invokes nebius audit vanilla with RegisterMod and
  product SaveData configured to throw, confirms the two-row fixture capture
  log marker, and verifies product savedata remains unchanged.
- Full Node suite: 480 tests, 457 passed, 23 failed, recorded in
  .test-runtime-audit-full.txt. Exact failure-name comparison against
  .test-power-history-final.txt finds the same 23 known baseline failures,
  zero new failures, and zero baseline failures silently removed. Condition,
  effect and power generated-metadata checks and git diff --check pass.
- Read-only follow-up on the misrouted audit save found that the installed
  Better Donation Machines main.lua has no SaveData, LoadData or HasData path;
  it changes room/entity sprites only. No prior savedata backup was located in
  its mod/data directories. This reduces evidence of an operational settings
  dependency but does not prove what existed before the audit write. The
  misplaced file was not deleted or overwritten and no recovery was attempted.
- Reinspection of the installed callback declarations still exposes pickup
  collision and shop-purchase callbacks, not a verified ordinary successful
  acquisition producer. pickup_kind stays disabled. This checkpoint adds no
  live observations and does not resolve the low-quality catalog capacity gap.
- No installed-mod sync, GUI action, new save write, commit or branch creation
  occurred in this regression-repair slice. The goal remains incomplete.

### Planner reachability review - October 25, 2026

- Rechecked the complete data-only mechanic catalog rather than a single batch:
  100 entries represent all 45 tracked semantic powers. No tracked power is
  absent from passive catalog entries, and no catalog entry has an empty power
  set. This rules out a missing planner mapping as the current Q0/Q1 remedy;
  it does not establish that the catalog covers every vanilla mechanic.
- Passive entries still normalize to 48 distinct fingerprints. The strict
  100-item duplicate gate needs 96 unique fingerprints. Runtime-supported
  numerical, trigger, condition and presentation variants must not be renamed
  into distinct powers to bridge this gap. Existing catalog-parity tests
  already guard capability coverage and semantic-power reachability.
- The next substantive diversity step is genuinely new bounded mechanics, or
  an explicitly approved change to the benchmark/archetype policy. Neither
  option is silently selected by this review. Existing Q0/Q1 gates stay red.
- No additional EID installation, item export or user-run terminal command is
  required. Before live verification, coordinate a disposable run and reload
  the capture-only safety update; prior sync authorization is not consent to
  replace a wanted run. Pickup acquisition and 61 live cases remain open.
- This review performs no installed-mod sync, gameplay interaction or save
  write. The full-plan goal remains active and incomplete.

### Distinct-mechanic frequency slice - October 25, 2026

- Taxonomy 1.0.2 now separates projectile reflection, projectile blocking,
  extra tears, player dash and enemy marking from generic damage/spawn cues.
  They are partial phrase matches, not executable profiles or full support.
  Reflection is not removal-only blocking; a damage shield is not necessarily
  a projectile blocker; familiar movement is not player movement; kill-order
  marks are not the same as marking an enemy for other enemies to attack.
- Regenerated the joined inventory from the unchanged runtime capture and
  installed EID inputs. All 721 rows still join, every quality delta is zero,
  no descriptions are missing, and all 1,625 unknown/partial clauses remain
  visible. Item dispositions remain 21 narrowly supported and 700 requiring
  manual review/new bounded design. Numeric generation weights are unchanged.

| Partial mechanic cue | Items | Q0 | Q1 | Next interpretation |
| --- | ---: | ---: | ---: | --- |
| Projectile blocking | 21 | 2 | 8 | Existing removal handler does not reproduce continuous orbital AI |
| Projectile reflection | 6 | 0 | 4 | Next distinct bounded defensive candidate |
| Player dash | 4 | 1 | 1 | Existing dash does not reproduce invulnerability or carry/slam |
| Extra tears | 2 | 0 | 2 | Existing cone/ring does not imply random or backward-shot delivery |
| Enemy marking | 1 | 0 | 0 | Single identified item; lower reuse priority until more evidence |

- The reflection examples are IDs 375, 423, 449, 542, 568 and 704; Q1
  examples are Metal Plate, Slipped Rib, Divine Intervention and Berserk.
  This supports investigating reflection as reusable breadth rather than
  relabeling the same block action. It does not resolve the 48-versus-96
  low-quality fingerprint deficit or claim exhaustive mechanic prevalence.
- Primary-source inspection finds REPENTOGON EntityProjectile.Deflect takes
  only a new velocity. Its Lua wrapper calls Reflect(nullptr, vel), so player
  ownership must not be assumed from that method signature. Source inspected:
  TeamREPENTOGON/REPENTOGON, commit
  63f776e937aec994010e3b6d3d2cabdc6af42818,
  repentogon/LuaInterfaces/Entities/LuaEntityProjectile.cpp; public method
  documentation: https://repentogon.com/EntityProjectile.html#deflect.
  The next handler needs explicit ownership/recursion semantics and bounded
  eligibility before it can be admitted as a new semantic power. No native
  reflection API was invoked in the game.
- Corrected stale audit README text that still claimed no runtime export
  existed, and checked off the completed capture/join/reconciliation item.
  The disabled pickup predicate, Q0/Q1 diversity gates and 61 live cases remain
  open. No additional export is required from the user.
- Focused audit/exporter suite: 24/24 passed. Full suite: 483 tests, 460 passed,
  23 failed (work/vanilla-audit/taxonomy-1.0.2-tests.tap). Exact failure-name
  comparison against .test-power-history-final.txt confirms the same 23
  baseline failures, zero new failures and zero baseline failures removed.
  git diff --check passes, with existing CRLF notices only. No installed-mod
  sync, gameplay interaction, save write, commit or branch creation occurred.

### Bounded projectile reflection - October 25, 2026

- Implemented reflect_projectiles as a seventh action in the existing defensive
  family. It returns moving ordinary hostile projectiles as plain BLUE tears
  with the triggering player as spawner, opposite the incoming velocity. Only
  variant 0, subtype 0 and flags 0 are eligible; special projectiles, lasers,
  friendly/player shots, zero/nonfinite velocity and invalid positions fail
  closed. This is not native Deflect or exact recreation of the six audit items.
- The contract bounds radius to 20-100, count/allocation attempts to 1-4, speed
  to 4-12, damage to 0.5-3, and success cooldown to 90-1800 frames. Returned
  tears share the 12-owner/64-global cap, 90-frame lifetime, owner/source/room
  cleanup and synchronous/descendant suppression with extra_tears. Model-facing
  guidance and Node/Lua summaries state the plain-tear and no-laser limits.
- Preflight is side-effect-free with respect to RNG, spawns, resources and
  condition/cooldown state. A bullet is removed only after a valid return tear
  is initialized. Failed spawn/conversion/removal cleans the tentative tear
  without consuming the original bullet. Earlier successful returns survive a
  later failure and commit their cooldown; failure before any actual return
  commits nothing. Allocation attempts are bounded even when all spawns fail.
- Wired both production entry points: player_hurt is post-confirmation and
  never cancels the original hit; active_use follows ordinary active-use rule
  dispatch. Product tests verify an unavailable return does not consume a
  once-per-run latch, actual return does, Continue retains that latch, room
  cleanup removes returns, and secondary tears cannot trigger extra-tear
  rules synchronously, asynchronously or through descendants.
- Added power.projectile_reflection, distinct from projectile blocking, to
  the shared catalog and Creator mechanical-wish recognition. There are now
  102 catalog entries, 46 powers and 49 normalized passive fingerprints.
  Names, supporting stats/conditions and numeric variants still do not create
  extra fingerprints. Reflection contributes one real outcome, not six item
  labels or several equivalent trigger variants.
- Runtime contract is 15, capability revision 9 and compact power-ledger
  contract 3. Inserting a sorted power key changes signature bit positions;
  version-2 snapshots are explicitly rejected rather than misread. Existing
  profile-based saves rebuild their ledger on Continue. No saved profile is
  silently migrated, and no old snapshot is relabeled as current. A deliberate
  source sync/restart is required before generation against the new contract;
  this slice did not sync or manipulate the running game.
- Regenerated effect metadata and the Lua power ledger. Taxonomy 1.0.3 now
  references the implemented bounded reflection subset while leaving every
  broad reflection clause partial. The unchanged runtime export still joins
  721/721 rows, with zero missing descriptions, all quality deltas zero, 1,625
  unknown/partial clauses and unchanged 21/700 supported/review dispositions.
- Focused effect suite: 28/28 passed; production reflection tests: 2/2; planner
  suite: 26/26. Condition/effect/power metadata checks and npm run validate pass.
  Final full suite: 491 tests, 468 passed, 23 failed, captured in
  work/vanilla-audit/reflection-release-regression.tap. Exact name comparison
  confirms all 23 baseline failures, zero new failures and zero baseline
  failures removed. Initial broader failures from stale capability/action-list
  and snapshot-version test fixtures were corrected before final acceptance.
- Deterministic 100-item batches at every quality validate all 500 generated
  profiles in Node and Lua. Q2/Q3/Q4 have zero exact duplicates and pass every
  gate. Q0/Q1 still fail the unchanged duplicate gate at 55%/53%; the optimistic
  49-fingerprint floor is 51%, versus 96 unique fingerprints required. Evidence:
  work/power-diversity/reflection.json. No benchmark or quality archetype was
  weakened to admit this result; the full-plan goal remains incomplete.
- The live completeness matrix now requires 62 cases (37 conditions, 7 actions,
  18 lifecycle cases), including effect.reflect_projectiles. Current actual
  evidence remains 0/62. pickup_kind stays disabled. No installed-mod sync,
  game/save mutation, live acceptance claim, commit or branch creation occurred.


### October 25 checkpoint: reviewed frequency selection priors

- Integrated content-contract/selection-priors.json and bridge/selection-priors.mjs
  into the primary family lottery and secondary candidate weighting. Only four
  reviewed powers are mapped: projectile blocking, reflection, dash and extra
  tears. All others are neutral. Eligibility, unused-first, recent-history,
  fingerprint exclusion, power budgets and independently sampled supporting
  choices retain their existing authority.
- Formula: globalRate = familyTotal / exportedItems; qualityRate =
  (qualityCount + 50 * globalRate) / (qualityTotal + 50); multiplier =
  clamp(qualityRate / globalRate, 0.5, 2). No evidence means neutral, not banned.
  Secondary weighting is the geometric mean over unique nonprimary powers.
  Shrinkage and clamps are design policy, not statistical confidence or proof
  of balance. Trusted briefs and batch reports expose provenance and factors.
- Corrected audit taxonomy to 1.0.4 before adopting evidence: counted volleys,
  tear bursts/clusters, shotgun attacks and explicit enemy-shot destruction
  now match. Additive Tears stats, impact splitting and negated blocking do
  not. In particular, Vengeful Spirit702 is not a blocking observation.
  Broad cues remain partial and do not increase full-item support claims.
- Reviewed totals/by-quality Q0–Q4: blocking22 [2,7,9,3,1], reflection6
  [0,4,1,1,0], dash4 [1,1,1,1,0], extra tears21 [4,7,5,4,1]. Quality totals
  remain [89,225,203,166,38], 721 joined rows and zero missing descriptions.
  The original export is unchanged: SHA256
  d675c79b46a60d9f399977bf7ed52ce94426408b260f5b2042abe5e0a69f2d6a.
  Reviewed report SHA256:
  b2b46c5f968eb81f05ee34403945c5d0175da88bb117cc4719558d9bcfe212a7.
- Added a read-only candidate extractor/check command with row-level distinct
  count reconciliation, metadata/hash validation and production fixture
  rejection. It does not automatically mutate source or rescan Steam during
  ordinary generation. Tests run with synthetic evidence and temporary files.
- Verification: audit/extractor suite23/23; priors/planner/design/extractor
  suite40/40. The 128-seed lottery test reconstructs weighted choices and
  proves they change from neutral without changing supporting choices.
  Unused-first, explicit Creator overrides, immutability and malformed
  provenance/input rejection are covered. Evidence --check, condition/effect/
  power metadata checks, npm run validate and git diff --check pass.
- Full suite:501 tests,478 passed,23 failed. Exact baseline-name comparison
  found zero added or removed failures. Artifact:
  work/power-diversity/selection-priors-regression.tap.
- Deterministic100-profile batches per quality validate all500 profiles in
  Node and Lua. Exact duplicate rates Q0–Q4:55%,52%,1%,0%,0%. Q2–Q4 pass all
  unchanged gates; Q0/Q1 still fail the strict below5% duplicate gate. The
 49 passive fingerprints cannot supply96 unique fingerprints required by
  that gate. No conditions/stats/numerical variants were counted as powers.
  Artifact: work/power-diversity/selection-priors.json.
- This slice is complete; the whole-plan goal remains active and incomplete.
  Next implementation work is genuine low-quality mechanic breadth, not
  weighting tweaks or relaxed release criteria. pickup_kind remains disabled;
  live evidence remains0/62. No new runtime export, installed-mod sync, game
  interaction, save mutation, branch or commit occurred. No user action is
  needed for further offline work; live testing needs a coordinated disposable
  run and an updated runtime before gameplay acceptance can be observed.

### October 25 checkpoint: next slice and pickup source recheck

- Bounded low-health execution is in implementation as a delegated slice.
  Its design/evidence review is scripts/vanilla-audit/execution-review.md.
  Acceptance is pending implementation, parent review and regression evidence;
  this checkpoint does not count an unimplemented power or live observation.
- Independently rechecked upstream REPENTOGON commit
  2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3 and the installed enum resource.
  The generic post-collision path still fires after internal collision code
  runs without an acquisition-success argument or success-based filter.
  Restricted purchase/card/pill callbacks do not implement ordinary pickup
  acquisition. Source paths, installed hash and limits are recorded in
  scripts/pickup-probe/callback-source-review.md. pickup_kind remains disabled.
- No game operation, installed-mod sync, fresh export or save write occurred.
  The goal remains active; meaningful implementation work is running, so this
  is not a whole-goal blocked/completed declaration.

### October 25 checkpoint: live evidence completeness correction

- Parent review found that the previous live checker could count a condition
  complete from a single happy-path observation, despite the runbook requiring
  both eligible and ineligible behavior and explicit threshold checks.
- Report contract2 now requires satisfying and failing scenarios for every
  condition. Comparison predicates ending in _at_most/_at_least additionally
  require boundary and adjacent observations. A case counts as observed only
  when every required scenario has valid passing evidence. A failing scenario
  means a successful test of rejection, not passed=false. Failed test records
  still block the report even when other observations pass.
- Effects and lifecycle cases retain behavior observations; their actual
  expected/observed descriptions must cover the runbook. New report fields
  expose the required/missing scenarios and distinct scenario totals. Old
  condition records without a scenario no longer establish acceptance.
- Focused checker tests9/9 pass, including duplicate positive observations,
  missing negative and boundary cases, invalid scenario/case values, and a
  complete explicitly synthetic test matrix. Scoped diff check passes.
  The real report remains blocked:0/63 cases and0/130 scenarios observed with
  the in-progress execution action included. No live data was synthesized.
- Delegated execution implementation is still running. Parent review also
  requested credited EntityRef availability during pure preflight, before
  condition RNG, rather than discovering an unavailable owner reference only
  after entering the mutation handler. Final acceptance awaits that fix and
  settled integration/full-suite evidence. No game/save operations occurred.

### Bounded ordinary nonboss execution - October 25, 2026

- Implemented execute_enemy as the eighth expanded action, sharing the target
  family rather than relabeling a stat. It kills only the single eligible owned
  event target on enemy_hit, tear_impact or collision. hp_ratio is bounded to
  0.05-0.20 inclusive, action cooldown to 90-1800 integer frames, and weight to
  3 + 10 * hp_ratio. No room scan, boss damage, enemy-type erasure, native-item
  invocation, uncredited kill, HP write or removal fallback is provided.
- Read and independently fetched the primary Entity/ModCallbacks documentation
  before settling semantics. Full API anchors, design decisions and automated/
  live acceptance details are in scripts/execution-integration.md. The parent
  evidence review scripts/vanilla-audit/execution-review.md is preserved and
  referenced, as are the separate pickup source-review and report-v2 changes.
  Flush!, Little Horn and Eraser are related instant-kill clauses, not exact
  low-health execution equivalents; Damocles self-kill clauses are not support.
- The API documents buffered damage and next-frame HP updates. Eligibility is
  strictly positive finite observed current/max HP, current<=max and
  current/max<=hp_ratio; never subtract callback damage or predict pending HP.
  HasMortalDamage must explicitly return false. Exists, IsEnemy,
  IsActiveEnemy(false), IsVulnerableEnemy, IsBoss, IsDead, ToNPC, GetData,
  friendly/charm checks and callable KillWithSource are required. Unknown,
  missing, throwing and malformed eligibility getters fail closed. Parent/
  Child-linked and expanded-secondary targets are conservatively rejected.
- Pure canRun validates a credited EntityRef whose Entity is the actual owner,
  as requested in parent review, before RNG or latches. The guarded handler
  repeats target/source checks immediately before mutation. enemy_hit rules
  containing execution route through confirmed post-damage dispatch even
  without a damage condition, never the pre-damage callback; absent confirmed
  callback support leaves that route inert rather than predicting a hit.
- KillWithSource is the only killing call. Always query IsDead after invoking
  it, even when its protected call reports an exception: newly observed death
  is irreversible success and consumes action cooldown/parent latches. This
  parent-reviewed correction prevents repeated real kills when a downstream
  callback throws after death. Errors before death, no-op, removal-only and
  failed/nonboolean death observations remain no-success paths. A missing or
  mismatched EntityRef also fails before condition RNG. No asynchronous death
  prediction, existence substitute or blanket claim of engine-call success.
- Existing module/combat guards suppress synchronous attributed and uncredited
  generated on-kill callbacks and reentrant execution, and unwind on errors.
  Cooldowns remain source/owner/action scoped, survive room cleanup and Continue,
  and clean up on source loss. Execution allocates no managed actors.
- Runtime contract16, capabilities10 and compact power ledger4 are integrated.
  The shared power.execution mapping covers every delivery/threshold as one
  genuine semantic family; sorted compact signatures changed, so older live
  snapshots are rejected. Validated profile-based Continue saves rebuild the
  ledger normally. Repository-only generators refreshed effect_metadata.lua
  and power_ledger.lua. Node/Lua schemas, budgets, summaries, production repair,
  planner skeletons and Creator execution parsing use the same action contract.
- Execution's selection prior is neutral1 at every quality. No new reviewed
  mapping, curated selection-priors.json mutation, audit inventory/report
  regeneration or frequency/recreation claim was made. Benchmark seeds,
  support rates, budgets, archetypes and release gates are unchanged.
- Final focused Node/Lua suite36/36; production execution callbacks3/3;
  planner/context/prior/compatibility/server integration59/59. Artifacts are
  work/power-diversity/execution-focused.tap, execution-production.tap and
  execution-integration.tap. Coverage includes observed-buffer boundaries,
  invalid/mortal/boss/allied/linked targets and getters, credited source checks
  before RNG, mutation-time revalidation, ineffective/removal/error outcomes,
  death followed by downstream callback error, reentrancy, success-only parent
  latches, co-op/source isolation and actual production Continue reconstruction.
- Full npm test:516 total,493 pass,23 fail, including the parent's four new
  acceptance-verifier tests. work/power-diversity/execution-regression.tap and
  execution-failure-comparison.json record exact comparison against both
  .test-power-history-final.txt (UTF16LE) and selection-priors-regression.tap:
  the same23 failure names, none added or removed. Existing unrelated failures
  are preserved, not reclassified as passes. Metadata freshness checks pass.
- Deterministic local skeleton batch execution.json accepts/validates100/100
  at each quality with47 powers. Q0/Q1 compatible fingerprint capacity is50,
  still below96 required; observed duplicate rates53%/52% leave those gates red
  and --enforce-gates exits1. Q2-Q4 duplicates0%, capacities1253/986/986; all
  other measured gates pass. The changed catalog removes the former seeded
  constrained-repeat occurrence; only that deterministic test expectation was
  updated, not the benchmark, archetypes or gate thresholds.
- Acceptance remains pending parent final review and real-game evidence:
  report-v2 live gate0/63 cases,0/130 scenarios observed. No installed-mod sync,
  game interaction, save/export operation, commit or branch creation occurred.
  This is a completed bounded implementation slice, not whole-plan completion
  or live acceptance. The parent's pickup_kind blocker remains unchanged.

### October 25 checkpoint: execution parent review in progress

- Parent independently verified42/42 focused effect/acceptance tests and3/3
  production execution tests across enemy_hit, tear_impact and collision.
  The credited EntityRef preflight correction is present and production tests
  prove invalid owner references fail before chance RNG is consumed.
- Review identified a second correctness issue before final acceptance:
  KillWithSource may perform the irreversible death and then throw from a
  downstream callback. Returning failure immediately on that error would leave
  cooldown/latch state uncommitted despite actual execution. The implementation
  task must observe death even after a call error and commit on observed actual
  death, while retaining failure for no-op, pre-death error or removal-only
  outcomes. Unit and production regressions were requested.
- These focused passes are intermediate evidence, not final slice acceptance.
  The delegated task remains live; no duplicate implementation was launched.
  No runtime export, installed-mod sync, game/save operation or live claim
  occurred. The whole-plan goal is still active and incomplete.

### October 25 checkpoint: execution offline parent acceptance

- The delegated implementation is terminal/completed and reports no remaining
  source edits. Parent compared hashes of37 tested source/contract files at
  handoff: none changed after independent final regression validation.
- Parent accepts the bounded execution implementation for offline scope. Both
  reviewed fixes are present: credited EntityRef preflight precedes RNG, and
  observed death commits cooldown/latches even after a downstream call error.
  No-op, pre-death error and removal-only outcomes remain unsuccessful.
- Independent final suite:516 tests,493 passed,23 failed, in
  work/power-diversity/execution-parent-regression.tap. Exact comparison with
  the original23 baseline names found zero added or removed failures. Condition,
  effect and power metadata checks, npm run validate, curated selection-prior
  --check and git diff --check pass.
- The measured500-profile batch validates all profiles in Node and Lua.
  Duplicate rates Q0–Q4 are53%,52%,0%,0%,0%. Q2–Q4 pass; Q0/Q1 retain only50
  compatible fingerprints against96 required. No release gate was relaxed.
- Current source contracts are runtime16, capabilities10 and power ledger4,
  with47 semantic powers. This does not update an already running Isaac.
  Live acceptance remains0/63 cases and0/130 required scenarios; pickup_kind
  remains disabled. The whole-plan goal remains active and incomplete.
- The next read-only research task is prioritizing genuinely distinct bounded
  mechanics from current catalogs, actual EID evidence and primary API sources.
  It cannot count unimplemented candidates as powers or replace live evidence.
  No game/save operation, mod sync, fresh export, commit or branch occurred.

### October 25 checkpoint: live timestamp validation correction

- Reproduced false acceptance of2026-02-30T00:00:00Z and a date-only value
  in an explicitly synthetic complete matrix. Date.parse normalizes some
  nonexistent dates, so finite/non-future checks alone were insufficient for
  the runbook requirement of an actual recorded UTC timestamp.
- The checker now requires date/time through seconds, optional1–3 fractional
  digits and explicit Z/+00:00 UTC. Calendar components must round-trip exactly;
  impossible dates, date-only/local/non-UTC values, rolled midnight, malformed
  objects and future observations cannot establish acceptance. No existing
  real observation was repaired, invented or backfilled. Report contract2 and
  all existing scenario requirements remain unchanged.
- Focused checker tests11/11 pass, including valid leap day, UTC suffix and
  millisecond precision cases. Full regression:518 tests,495 passed,23 failed
  in work/power-diversity/acceptance-timestamp-regression.tap. Exact original
  baseline comparison found zero added or removed failure names. Scoped diff
  check passes; real acceptance CLI remains blocked0/63 and exits1 as expected.
- The portfolio research task remains live and read-only apart from its one
  requested design artifact. No generated candidate is counted as implemented
  breadth. Whole-plan implementation and live/pickup release gates remain
  incomplete. No game/save/mod-sync/export/commit/branch operation occurred.

### October 25 checkpoint: continuation needs no new user export

- The completed portfolio is recorded in scripts/vanilla-audit/next-mechanic-portfolio.md.
  It recommends bounded nonexplosive ordinary-rock removal, not ten speculative
  additions. Timed/contact shields are not new powers; gold visuals and ordinary
  coin rewards do not establish another distinct power. No candidate receives
  diversity capacity or a curated prior merely from this research.
- The existing ordinary-rock implementation task remains active. It must resolve
  native collateral behavior, special-rock exclusion, observed mutation success
  and owner-wide room quota persistence before the action can be admitted.
  A primary-source safety blocker must stop admission rather than be mocked away.
- Corrected the live runbook to derive current totals from the checker instead
  of its stale 62-case count, and added the accepted execution action checklist.
  The acceptance checker focused suite remains 11/11; git diff --check passes.
- No further EID installation, export, terminal command or immediate Isaac action
  is requested from the user. The captured inventory is sufficient. Coordinated
  live gameplay acceptance is still a separate incomplete gate. The whole-plan
  goal stays active; no game/save/mod-sync/export/commit/branch operation occurred.

### October 25 checkpoint: candidate semantic review

- The portfolio research task is confirmed running; the existing task was
  retained rather than restarted or duplicated. Parent requested its first
  verified recommendation before waiting for an exhaustive portfolio.
- Manual review of the current721-item inventory finds native gold-status
  reuse in MidasTouch202 Q1 and EyeOfGreed450 Q2. This is not accepted as new
  diversity capacity: freeze plus an ordinary coin reward and gold visual
  may be equivalent under the existing semantic rules. A different API or
  visual is insufficient evidence of a new distinctive power.
- Nonexplosive obstacle-breaking evidence appears in SulfuricAcid463 Q2 and
  Terra592 Q3. CrackedOrb675 Q1 also changes doors/map and selected rocks, so
  its complete behavior is not an equivalent safe primitive. Door/secret-room
  and broad terrain mutations need separate safety scrutiny; no native flag
  or rock-breaking handler was enabled from this preliminary evidence.
- These findings were supplied to the research task. No candidate is counted
  as implemented or assigned a frequency prior. The current source remains
  the verified47-power execution baseline; live and low-quality release gates
  remain open. No game/save/mod-sync/export/commit/branch operation occurred.

### October 25 checkpoint: visible live scenario progress

- Acceptance Markdown and CLI output now show both completed cases and required
  scenario totals. A new test proves one positive condition observation reports
  one scenario but zero completed cases, with the negative scenario still missing.
  No evidence schema, scenario requirement, timestamp rule or gate was relaxed.
- Focused acceptance tests pass 12/12. The parent intermediate full run records
  519 tests, 496 passed and the exact 23 original baseline failures, with no
  added/removed failure names, in
  work/power-diversity/acceptance-progress-regression.tap. This run predates the
  rock investigation task handoff and is not final acceptance of its changes.
- Condition/effect/power metadata freshness, npm run validate and reviewed
  selection-prior --check pass. Real observations remain 0/63 cases and 0/130
  scenarios; the CLI correctly exits 1. Reports contain no synthetic passes.
- The unchanged 500-profile batch in
  work/power-diversity/acceptance-progress.json validates 100 per quality in Node
  and Lua. Q0-Q4 duplicate rates remain 53%, 52%, 0%, 0%, 0%; only the Q0/Q1
  duplicate gates fail. Unimplemented rock removal contributes no capacity.
- The rock task has identified a native safety proof gap and is documenting it
  rather than enabling a speculative action. Final handoff and parent review
  remain pending. Whole-plan completion is not claimed; no game/save/mod-sync/
  export/commit/branch operation occurred.

### October 25 checkpoint: ordinary-rock safety stop

- Implementation investigation stopped before enabling an action, as required
  when exact ordinary-only attributed mutation cannot be established. See
  `scripts/ordinary-rock-integration.md` for the concrete source evidence and
  reachable design requirements. The native REPENTOGON destruction hook calls
  opaque `super`; documented cell/type/state/collision checks do not establish
  exclusion of all ladder/drop/multipart downstream effects. Repentance+ tagging
  of `DestroyGridWithSource` is not installed-J273 availability proof. No
  uncredited fallback, RemoveGridEntity, Room.Update or speculative handler.
- Added three negative tests in `bridge/ordinary-rock.test.mjs`: action and
  semantic absence; production Node/Lua rejection across eight delivery
  contexts; and Creator/planner nonadmission at all five qualities. These prove
  fail-closed absence, not native mutation safety. No positive production rock
  quota/Continue/co-op/partial-success acceptance is claimed.
- Metadata freshness checks for conditions/effects/powers and `npm run validate`
  pass (`work/power-diversity/ordinary-rock-metadata.txt` and
  `work/power-diversity/ordinary-rock-validate.txt`). Focused production Node/Lua
  suite: 268/268 pass (`ordinary-rock-focused.tap` in that directory).
- Final full regression: 522 tests, 499 passed, 23 failed, zero skipped/cancelled
  (`work/power-diversity/ordinary-rock-regression.tap`). This includes the
  parent's concurrent acceptance-progress test plus the three absence tests.
  Exact-name comparison against UTF16LE `.test-power-history-final.txt` finds
  zero added/removed failures; artifact `ordinary-rock-failure-comparison.json`.
- Unchanged-seed `milestone4` batch: 500/500 profiles accepted in Node/Lua, 100
  per quality, no action added. Duplicate rates Q0-Q4: 53%, 52%, 0%, 0%, 0%.
  Q0/Q1 retain the failing below-5% gate; Q2-Q4 pass all gates. Artifacts:
  `work/power-diversity/ordinary-rock-diversity.json` and matching `.txt`.
  Q0 budget 4 and all archetypes/benchmarks are unchanged.
- Runtime16/capabilities10/ledger4 and 47-power capacity remain unchanged; no
  sorted-key insertion, save migration, curated prior or inventory regeneration.
  Parent-owned checker/test/runbook files were not edited by this task. Matrix
  remains 63 cases/130 scenarios; parent should adjust it only if a later action
  actually lands. No mod sync, game/save/export operation, commit or branch.
  Main goal and live acceptance remain incomplete; this is a blocked candidate,
  not an admitted family.

### October 25 checkpoint: final handoff review and remaining gates

- The ordinary-rock task is terminal/completed. Parent reviewed its blocker
  artifact and all three absence tests; no rock action or semantic power was
  implemented. Keep the acceptance matrix at 63 cases and 130 scenarios.
- Independent parent regression after the handoff: 522 tests, 499 passed,
  23 failed, zero skipped/cancelled, in
  work/power-diversity/ordinary-rock-parent-regression.tap. Deduplicated exact
  comparison with the original UTF16LE baseline finds 23 failure names, zero
  added and zero removed. This is regression parity, not a wholly green suite.
- Reviewed the final unchanged-seed batch: 100 accepted and runtime-validated
  profiles per quality. Q0/Q1 have only 50 compatible fingerprints against 96
  required and duplicate rates of 53%/52%; Q2-Q4 capacities are 1253/986/986
  and duplicate rates are zero. Retrying the same finite catalog cannot supply
  the missing 46 compatible fingerprints. No numeric/condition/delivery/visual
  variants, ordinary rewards or costs may be counted as new powers.

| Remaining requirement | Evidence needed to finish | Current finding |
| --- | --- | --- |
| Successful ordinary-pickup event and pickup_kind | Authoritative successful-acquisition contract with actual owner, covering coin/key/bomb/heart/battery, then production integration and rejection tests | Post-collision source review does not provide that contract; condition stays disabled |
| Q0/Q1 below-5-percent power duplicates | At least 96 genuinely distinct compatible fingerprints, followed by unchanged-seed Node/Lua batch and balance acceptance | 50 available; reviewed shortlist has no newly admitted safe primitive; rock candidate requires unresolved native safety evidence |
| Live condition/effect/lifecycle acceptance | Coordinated disposable session on a verified synced build, preserved saves, genuine recorded observations for every required scenario | 0/63 cases, 0/130 scenarios; offline tests cannot replace these observations |
| Balance and remaining native-behavior decisions | Actual gameplay evidence for the implemented expansion and a reviewed safe design for any further low-quality breadth | Not established by EID reuse, method existence or absence tests |

- These are the same unresolved release requirements recorded in the preceding
  goal turns, not newly invented requirements or permission to narrow scope.
  All delegated work is now terminal; no live child implementation remains to
  wait on. Whole-plan completion is unproven. Further gameplay requires a newly
  coordinated disposable test session, not another EID installation/export or
  user-run terminal command. Do not assume the earlier audit-sync authorization
  authorizes replacing the user's current run or manipulating wanted saves.
- The reviewed rock design remains optional future breadth, not a reason to
  claim the original plan complete. Do not bypass its blocker with speculative
  mutation or automatically relax existing diversity gates. No game/save/
  mod-sync/export/commit/branch operation occurred in this review.

### October 25 checkpoint: user-authorized diversity policy and mod sync

- The user explicitly confirmed no wanted run, authorized mod sync, required
  Save File 1 to remain untouched, and approved changing the gate/archetypes
  so the existing 50 compatible fingerprints can satisfy diversity acceptance.
  This supersedes the earlier prohibition on changing that gate; no archetype,
  budget, seed, semantic power or generation selection behavior was changed.
- Q0/Q1 now require fewer than five excess duplicates per 100 profiles after
  subtracting capacity-forced repeats, max(0, requested minus compatible
  fingerprint capacity). With capacity 50, at least 46 distinct fingerprints
  pass; 45 fails. Capacity growth tightens the allowance automatically. Q2-Q4
  retain the absolute strictly-below-5-percent rule and require 96 unique.
  All other gates remain enforced. Raw duplicate rates remain visible; no
  condition/numeric/delivery/visual/stat/cost/reward variant becomes a new power.
- Reports are version 2, expose duplicatePolicy (including raw gate result,
  unavoidable/excess counts and policy mode), and enforce
  duplicatesWithinQualityPolicy. Empty/incomplete batches fail; tests cover
  the strict boundary, small batches, invalid counts and increasing capacity.
- Focused planner/policy/sync tests: 32/32 pass. Independent full regression:
  526 tests, 503 passed, the exact 23 baseline failures, no skipped/cancelled
  tests or added/removed failure names, in
  work/power-diversity/authorized-capacity-regression.tap. Metadata freshness,
  npm run validate, curated prior --check and whitespace validation pass.
- The unchanged-seed 500-profile Node/Lua batch now exits 0 and passes all
  quality gates: work/power-diversity/authorized-capacity.json. Q0/Q1 have
  47/48 unique fingerprints; raw duplicate rates remain 53%/52%, policy excess
  rates are 3%/2%. Q2-Q4 have 100 unique each and zero duplicates. This is an
  authorized policy change, not newly implemented mechanic capacity or live
  evidence. The earlier strict Q0/Q1 blocker is resolved under this policy.
- Isaac was not running. Synced 36 allowlisted mod files to the configured
  installed live_sprite_swap_demo directory; every installed file matches
  source bytes. No game process was launched and no save was copied, written,
  restored or deleted. Read-only before/after hashes, sizes and modification
  times match for all 18 discovered game-data/Steam-save files, including 14
  slot-1-named files. Evidence:
  work/power-diversity/authorized-sync-save-protection.json. The sync test also
  verifies an existing save1.dat survives unchanged and the manifest has no
  save/.dat targets. Historical audit corruption was not repaired or altered.
- Live acceptance remains unrecorded; pickup_kind and speculative rock removal
  remain disabled. Next operator step: open Isaac, select Save File 2 or 3
  before starting a disposable run, and coordinate the first production-path
  test. Save File 1 is out of bounds throughout. Whole-goal completion is not
  claimed; no commit, branch, new export or gameplay operation occurred.

### October 25 checkpoint: live generation reliability repair

- Live testing on Save File 2 exposed two separate stalls: an EPERM replacing
  the durable job journal, and terminal errors disappearing from transient IPC
  before the game consumed them. A failed invalid creep design consequently
  looked pending until the UI timeout; this was not a still-running model job.
- Journal replacement now retries EACCES/EBUSY/EPERM at most 12 times with
  bounded incremental waits. Other errors fail immediately. Real-file tests
  prove the prior journal and in-memory record survive exhausted retries and
  both advance only after successful atomic replacement. No save-file retry
  or fallback overwrite was introduced.
- Terminal error envelopes are retained and redelivered until ACK, validated
  before admission, and counted against the existing bounded IPC queue. Early
  ACKs cannot delete an unsent error. Lua acknowledges both Creator/Terminal
  errors and the early-return Generator-kept path; repeat delivery is harmless.
  This does not make an invalid generated design valid or establish balance.
- Updated the journal test's invalid slot from 64 to 128, matching the existing
  128-slot contract. Cancellation integration explicitly acknowledges its error
  and permits only the startup hello before asserting the queue is empty.
- Focused reliability/product/integration/sync suite: 226 tests, 226 passed,
  zero failed. Full regression: 529 tests, 507 passed, 22 failed. Exact-name
  comparison against authorized-capacity-regression.tap: zero added failures;
  only the obsolete journal-slot assertion is removed. Artifacts:
  work/generation-reliability-focused.tap,
  work/generation-reliability-full.tap, and
  work/generation-reliability-failure-comparison.json.
- Installed repair verification and live acceptance are separate steps. Do not
  count offline tests as game observations. Preserve Save File 1, do not drive
  or restart the user's running game, and recheck save hashes during any
  authorized allowlisted sync. The whole-plan goal remains incomplete.
- Repair sync completed: 36 allowlisted files match source exactly, all 18
  protected save-file hashes/sizes/mtimes are unchanged, and no game input or
  restart occurred. Receipt:
  work/generation-reliability-sync-save-protection.json. Installed Lua changes
  require the user to restart Isaac while remaining on Save File 2 or 3.
- The bridge journal has no nonterminal jobs. A guarded attempt to restart the
  existing bridge was rejected by execution policy before running; no process
  was stopped or started. The old bridge therefore still needs a manual
  stop/start before the new JavaScript retry behavior is active. Do not claim
  the repaired process or live reliability acceptance has been observed.

### October 25 checkpoint: prevent incomplete creep model actions

- Inspected the failed request's last model response and trusted brief. The
  local skeleton contained a complete spawn_creep action with radius 20 and
  duration 15. The model omitted both and added cost 3. The generic legacy
  action schema permitted this incomplete shape, despite runtime rejection;
  two design attempts per idea across eight ideas amplified the latency.
- Added a dedicated spawn_creep schema to the model-facing action union and
  excluded it from the permissive legacy branch. All rule and direct-proc
  deliveries now require type/amount/creep/radius/duration, restrict radius to
  20-80 and duration to integer 15-180, and forbid unrelated conversion/status/
  targeting fields. Runtime checks, bounds, weights, semantic skeletons,
  repetition policy, retry limits and item quality budgets are not relaxed.
  No default effect parameters or substitute mechanic is silently inserted.
- Boundary tests cover all four creep colors, both radius/duration endpoints,
  amount endpoints, every missing required field, invalid ranges/types and
  unrelated parameters. A subprocess/local mock-model test inspects the actual
  outgoing response schema and publishes the planned creep action unchanged
  after exactly one valid response, without repair or idea retries. This does
  not prove the external model will always follow the schema or eliminate
  other validation failures.
- Focused generation/design/pipeline/product suite: 218/218 pass. Full suite:
  531 tests, 509 passed, 22 failed; exact-name comparison with the preceding
  reliability run adds/removes zero failures. Whitespace check passes. Evidence:
  work/creep-schema-focused.tap, work/creep-schema-full.tap, and
  work/creep-schema-failure-comparison.json.
- This bridge-side source change needs no additional installed-mod sync; new
  generator child processes load it from disk. No real model request, game
  input, restart or save operation was performed for this checkpoint. The
  previous manual bridge/Isaac restart requirement for reliable terminal-error
  delivery remains; live acceptance and whole-plan completion are unproven.

### October 25 checkpoint: post-repair requirement audit

- Reconciled the current summary and outstanding checklist with the approved
  Q0/Q1 policy and completed sync, without changing historical checkpoints.
  The obsolete diversity blocker and authorization request are not pending.
- Fresh unchanged-seed Node/Lua batch: 500 profiles, 100 per quality; every
  gate passes for Q0-Q4 under the approved policy. Artifact:
  work/power-diversity/current-completion-audit.json. Dry-run validation passes
  in current-completion-validate.txt beside it. These are local catalog batches,
  not accepted external-model samples or live balance evidence.
- Revalidated source SHA256 values for the runtime export and all three pinned
  EID layers. All four match; the existing inventory joins/reconciles 721/721
  runtime items. Evidence: work/vanilla-audit/completion-source-check.json.
  Retained 1625 unknown clauses remain visible; this is not a claim that every
  vanilla mechanic is supported or manually classified with certainty.
- Fresh live checker remains blocked: 0/63 cases and 0/130 scenarios. There is
  no live.json evidence file. Updated reports are under
  work/conditional-acceptance/. No passing observations were synthesized from
  product tests or the user's informal generation session.
- Read-only process check confirms the pre-repair bridge PID 12028 still runs
  with its original 18:14 local start time; no Isaac process is currently found.
  The policy-rejected restart was not retried by another execution mechanism.
  The next live prerequisite is a manual bridge stop/start and Isaac launch on
  Save File 2 or 3. No additional EID export, sync, or slot-1 operation is needed.
- Remaining original requirements are authoritative successful pickup
  acquisition before admitting pickup_kind, recorded production behavior and
  lifecycle coverage, and balance acceptance. Neither an inferred pickup event
  nor a narrower shop-only condition can substitute for the requested contract.
  No safe offline edit establishes these missing observations; the goal is not
  complete. Optional rock removal remains rejected pending its native safety
  evidence and does not count as an implemented effect.

### October 25 checkpoint: familiar-run error repair

- User resumed the goal after a run with broken familiars. Reviewed run
  `1150677385_1003143245_3` on Save File 2, the engine log and the job journal.
  Preserved evidence under `work/familiar-run-repair/`: `isaac-before.log`,
  `error-inventory.json` and `generation-summary.json`. These are observations,
  not accepted lifecycle/balance scenarios.
- Categorized 580 missing-animation warnings: FloatDown 228, FloatSide 217,
  FloatUp 135. The generated ANM2 renderer supplied only Idle/Float/Hop/Spin,
  while native FollowParent requests directional Float clips. Added all three
  aliases using the existing Float frames; no sheet dimensions or art changed.
  Tests inspect all 128 slot animations plus the blank animation and exercise
  normal/idle-melee direction changes, duplicate callbacks and source cleanup.
- The single MC_PRE_USE_ITEM warning identified an unsupported Remove return
  key. Pre-use prevention now returns only `{Discharge=false}` in its three
  branches. MC_USE_ITEM return tables are unchanged. Confirmed against local
  primary REPENTOGON callback docs and CustomCallbacks.cpp; tests assert the
  exact pre-use keys for Terminal and generated active items.
- Generation journal: 25 jobs, 21 applied, four failed. Two failures dropped
  on_kill.damage_burst and one gave a nonfiring familiar an attack. The model
  now receives a skeleton-targeted schema requiring selected blocks, mechanics,
  quality and exact supporting stats/health. Familiar schemas discriminate
  firing/contact types; valid numeric tuning remains catalog-bounded. Initial
  and repair responses undergo this schema plus existing semantic/budget
  validation before publication. No model mechanics are silently substituted,
  no validator is relaxed, and creep-specific action schemas remain intact.
- The fourth generation failure was UND_ERR_SOCKET (remote connection closed).
  Its underlying provider/network cause remains unproven; no paid provider
  request was made, and no claim of fixing that external failure is made.
- Six additional `EL: invalid sublist` engine assertions appeared after Game
  Over in the newer log tail. There is no attributed Lua stack or proven mod
  cause. Recorded separately rather than assigning them to the animation bug
  or applying speculative entity-list mutations. Reproduction is still needed.
- Repaired the passive-completion harness missing Singularity Terminal item-ID
  mapping. This removes startup nil-arithmetic masking 17 existing test cases;
  it is a test-fixture repair, not evidence of 17 production bug fixes.
- Parent validation: familiar/art/product suite 219 total, 217 passed, two
  pre-existing failures (`work/familiar-final-focused.tap`); generation/planner/
  network suite 65/65 (`work/familiar-run-repair/generation-focused.tap`).
  Final full suite 547 total, 542 passed, five failed, zero new failure names
  against the previous 22-failure baseline; 17 old failure names removed.
  Evidence: `work/familiar-final-full.tap` and
  `work/familiar-run-repair/failure-comparison.json`. All metadata checks,
  dry-run validation and scoped whitespace checks pass. Five remaining failures
  cover condition scope, retaliation weights, artwork namespace, process/run
  manifests and the stale 64-slot reservation expectation; not hidden or waived.
- Under existing explicit sync authorization, synced 36 mod files and rebuilt
  all 129 installed familiar ANM2 files. Byte verification found zero mismatches.
  SHA256/size/mtime checks found no changes to 18 protected save files (including
  Save File 1), 205 existing generated PNGs or 207 generated profile JSON files.
  Receipt: `work/familiar-run-repair/sync-receipt.json`. No game input, game
  restart, bridge restart, save selection or save write was performed.
- Next live check: manually restart Isaac to load the predeclared ANM2 changes;
  use Save File 2 or 3 only. Check a normal firing familiar while moving in all
  directions, then a melee/shield familiar, room transitions and Continue.
  Confirm no missing Float clips or pre-use callback warning, and record whether
  the engine assertions recur at death/exit. Generate a contact familiar and an
  on-kill-burst item to check the targeted schema against the real provider.
  The earlier manual bridge restart prerequisite is not bypassed. No new EID
  export is needed. Live acceptance and whole-goal completion remain unproven.

### October 26 checkpoint: shield API repair and green integration baseline

- User reported another familiar failure and asked to patch it, then resume the
  goal. Preserved the October 25 test log and per-category inventory under
  `work/familiar-shield-repair/`. Run `1883503216_1005694526_1` used Save File 2;
  its five generation jobs all applied. There were no missing Float animation
  warnings or pre-use callback warnings in this log. This is not a claim that
  every earlier live requirement has passed.
- Found 1511 identical MC_POST_UPDATE errors: assigning CanBlockProjectiles
  raised a native userdata newindex error. Local primary sources establish it
  is a query method, not a writable property: `.reference-repentogon/docs/docs/
  EntityFamiliar.md` and the function registration in `LuaEntityFamiliar.cpp`.
  Removed the assignment entirely. Existing bounded projectile scanning and
  collision handling still implement shields; no speculative native property
  or broad pcall hides the failure. An aborted shield placement had prevented
  subsequent familiar/other post-update work from running.
- A strict familiar mock now exposes that method but rejects writes, matching
  the observed engine behavior. The new regression failed with the same
  newindex error before the patch (`before.tap`), then passed. It verifies
  nearby blocking, rejection of far projectiles, collision blocking, preserved
  method identity, no duplicate per-frame work and a later follower still
  following/firing. Existing ownership, cooldown and orphan tests also pass.
- Continuing the goal audit found another real familiar defect: the three
  familiar asset validators accepted only two-digit slots, rejecting 100-127
  from the existing 128-slot pool. A new exhaustive test reproduced rejection
  at 100 (`slots-before.tap`). All 128 canonical asset sets now validate. The
  pedestal path is bounded to runtime capacity and each familiar asset must
  match that reserved slot. Traversal, noncanonical names, mismatched slots,
  extra suffixes and out-of-range assets remain rejected. Existing canonical
  profiles and source contracts are preserved.
- Investigated all five earlier baseline test failures rather than waiving
  them. Updated stale scope-error text assertions while retaining rejection
  checks; loaded missing production modules in the retaliation harness; and
  updated namespace/capacity tests from the former 64-slot assumptions to the
  current 128-slot boundary. The extracted Lua validator also loads the exact
  production capacity declaration, failing closed if its marker changes.
  Intermediate full-suite validation caught that missing dependency before
  final acceptance. No condition, budget or release gate was weakened.
- Validation: focused production/familiar/art/ledger tests **229/229**; final
  full suite **549/549**, zero failures and zero new failure names. All five
  prior failure names are removed. Evidence: `integration.tap`,
  `final-full.tap` and `failure-comparison.json` under the checkpoint directory.
  Condition/effect/power metadata checks, dry-run validation and scoped
  whitespace checks pass. The deterministic unchanged-seed batch accepts and
  validates 100 profiles at each quality in Node/Lua; all Q0-Q4 gates pass
  (`diversity.json`). These remain local batches, not paid-model/live evidence.
- Authorized sync copied 36 manifest files and verified all 129 already
  corrected familiar animations. No changes to 18 protected save files,
  including Save File 1, 397 existing generated PNGs or 212 generated profiles
  were found by SHA256/size/mtime comparison. No game input, restart, save
  selection, save write, bridge restart, commit or branch was performed.
  Evidence: `sync-receipt.json`.
- The only other log warnings were 25 AnmCache reference-release warnings
  during shutdown, spanning EID and vanilla UI assets. There was no additional
  attributed Lua exception or EL invalid-sublist assertion in this log. Their
  underlying shutdown cause is not established or claimed fixed by this patch.
- Next narrow live check: restart Isaac on Save File 2 or 3, obtain a shield
  plus a normal firing familiar, move through rooms with enemy projectiles,
  then check Continue. Confirm the shield blocks nearby shots, the follower
  still moves/fires, and no CanBlockProjectiles error returns. No terminal
  command or additional EID export is required from the user.
- Whole-goal status: offline integration is now green, but formal live
  condition/effect/lifecycle evidence remains **0/63 cases, 0/130 scenarios**
  (`live-acceptance/` under this checkpoint directory). Successful ordinary
  pickup acquisition semantics and balance observations remain unresolved;
  pickup_kind stays disabled and optional ordinary-rock removal stays blocked.
  Do not synthesize passes from the informal run, remove these requirements or
  declare whole-goal completion from the green offline suite.

### October 26 checkpoint: guarded pickup evidence capture

- The preceding goal turn was progress: both familiar defects were reproduced,
  repaired and synced, and the full regression baseline became green. This
  continuation preserves that result and advances the remaining pickup-evidence
  path without pretending diagnostic snapshots implement acquisition.
- Rechecked the primary upstream commit history for CustomCallbacks.cpp,
  enums_ex.lua and callback documentation. The relevant changes are unchanged
  from the prior review; exact SHAs/dates are retained in
  `work/pickup-capture/upstream-source-check.json`. The generic post-collision
  notification still omits the native collision result/acquisition success.
  Source absence in these paths does not prove no possible implementation
  exists; the ordinary-pickup owner/success contract remains unresolved.
- Added `pickup_capture.lua` around the existing read-only observer. The
  production module is lazily loaded only after the operator issues
  `nebius probe pickups on`, with an active Save File 2/3 context and available
  numeric pre/post callback IDs. File 1, unknown identities and unavailable
  callbacks are rejected before loading either module. Capture remains off by
  default, is never persisted, and cannot register another mod or write SaveData.
- Existing pickup callbacks retain their original returns and gameplay path.
  The adapter emits plain diagnostic JSON to the existing engine log, never
  grants pickups, changes inventory, consumes RNG, modifies profiles or emits
  confirmed collection. All records retain
  `diagnostic_not_confirmed_acquisition`; no collected boolean is introduced.
  Inactive captures do not read game contexts or collider state.
- Capture is bounded to 128 records per explicit session and retains overflow
  counts across drains. It stops and clears pending references on room/run/save
  changes, Continue/exit, frame rollback, logger failure or record limit. The
  stop packet exposes pending/discarded records; tests include partial final
  batches so excess records cannot silently disappear. Status/off commands do
  not save settings. See `scripts/pickup-probe/README.md` for the coordinated
  session protocol and the limits of what these observations can establish.
- New unit and production tests prove protected-save refusal, lazy loading,
  exact co-op collider identity, callback-return neutrality, resource
  nonmutation, lifecycle invalidation, output bounds and fail-closed logging.
  Focused adapter/probe/sync suite **12/12**; production capture integration
  **2/2**. Final `npm test`: **557/557**, zero failures; all 549 preceding tests
  remain represented. Metadata checks, dry-run validation and scoped whitespace
  checks pass. Artifacts: `work/pickup-capture/focused-final.tap`,
  `product-focused.tap`, `full.tap`, `final-npm-test.txt` and
  `failure-comparison.json`. No release gate or validator was weakened.
- Under the existing explicit sync authorization, copied 37 allowlisted mod
  files with zero byte mismatches and verified all 129 familiar animations.
  The save/art/profile hash receipt proves no changes to 18 protected saves
  (including Save File 1), 397 existing generated PNGs or 212 generated profiles.
  Evidence: `work/pickup-capture/sync-receipt.json`. No game launch/input,
  capture activation, bridge restart, paid call, EID export, commit or branch
  was performed. This adds an opt-in diagnostic capability, not live evidence.
- The live checker remains blocked at **0/63 cases and 0/130 scenarios**; its
  fresh report is under `work/pickup-capture/live-acceptance/`. A coordinated
  disposable session can now capture the missing raw observations with one
  in-game command, rather than requiring a custom developer wrapper. Such a
  session still must cover ordinary coin/key/bomb/heart/battery pickups,
  rejection/full-inventory, shops, co-op ownership and same-frame resource
  changes, followed by authoritative semantic review. Do not narrow pickup_kind
  to shop/card/pill events, infer acquisition from a resource delta, synthesize
  live passes, or mark the whole goal complete.

### October 26 checkpoint: external-evidence blocker revalidated

- Three consecutive goal continuations after the capture implementation made
  no further implementation progress: the same external-evidence blocker was
  freshly checked each time. Isaac is not running; the last engine log remains
  the October 25 test session, contains zero pickup-capture packets, and no
  `work/conditional-acceptance/live.json` exists. There is no live process or
  delegated task being awaited. Evidence: `work/pickup-capture/blocked-audit.json`.
- The verified offline baseline remains 557/557. The installed fixes and opt-in
  capture are ready, but none of these checks establishes successful ordinary
  pickup acquisition, recorded lifecycle behavior or balance acceptance.
  pickup_kind remains disabled; the original 63-case/130-scenario live evidence
  requirement is unchanged. No unsupported fallback or fabricated pass was added.
- The whole goal is blocked, not complete, pending a coordinated disposable
  Save File 2/3 session and authoritative review of actual acquisition evidence,
  followed by the remaining production behavior/lifecycle/balance observations.
  No game input, restart, save operation, further sync, paid call, commit or
  branch was performed during these checks. Resume when new evidence or session
  coordination makes the next safe action available; do not replace the goal
  with a smaller offline-only completion claim.

### October 26, 2026 — pickup console constructor repair

- Fresh live evidence supersedes the unchanged-log blocker: the Save File 2
  session reports an MC_EXECUTE_CMD error at main.lua:2801, attempting to call
  a nil field `new` in the callback-time diagnostic include expression. The
  exact engine-side reason for that include result is not established.
- Load both inert module factories at mod startup, alongside other runtime
  modules, and construct diagnostic instances only after explicit opt-in and
  the existing active-run, Save File 2/3 and callback checks. Validate factory
  availability before constructing. Capture remains off by default and
  pickup_kind remains disabled. Console feedback now mirrors HUD/log status
  so refusals and enablement are visible while the debug console is open.
- Production regression simulates unusable callback-time includes and checks
  successful raw capture, console output and protected-save refusal. Updated
  startup-loading assertions and the neighboring runtime module fixture.
  Full suite: 557/557 pass, zero failures. Evidence:
  `work/pickup-capture/command-repair-full.txt`.
- Authorized sync copied 37 allowlisted files with zero source mismatches;
  all 627 protected save/art/profile files have unchanged hashes. Receipt:
  `work/pickup-capture/command-repair-sync.json`. Original error log preserved
  as `work/pickup-capture/command-error-log.txt`. No game input, restart or
  save writes performed. The running game still needs a user restart to load
  this patch; live capture success and whole-goal acceptance are not claimed.

### October 26, 2026 — familiar vault, weapon variety and explosion safety

- User-directed temporary vault: all three generation sources exclude familiar
  skeletons. Explicit familiar/companion wishes fail locally with an actionable
  message instead of making a paid request or substituting another mechanic.
  Legacy familiar validators, assets, saved profiles and semantic history remain
  intact. This does not claim that existing familiar runtime bugs are repaired.
- Bomb/laser/knife damage families have a fourfold primary-selection multiplier
  and remain eligible alongside minimum-degree families. Existing quality
  budgets, independent supporting choices, unused-first/saturation rules and
  duplicate policies remain enforced. Distinct compatible Q0/Q1 fingerprints
  are now 48 after vaulting, not the historical 50. The unchanged capacity-aware
  gate passes; no semantic fingerprint padding or threshold relaxation.
- Shots, knives and lasers receive one of six deterministic visible colors on
  an independent cosmetic stream. Targeted initial/repair schemas require the
  selected RGBA values. Optional bounded weapon color fields preserve legacy
  profile compatibility. Native two-frame SetColor refreshes stop on source
  loss, avoiding persistent weapon tint; damage remains nonaccumulating.
- Added standalone stats.explosion_immunity at weight 8, reflected in both
  validators, summaries, planning and the semantic ledger. Generated explosive
  tears (including saved explosive familiar profiles) intrinsically grant their
  owner explosion immunity while held, without a separate roll or extra cost.
  The damage guard precedes recursion/secondary-source exits and shields; it
  cancels explosion-flagged player damage only, never ordinary damage or enemy
  damage, and rechecks actual item ownership for co-op and source loss.
- Runtime/capabilities/power contracts are now 17/11/5. Power history is derived
  from retained accepted records; incompatible loaded runtimes fail preflight
  until Isaac and the bridge are restarted. No engine/save manipulation or
  automatic process restart was performed.
- Validation: 566/566 full tests pass, dry-run generation and scoped whitespace
  checks pass. Five deterministic 100-profile quality batches all pass Node/Lua
  validation and diversity gates; exact duplicate rates are 55%, 54%, 0%, 0%, 0%
  with compatible capacities 48, 48, 1157, 867, 867. Evidence:
  work/pool-rebalance/full.txt, validate.txt and diversity.json.
- Separate fresh-ledger sampling of 80 seeds per Q1-Q4 selected weapon damage
  in 32/66/41/35 items, zero familiars, and all six colors at each quality. These
  are offline samples, not guaranteed live run rates. Evidence:
  work/pool-rebalance/weapon-samples.json.
- Authorized sync copied 37 allowlisted files with zero source mismatches. All
  94,216 protected paths retained their before/after state; one historical path
  was already absent before sync and was not recreated. Saves, including File 1,
  were not written. Receipt: work/pool-rebalance/sync-receipt.json.
- Added mandatory live cases for standalone immunity, bundled explosive-tear
  safety and weapon tint. Acceptance remains blocked at 0/66 cases and 0/133
  scenarios; the legacy familiar case remains outstanding rather than removed.
  Pickup acquisition and whole-goal acceptance are still unresolved.

### October 26, 2026 — useful rewards, repeatable procs and health safety

- Recovered and completed the shared-checkout edits after all three delegated
  workers stopped at the provider usage limit. Final integration and review
  were performed in the parent; interrupted worker runs are not acceptance.
- Automatic generation excludes knife/laser-only mechanics unless trusted
  weapon availability is supplied. Explicit Creator weapon wishes remain
  available. Summaries state the numeric bonus and existing-weapon prerequisite;
  these modifiers do not grant a weapon. Custom familiars remain vaulted.
- New combat proc skeletons use luck_chance rather than once_per_room. Status
  and creep use base probability 0.2; native helper summons use 0.1; all add
  0.02 per luck, clamped to [0,1]. Status/creep/helper activation cooldown is
  zero. Other combat and expanded actions retain their bounded safety
  cooldowns while becoming repeatable luck rolls. Exact-event deduplication
  and synchronous/secondary-source recursion guards remain enforced.
- Status duration defaults to 60 frames; creep lasts 120 frames. These are
  effect lifetimes, not proc locks. Summons trigger on tear_fire during combat,
  replacing the room-clear-only default. New on-kill status profiles are
  rejected because applying a status to the already-dead target is a no-op.
  Lua still reads legacy profiles; saved trigger/latch choices are preserved.
- Native blue flies/spiders use familiar variants 43/73, assigned to the
  actual player, with unique child tracking. Helpers accumulate up to 32 per
  owner/item and 256 total. Dead children free capacity and source removal
  removes tracked helpers. Their damage and descendants cannot earn recursive
  generated procs, including when no expanded effect has ever run.
- Creep now uses player effect variants: red 46, green 53, yellow lemon-mishap
  32 and black 45. EntityEffect conversion precedes SetTimeout, LifeSpan,
  CollisionDamage and Scale assignment. Red/green/yellow use contact damage 1;
  black uses damage 0 and is described as slowing. Size is described as a scale
  rather than an unverified exact collision radius. Pools cap at four live
  puddles per color/owner/item. Tagged creep damage to any player is explicitly
  canceled, including descendants and co-op nonowners. Puddles expire by their
  native lifetime; their damage cannot recursively trigger more generated procs.
- Positive supporting stat roll rates are now 50/55/60/65/70 percent for Q0-Q4;
  positive soul-health rates are 30/35/40/45/50 percent. The independent support
  stream and weight budgets remain enforced. Health tradeoffs are disabled,
  new negative soul-health designs fail validation, and legacy negative values
  load without ever calling AddSoulHearts with a negative number. Soul-health
  summaries correctly report half-heart units.
- Q2-Q4 novelty fallback: only after all compatible families have been used
  and the equal-use candidate pool has no unseen fingerprint, allow a novel
  combination with an eligible least-used primary and secondary use counts
  at most one higher. Recent-history exclusion, singleton restrictions,
  explicit wishes, support rolls and budgets remain enforced. This avoids
  repeatedly selecting isolated single-power items after removing weapon-only
  rolls. Reports expose balancedSecondaryFallbacks; release thresholds were
  not relaxed and no stat/color/numeric variant became a new fingerprint.
- Runtime/capabilities/power contracts: 18/12/5. Both Node and Lua accept zero
  cooldown only for the supported repeatable actions, preserving other minima.
  Luck formula metadata is shown in EID/runtime-generated descriptions.
- Primary API references checked: IsaacDocs EffectVariant, EntityEffect and
  FamiliarVariant at https://wofsauge.github.io/IsaacDocs/rep/enums/EffectVariant.html,
  https://wofsauge.github.io/IsaacDocs/rep/EntityEffect.html and
  https://wofsauge.github.io/IsaacDocs/rep/enums/FamiliarVariant.html. Variant 32
  is PLAYER_CREEP_LEMON_MISHAP, not the newer Repentance+ yellow variant 204.
  Engine-facing configuration tests are not substitutes for in-game behavior.
- Final validation: npm test passes 581/581 with zero failures; npm run validate
  and scoped whitespace checks pass. Five unchanged-seed 100-profile batches
  pass both validators and every diversity gate. Duplicate rates: 58%, 57%,
  0%, 0%, 0%; compatible capacities: 46, 46, 1062, 819, 819. Bounded secondary
  fallback counts: 0, 0, 10, 1, 0. Evidence: work/useful-procs/full.txt,
  validate.txt and diversity.json. Intermediate failed reports are diagnostic
  snapshots, not final acceptance.
- Authorized sync copied all 37 allowlisted files with zero source mismatches.
  All 99,900 protected paths retained their before/after state, including the
  one historically absent path. Save File 1 was not written or selected.
  Receipt: work/useful-procs/sync-receipt.json; protected before-state manifest:
  work/useful-procs/protected-before.json. No game/bridge restart or game input.
- Live acceptance remains pending: 0/70 cases and 0/137 scenarios, including
  repeatable luck, summon accumulation, friendly creep and health safety.
  Test fresh generated items on disposable Save File 2/3 after manually
  restarting Isaac and the bridge. Existing saved proc rules are not silently
  migrated. Whole-goal completion and live balance acceptance are not claimed.
