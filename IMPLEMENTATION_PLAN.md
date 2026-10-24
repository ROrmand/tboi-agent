# Passive generator completion plan

Status: implementation audit, October 22, 2026. Milestones 1–9 have code paths
and automated coverage. Checked tasks mean implemented, not certified in Isaac.
No live-game acceptance was performed in this audit.

## Audit summary

| Milestone | Implementation evidence | Remaining acceptance |
| --- | --- | --- |
| 1: Rule lifecycle | Per-owner/item cooldowns, expiring source grants, subtype allowlists, bounded state | Same-room continuation and source removal in Isaac |
| 2: Combat procs | Credited kill bursts, impact statuses, contact/hurt retaliation, recursion guards | Piercing tears, simultaneous kills, co-op, deterministic balance encounters |
| 3: Weapons and actors | Combined tear behaviors, bomb union/max stacking, weapon bonuses, aura ledger, conversion | Engine damage recalculation and all four familiar/aura families |
| 4: Delivery recovery | Durable journal, preflight, stable errors, saved receipts, queued recovery, cancellation | Real process interruption around application/ACK |
| 5: Save isolation | Save-slot callback, migration, manifest union, process pinning, fail-closed ledger | Generate in A/B and continue A in the game |
| 6: AI Item / Creator | Static declarations, owner entitlements, trusted delivery, persisted requests, optional replacement | Paid/choice pedestals, rerolls, co-op, exit/continue |
| 7: Presentation | Local-model deadline/fallback, controller keyboard, saved hotkey, derived details, presentation allowlists | Installed-model latency/variety and controller/audio/visual checks |
| 8: Actives | Eight separate shells, fixed radial burst, six charges, bounded targeting/use, continuation | Charge restoration, alternate slots, duplicate-use engine behavior |
| 9: AIsaac | Grey Isaac sheet, Tech X null costume, five quality Generators, auto design-then-art, generator exchange | Pedestal replacement, devil deals, co-op with The Creator, continue/cancel in Isaac |

Evidence: `native/ipc/product.test.mjs` runs Lua with deterministic profiles and
engine mocks; `bridge/server.integration.test.mjs` uses local fake services and
restart/ACK fixtures. `native/ipc/slot-ledger.test.mjs` covers save and process
isolation. Protocol, weights, generation, sentence, and creator UI suites cover
their respective contracts. Run `npm test` and `npm run validate` for integrated
verification; these do not replace live completion checks.

Compatibility: capability catalog 4, generated profile 1, saved run state 3
(with explicit version-2 read migration), bridge/runtime contract 13. Optional
fields preserve old action semantics and existing passive IDs. Profiles share a
64-item run limit and 64-artwork global bank, with at most eight active profiles.

Still required before release:

- [ ] Sync deliberately, prepare artwork, and restart Isaac and the bridge.
- [ ] Run each milestone's live checks and record game/build/results.
- [ ] Evaluate latency/variety with an installed Nemo-compatible model; word lists
  remain the default and no model download is required.
- [ ] Tune repeatable combat weights using deterministic in-game encounters.


## Outcome and scope

Finish the existing passive systems, make generation recoverable, then build
the blank AI item and its character on that foundation. Model-assisted
inspiration and presentation follow. Active collectibles are a separate final
milestone with their own shells and use contract.

Keep the existing generator usable throughout. Generated behavior remains
catalog data executed by fixed handlers. Preserve existing accepted profiles,
collectible IDs, and artwork assignments across upgrades.

## Original starting point (historical)

| Area | Implemented baseline | Remaining work |
| --- | --- | --- |
| Combat procs | Kill, tear collision, and player collision callbacks with shared rule actions | Distinct effects, event ownership, recursion guards, and consistent per-target limits |
| Rules | Chance, once-per-room/floor, resource rewards, room stat grants | General cooldowns, durations, stack limits, pickup subtypes, and source cleanup |
| Weapons | Named tear flags; home/pulse/shrink updates; bomb damage/radius/poison; laser and knife damage | Defined stacking and ownership; bounded additional combat effects |
| Familiars and auras | Four familiar types, ranged patterns, generated animation, damage/slow/burn/fear auras | Lifecycle and interaction acceptance, temporary auras, consistent status handling |
| Generation | Structured output, JSON extraction, normalization, one model correction attempt, timeouts, diagnostics | Durable jobs, confirmed application, stable error codes, interruption recovery |
| Capacity | 64 passive IDs, durable session art reservations, single-save continuation | Protect artwork referenced by other continuable saves |
| Creator | Editor, quality selection, progress, errors, keyboard/mouse controls | Controller support, configurable hotkey, profile details, approved presentation catalogs |
| Randomize | Local word-list sentence generation | Optional local-model inspiration with fast fallback |
| AI item and character | Existing editor can be reused | Blank item, pickup transaction, pending requests, character, optional item replacement |
| Actives | Design notes only | Active shells, charge/use schema, targeting, handlers, persistence |

