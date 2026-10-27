# Expanded conditions: parent integration contract

Standalone implementation and API review: October 24, 2026. Main-runtime wiring
and live-game acceptance remain parent work; pickup_kind is explicitly deferred.

## Files and factory

- Module: `demo/live-sprite-swap/expanded_conditions.lua`.
- Proposal: `content-contract/expanded-conditions.json`.
- Tests: `native/ipc/expanded-conditions.test.mjs`.
- This document. No existing main, generator, plan, capabilities, or product tests
  are modified by this implementation.

The JSON is a review/merge proposal, not a second production registry. Merge its
19 enabled definitions into capabilities and use the existing metadata generator.
Do not merge the disabled pickup_kind definition into production schema/guidance.
Instantiate `include("expanded_conditions").new(conditionCatalog)` after metadata
loads. Register the 19 enabled `expanded.handlers[name]` functions before the
existing metadata/handler parity assertions. Each function accepts
`(condition, context)` and returns a boolean, never a latch/state key.

The factory accepts generated `{conditions=...,contexts=...}` metadata or the
proposal's `{condition_registry=...,event_contexts=...}` shape. Its optional second
argument replaces the global API table for tests. `expanded.validate(condition,
trigger)` returns a boolean for standalone validation. Production can retain its
existing diagnostic validator using the same merged definitions.

Missing metadata is an error except for absent deferred pickup_kind. If omitted,
no pickup handler is exposed. If present with `enabled:false`, validation and the
handler return false. Tests temporarily enable it only to exercise prospective
normalized-value semantics, NOT to establish a working pickup producer.

**Parameter naming:** damage_at_least takes numeric `damage`, not amount:
`{type="damage_at_least",damage=2.5}`. The existing shared schema builder requires
one type per parameter name, and amount is already integer-typed. Target health
uses `fraction` in [0,1], stage uses integer `stage` in [1,13]. Parameters are
required and unknown keys are invalid.

## Normalized event facts and ownership

Use the actual beneficiary as `context.player`, never player zero. All new
event-sensitive predicates additionally require `event.owner == context.player`.
Thus broadcast on_kill calls for other co-op players or unknown attribution fail
these predicates, without changing existing player-only conditions/proc policy.

The parent's event_context.lua supplies these exact names:

- `event.damage`: finite positive callback damage, not a weapon stat or estimate.
- `event.weapon_kind`: tear, bomb, laser, knife, or familiar_shot.
- `event.pickup_kind`: one existing capabilities.pickup_types value; deferred.
- `event.target`: the existing actual target, not nearest enemy.
- `event.trigger`: exact rule/proc name assigned before evaluation.
- `event.owner`: positively resolved owner, otherwise nil.

No extra confirmation flags or duplicate normalization helpers are required here.
Numbers/strings are trusted INTERNAL callback facts, not profile-controlled data.
A pure predicate cannot distinguish a fabricated field after normalization.
Unavailable facts must stay nil. All definitions are category pure: missing
optional requirements fail before probability evaluation or latch/cooldown commit.
There is no RNG, inventory mutation, or state storage in these handlers.

## Guaranteed and optional fields

The JSON arrays describe existing guarantees plus optional parent additions;
optional means neither already implemented nor always available. Keep these
exact arrays synchronized during parent integration:

| Context | Guaranteed fields | Optional fields |
| --- | --- | --- |
| room_enter | player | none |
| room_clear | player | none |
| new_floor | player | none |
| enemy_hit | player, target, owner | damage, weapon_kind |
| player_hurt | player, owner | target, damage |
| pickup | player | owner, pickup_kind (gated) |
| tear_fire | player | owner, weapon_kind |
| bomb_explode | player, target, owner | weapon_kind |
| active_use | player, owner | none |
| pill_use | player, owner | none |
| card_use | player, owner | none |
| boss_kill | player, target, owner | weapon_kind |
| player_death | player, target, owner | none |
| on_kill | player, target | owner, weapon_kind |
| tear_impact | player, target, owner | weapon_kind |
| collision | player, target, owner | none |