The product runtime is `demo/live-sprite-swap/main.lua`; the other IPC mod
directories are isolated probes. `prompts/item.md` is historical design material.

## Rules shared by every milestone

- [x] Add an effect's catalog entry, bridge schema/validator, weight, fixed Lua
  handler, and focused tests in the same change.
- [x] Distinguish profile format, saved-state format, and bridge/runtime
  compatibility. Bump the relevant version when its contract changes. Migrate
  older saves explicitly; never reinterpret an old field as a new effect.
- [x] Keep legacy reward procs readable and behaviorally compatible. Introduce
  new combat effects through explicit fields rather than changing old actions.
- [x] Store gameplay state by run, player, item, and effect. Keep entity-local
  latches on the entity; never serialize live entity references.
- [x] Reject unknown IDs, fields, targets, and unsupported combinations in both
  Node and Lua. Model repair must not bypass those checks.
- [x] Guard callbacks before accessing entity data or scanning entities when
  relevant systems are unused. Never register callbacks per generated item.
- [x] Use deterministic fixtures and seeded randomness. Run focused tests first,
  then `npm test` at each contract boundary.
- [ ] Record live-game checks separately from automated results. Inspect the
  installed REPENTOGON API before selecting a new callback or binding.

## Milestone 1: Rule state and effect lifecycle

Build the shared state needed by richer procs before adding their effects.

- [x] Add optional bounded rule/proc cooldowns measured in game frames. Define
  the evaluation order of cooldown, chance, and once-per-scope conditions.
  Failed conditions must not consume a successful-proc cooldown.
- [x] Extend room stat grants into a source ledger tracking owner, item, effect,
  value, expiry, and stack policy. Preserve today's maximum-per-item/player/stat
  behavior for legacy grants; new effects declare their policy explicitly.
- [x] Expire effects on duration, room/floor boundary, source removal, player
  removal, and run end as appropriate. Refresh caches only when totals change.
  Persist remaining durations without storing live entities.
- [x] Add an allowlist of pickup subtypes to the catalog. Preserve existing
  pickup types; reject subtypes outside their pickup family.
- [x] Bound ledger entries and child entities per item/player and globally.
  Refuse excess effects predictably rather than growing state indefinitely.

Primary files: `content-contract/capabilities.json`, `bridge/generate.mjs`,
`bridge/prompt-features.mjs`, `bridge/weights.mjs`, and product Lua.

Completion checks: two items and two players have independent cooldowns;
overlapping grants follow their declared policy; source removal clears only its
effects; same-room continue preserves valid grants; expired effects stay gone;
empty system lists cause no entity scan.

## Milestone 2: Distinct combat procs

Pass a bounded event context with owner, source item, source entity, target,
and position. Context comes from Lua, never from the model.

First proposed effect set:

| Trigger | Effect | Constraints |
| --- | --- | --- |
| `on_kill` | Damage burst at the killed enemy | Bounded radius, damage, target count, and cooldown; no recursive bursts |
| `tear_impact` | Slow, burn, or fear on the struck enemy | Bounded duration and burn damage; explicit once-per-tear/target policy |
| `collision` | Contact retaliation against the touched enemy | Bounded damage and per-target cooldown; no implicit invulnerability |
| `player_hurt` | Retaliation against the attacker or nearby enemies | Explicit target mode, radius, cooldown, and recursion guard |

- [x] Introduce effect IDs and target allowlists for each callback. Keep the
  existing reward action path available for reward-only profiles.
- [x] Resolve player attribution through supported tears, familiars, bombs,
  lasers, and knives. Never assign unattributed damage to player zero.
- [x] Record eligible damage ownership before death for new kill effects and
  dispatch once to the credited owner. Preserve the legacy reward proc's
  all-player kill semantics when loading old profiles.
- [x] Tag generated damage so retaliation and bursts cannot re-enter the same
  chain. Distinguish observed collision from confirmed damage for effects that
  require a successful hit.
- [x] Evaluate each eligible item's proc independently. Adding a newly owned
  item must not re-run another item's completed tear impact.
- [ ] Price repeatable effects by damage, target count, frequency, duration, and
  cooldown. Establish bounds and weights with deterministic encounters before
  exposing new IDs to the planner.

Completion checks: piercing tears, repeated contact, simultaneous kills,
co-op attribution, familiar kills, and generated-damage chains respect limits.
Legacy reward profiles still produce the same rewards.

## Milestone 3: Weapons, familiars, and auras

Complete lifecycle and interaction guarantees before increasing variety.

- [x] Replace the single stored `tear_update` specification with an explicit
  combination policy. Combine matching strengths within catalog caps, allow
  compatible behaviors, and compute visual changes from a stable base scale.
- [x] Define bomb stacking: add damage, union approved flags, and select the
  greatest requested radius so acceptance order cannot lower another radius.
- [ ] Keep laser/knife bonuses idempotent across repeated updates, persistent
  entities, owner changes, and item removal. Verify engine damage recalculation
  before deciding how to preserve a weapon's baseline.
- [x] Reuse bounded status application from Milestone 2. Add temporary aura
  activation through the source ledger; define duration refresh and overlap.
- [ ] Verify familiar counts, cooldowns, shielding, ownership, cleanup, and
  restored animation. Remove orphaned actors after source loss and room changes
  without removing another item's actors.
- [x] Add resource conversion as a bounded action with allowed input/output,
  sufficient-resource checks, atomic spend/grant, cooldown, and balance weight.

Completion checks: stacking has no unintended dependence on acceptance order;
source removal preserves other sources; all four familiar types and all four
existing aura types pass recorded game checks; conversions never grant output
without spending input; inactive systems remain idle.

## Milestone 4: Generation and delivery recovery

Extend the existing parser, correction attempt, and diagnostics. Publication
does not by itself prove application in Isaac.

- [x] Track explicit job states: received, preflight, reserved, designing,
  rendering, validating, queued, applied, and failed. Persist request ID, run
  identity, reservation, and state before irreversible transitions.
- [x] Preflight ComfyUI and runtime compatibility before reserving artwork.
  Once art may have been written or loaded, keep the reservation unless
  recovery can prove reuse is safe.
- [x] Add stable error codes for service availability, invalid output,
  incompatible runtime, capacity, timeout, stale run, and delivery failure.
  Show short in-game messages and retain full local diagnostics.
- [x] Keep one bounded model correction attempt. Retry connection failures
  only where safe; never blindly repeat an ambiguous image request or item
  application after timeout.
- [x] Track acknowledgement against durable application receipts in Lua.
  Repeated requests can be acknowledged without spawning/granting twice.
  Report applied only after the corresponding acknowledgement.
- [x] Recover queued jobs after bridge restart. Reconcile saved receipts before
  replay and reject late results for a different run or player.
- [x] Preserve the prompt on unrecoverable output and return an actionable
  error. Never silently count a neutral fallback as the requested item's success.

Primary files: `bridge/server.mjs`, `bridge/generate.mjs`, `bridge/network.mjs`,
`bridge/timing.mjs`, `native/ipc/server.mjs`, `native/ipc/protocol.mjs`, and
product Lua/UI.

Completion checks: crashes before publication and after application but before
ack, duplicate polls/acks, malformed or truncated JSON, unavailable art service,
full queues, timeouts, and run changes cannot duplicate items or overwrite art.
Logs distinguish generation time from time waiting for application.

## Milestone 5: Save-slot and capacity isolation

The 64 physical artwork slots are shared files. A save-slot key alone would
still allow one save to overwrite another save's artwork.

- [ ] Verify a stable save-slot identifier in the installed game. Report it
  with run identity and runtime compatibility. Do not guess from log paths.
  The documented save-slot callback and context reporting are implemented;
  stability across actual slot switches still needs the live check.