player is the enclosing context field; no second nested event.player is needed.
A definition can require a field optional in its compatible context, but the
handler fails when absent. Do not promote damage, weapon, kill-owner, or
hurt-target fields to guarantees without checking every producer path.

## Producer changes required in parent

1. Damage: existing pre-damage callbacks discard amount/flags, while existing
   post-damage routing handles player hurt only. Carry actual callback amounts;
   prefer REPENTOGON MC_POST_ENTITY_TAKE_DMG for confirmed damage. If keeping
   pre-damage dispatch for existing behavior, leave event.damage absent when fake
   or cancelled damage is possible. Avoid duplicate dispatch through both paths.
   damage_at_least allows only enemy_hit/player_hurt; enemy hits also require an
   actual enemy NPC target. Never copy damage into kill/collision/explosion events.
2. Weapon: classify the actual delivery entity, not equipped WeaponType, item
   ownership, or remembered previous attack. Familiar projectile classification
   precedes tear. Resolve ownership separately against context.player. REPENTOGON
   post-damage ExtraSource.Entity can expose actual laser/knife delivery when
   Source points at the player; a player source alone proves no weapon kind.
3. Tear fire/impact: pass actual owner and normalized kind; existing tear_fire
   had no event. Impact supplies the NPC target, but not a damage amount.
4. Bomb explode: its target is the bomb, NOT an NPC. Normalize bomb delivery if
   owned, but never infer enemy health/status or explosion damage. All NPC target
   predicates are incompatible with bomb_explode.
5. Kill: only real callback KillSource/ExtraSource can establish delivery; a
   recorded last-hit owner does not prove a weapon. on_kill owner stays optional.
   Do not use combat.enemy(), whose dead/vulnerability filtering drops kill NPCs.
   NPC predicates deliberately permit dead enemy targets. No kill damage field.
6. Hurt/contact/death: hurt source may be nil, projectile, or NPC. Do not replace
   it with a nearby NPC. A player-death target is the player: NPC predicates are
   incompatible. Contact has owner/target but no damage or weapon fact.
7. Card/pill/active: retain actual user ownership, never invent damage, target,
   weapon, or pickup facts from item-use side effects.

## Pickup is gated, not complete

The existing pickup trigger runs in onPostAddCollectible only for a first-time
generated-slot acquisition. Collectibles are not among the ten pickup_types.
Do not label that event coin/heart/etc. or infer ordinary acquisition from it.

Local REPENTOGON docs say MC_POST_PICKUP_COLLISION runs after collision code,
not successful collection. CustomCallbacks.cpp uses the general collision macro
for Entity_Pickup (1239). Pre/post collision is not evidence of acquisition;
full inventory, unaffordable shops, and blocked collision paths must not grant it.

MC_POST_PICKUP_SHOP_PURCHASE is a narrower evidence-based candidate: source hooks
Entity_Pickup::TriggerShopPurchase, calls the engine implementation, then invokes
ProcessPostPickupShopPurchase with pickup, player, moneySpent (1062). This could
support a separately approved SHOP-PURCHASE-ONLY feature; it does not establish
free ordinary collection or justify silently narrowing pickup_kind semantics.
General collection needs a verified engine success query/hook or live probe
covering blocked, paid/free, partial, golden, option-choice, and co-op cases.
Collision plus resource delta is not universally sufficient either (caps and
non-resource pickups). Keep pickup_kind out of production metadata until solved.

## Deliberate predicate semantics

- first_visit reads current Room:IsFirstVisit(), not a once-only latch. It can
  remain true for the whole first visit. Clear means IsClear()==true; hostile
  requires IsClear()==false AND GetAliveEnemiesCount()>0. Sample callback-time
  room state, never infer it from a trigger name.
- Stage means Level:GetStage(), not GetAbsoluteStage or displayed floor number.
  Alternate paths share engine-stage values; unknown/out-of-range stages fail.
  Difficulty is exact enum equality, not a broad hard/greed grouping.
- Curses use six explicitly listed LevelCurse bits; status uses the six existing
  aura_statuses EntityFlag mappings, never guessed flags or effect durations.
- Moving means finite nonzero Velocity, including knockback. Firing means finite
  nonzero GetShootingInput while CanShoot is true, not proof a shot spawned this
  frame. Grounded is strictly CanFly false, not physical height/contact.