- [x] Migrate saved mod data to records per save slot/run. Preserve old
  single-save data; block ambiguous migration with a recoverable message.
- [x] Persist artwork manifests for all continuable runs. Reserve their union
  plus every artwork slot loaded during the current Isaac process.
- [x] Keep the existing artwork bank initially: its 64 slots are shared across
  protected saves. Display that global art limit separately from the per-run
  limit of 64 generated item IDs.
- [x] Free persistent manifests only after a confirmed ended or replaced run.
  Keep process-loaded artwork pinned until Isaac restarts.

Completion checks: save A, generate in B, and continue A retains A's art and
mechanics; restarting the bridge changes no reservations; corrupt or missing
manifests fail closed without erasing continuable saves.

Separate predeclared artwork banks are a later capacity decision, not a
prerequisite for safely supporting multiple saves.

## Milestone 6: Blank AI item and character

Implement the blank item first, then the optional character replacement mode.

- [x] Declare a blank passive and static art. Extend mod sync; require a game
  restart for new definitions.
- [x] Track blank-item entitlements per player/run. Pickup opens the existing
  creator when gameplay permits; multiple pickups queue entitlements rather
  than opening nested editors.
- [x] Add trusted delivery intent separate from model output: ordinary
  generation spawns a pedestal; blank generation replaces one entitlement with
  the generated collectible on the owning player.
- [x] Consume the entitlement only after durable application succeeds. Failure,
  cancel, capacity exhaustion, exit, and an offline bridge preserve it. Use
  Milestone 4 receipts to reconcile interrupted requests before retrying.
- [x] Persist pending prompts and entitlements. Resolve the correct player
  after continue and never deliver an old result into a new run.
- [x] Add the character, starting blank item, and a saved optional replacement
  setting. Initially replace eligible passive collectibles only.
- [x] Exclude quest/story items, actives, the blank, generated shells, and
  unsupported special pedestals. Preserve shop prices and purchase behavior,
  choice groups, and pickup ownership. Prevent replacement loops after rerolls.

Primary files: product Lua/UI, `content/items.xml`, new character declarations
and static assets, `bridge/sync-mod.mjs`, and the bridge delivery contract.

Completion checks: free and paid pickups, choice pedestals, rerolls, co-op,
cancellation, generation failure, continue, and capacity exhaustion neither
lose entitlements nor grant duplicate or unpaid shop items.

## Milestone 7: Inspiration and presentation

Inspiration (adapter implemented; installed-model evaluation pending):

- [ ] Add an optional local text-model adapter in `bridge/sentence.mjs` and
  endpoint/model configuration in `.env.example`. Evaluate a Nemo-compatible
  installed model; Randomize must not require a model download to work.
- [x] Request one editable concept, normalize its size/content, and reject
  reasoning or unusable output. Start with a 2.5-second request budget; fall
  back to the existing local sentence on timeout, failure, or invalid output.
- [x] Avoid recent repetitions. Keep word lists as the default until latency
  and variety are measured on the intended local setup.
- [x] Keep Randomize separate from item generation: no item/art reservation
  and no change to the planner's allowed mechanics.

Presentation (controls implemented; installed-game verification pending):

- [ ] Persist a configurable hotkey outside run state. Add controller focus,
  activation, cancel, and a supported text-entry path verified against the
  installed game API.
- [x] Map stages to readable labels. Show capacity, pending entitlements, and
  actionable errors without clipping editor controls.
- [x] Show profile details derived from validated mechanics, including limits
  and cooldowns, rather than only model-written description text.
- [x] Add approved sound/animation IDs with fallbacks. Apply consistent art
  prompts and frame validation while keeping assets bounded and predeclared.

Completion checks: Randomize works with no model and late results cannot lock
the creator; keyboard, mouse, and controller complete the flow; details match
the accepted profile; art and sounds fall back cleanly.

## Milestone 8: Active collectibles

Vaulted from product generation on October 22, 2026. The shells, handler, and
tests remain. The creator and bridge accept passive requests only.

Begin after passive lifecycle, delivery, and idle-work checks pass.

- [x] Predeclare a separate small bank of active shells and state its capacity.
  Preserve every existing passive shell's type and ID.
- [x] Add an active profile with catalog use effect, bounded charges, targeting,
  and use restrictions. First effect: a bounded radial damage burst reusing
  Milestone 2's combat primitive.
- [x] Implement fixed pre-use/use handlers and a result controlling charge
  spending. Model data never sets engine callback return flags.
- [x] Specify duplicated uses, alternate active slots, charge-restoring items,
  and co-op ownership before marking those interactions supported.
- [x] Extend continuation, blank-item delivery, creator selection, validators,
  and balance weights. Keep unsupported targeting modes out of the catalog.

Completion checks: success spends charge once; refused/failed uses spend none;
duplicated uses follow the declared policy; alternate slots and continuation
preserve the correct item, charge, and profile.

## Milestone 9: AIsaac and Generators

AIsaac is a second character. The Creator, the AI Item, and hotkey `8` stay as
they are. AIsaac starts with Isaac's health and no Generator.

- [x] Declare AIsaac and Generator 0–4. Copy the official grey Isaac sheet to
  `character_aisaac.png`, grayscale the Isaac portrait, and draw a custom name
  plate. Tech X goggles come from the vanilla costume through `costumes2.xml`.
- [x] While any AIsaac is present, replace eligible pedestals—including actives
  and devil deals—with the Generator whose quality matches ItemConfig. Skip
  quest items, generated shells, and the Generators themselves. Convert on
  pickup initialization, updates, and before collision, including rerolls,
  touched pickups, choice cycles, and revealed Flip items. Replacement does not
  depend on generation readiness. The Creator's optional replacement stays
  unchanged when AIsaac is absent.
- [x] Picking up a Generator queues one auto entitlement and shows the progress
  indicator without opening the creator. Quality and active/passive follow the
  replaced item. Extra pickups queue, up to 16. Failure, cancel, and capacity
  keep that Generator.
- [x] Auto jobs invent and validate up to eight ideas before reserving artwork,
  then render once. Manual creator jobs still reserve before generation. Active
  generation stays vaulted except for these generator deliveries.
- [x] If AIsaac receives any other non-quest collectible, remove it and grant
  the matching Generator.

Completion checks: automated morph, exchange, continue, failsafe, design retry,
and art-reservation tests pass. Live pedestal, devil-deal, co-op, and
continue/cancel checks in Isaac are still open.

October 22, 2026: packaged the locally extracted grey Isaac body and cosmetic
Tech X texture/animation, added reproducible asset preparation and regression
coverage, and synced all 20 startup files to the installed product mod. All
293 automated tests, the dry-run validator, and whitespace checks pass. Restart
Isaac for the remaining live acceptance checks; no live run was performed.

## Execution and release gates

Order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9. Milestone 1 supplies the shared
state for the callback rework; it does not expand feature scope by itself.

For each milestone:

1. Add catalog/schema and compatibility changes with fixtures.
2. Implement fixed handlers and state transitions.
3. Run focused tests and add behavior tests for new contracts.
4. Run `npm test` and `npm run validate` after integration.
5. Sync deliberately, restart Isaac when required, and perform live checks
   using deterministic profiles before model calls.
6. Record game/build, results, unresolved limitations, and example profiles.
   Update README status only when the evidence supports it.

Node/Lua mock tests do not prove engine behavior. Unperformed game checks leave
a milestone awaiting live acceptance. Automatic REPENTOGON binary replacement
is outside this plan.

## Catalog expansion

Implemented in the capability catalog, both validators, weights, repair, and
the fixed Lua handlers. Quality budgets stay 4, 8, 12, 18, and 24. Profile
version stays 1 and saved run state stays 3. Runtime contract is 12.

- [x] Repair missing grant stats, strip fields that belong to another action,
  and keep legal combat pairings on their triggers.
- [x] Add luck, heart, room, flight, and once-per-run/target conditions.
- [x] Add pickup subtypes, gold/rotten/container hearts, and dip/Minisaac.
- [x] Add poison, charm, confusion, and freeze, plus creep and charge refill.
- [x] Add bomb, active, pill, card, boss-kill, and player-death triggers.
- [x] Add charm, poison, and confusion auras, bomb burn/fear, spiral and
  accelerate tears, and an orbiting contact familiar.
- [ ] Sync, restart Isaac, and record live checks for the new handlers.