- Character groups are explicit PlayerType sets: lost (normal/tainted), keeper
  (normal/tainted), forgotten (both bodies and Soul forms). Unknown/custom types
  fail; these are identities, not guessed health-model classifications.
- Collectible tags mean exact Spoon Bender or Brimstone ownership checked with
  HasCollectible(id,true,true), excluding modifiers and REPENTOGON innate spoofs.
  They do not cover every source of homing/brimstone behavior.
- Familiar tags mean existing Brother Bobby/Sister Maggy entities with matching
  variant, Exists()==true, and familiar.Player == context.player. Another
  co-op player's familiar or an item without a familiar does not count.
- NPC predicates require ToNPC(), IsEnemy()==true, and no FLAG_FRIENDLY. Bombs,
  players, missing sources, and non-enemy NPCs fail. Charmed/friendly targets
  that no longer satisfy IsEnemy also fail: status matching never widens enemy
  eligibility. Boss/champion use engine methods, not type-number guesses.
- Health fractions compare max(0,HitPoints)/MaxHitPoints inclusively. Lethal
  negative HP is zero; nonfinite HP, HP above max, or nonpositive max fail.
- Missing/throwing getters or enums fail, including inverse/negative predicates.
  No fallback enum numbers, default getter values, or persistent state are added.

## Primary API evidence checked

Online vanilla IsaacDocs pages (API documentation, not gameplay wiki guesses):

- `https://wofsauge.github.io/IsaacDocs/rep/Room.html`
- `https://wofsauge.github.io/IsaacDocs/rep/Level.html`
- `https://wofsauge.github.io/IsaacDocs/rep/Entity.html`
- `https://wofsauge.github.io/IsaacDocs/rep/EntityNPC.html`
- `https://wofsauge.github.io/IsaacDocs/rep/EntityPlayer.html`
- `https://wofsauge.github.io/IsaacDocs/rep/EntityFamiliar.html`
- `https://wofsauge.github.io/IsaacDocs/rep/enums/LevelStage.html`
- `https://wofsauge.github.io/IsaacDocs/rep/enums/LevelCurse.html`
- `https://wofsauge.github.io/IsaacDocs/rep/enums/EntityFlag.html`
- `https://wofsauge.github.io/IsaacDocs/rep/enums/PlayerType.html`
- `https://wofsauge.github.io/IsaacDocs/rep/enums/Difficulty.html`

REPENTOGON authoritative extension docs and checked local implementation:

- `https://repentogon.com/EntityPlayer.html`: HasCollectible IgnoreSpoof.
- `https://repentogon.com/enums/ModCallbacks.html`: post-damage ExtraSource,
  post-kill KillSource, post-pickup collision, and shop-purchase callbacks.
- `.reference-repentogon/docs/docs/EntityPlayer.md`: modified HasCollectible.
- `.reference-repentogon/docs/docs/enums/ModCallbacks.md`: 1006, 1239, 1062.
- `.reference-repentogon/repentogon/LuaInterfaces/CustomCallbacks.cpp`:
  pickup collision macro and TriggerShopPurchase hook/dispatch.
- `.reference-repentogon/libzhl/functions/EntityPlayer.zhl`: GetPlayerType.

## Verification and remaining parent checks

Run `node --test native/ipc/expanded-conditions.test.mjs`. Tests execute the real
Lua module under Wasmoon and the actual existing Node validator with an in-memory
proposed registry (only its capabilities import is rebound, no production file
rewritten). They enumerate all definitions, enums, bounds, and context pairs;
cover true/false, missing optional requirements, co-op ownership, enemy-only
checks, malformed observations, gated/absent pickup, and stateless reconstruction.
Lua RNG is replaced by a throwing function throughout predicate tests.

Parent still must verify real callback provenance, generated metadata parity,
schema/guidance output, direct-proc validation, mixed pure/latch/probability order,
success-only cooldown/latch commits, save/continue, and live acceptance. The
standalone tests do not claim those integration checks. No mod sync, game launch,
commits, branch creation, or repository synchronization occurs here.
