# Next mechanic portfolio: evidence, not admission

Read-only research, October 25, 2026. No candidates are admitted powers,
vanilla-equivalence claims, or changes to the ledger/curated priors. The evidence
does not support ten safe, distinct, Q0-ready additions. Do not pad this shortlist.

## Baseline and first recommendation

- Parent reports updated **518 tests / 495 pass / 23 unchanged baseline failures**
  after its UTC acceptance fix; execution is fully offline accepted. The earlier
  inspected parent TAP was 516/493/23. Research did not rerun regression tests.
- Current catalog: **47 powers, 50 Q0/Q1-compatible passive fingerprints versus
  96 required**. Strict power-only duplicates below 5% and low-quality archetypes
  remain unchanged. No candidate contributes to those numbers.
- Q0's complete-profile budget is **4**. Current native tear flags cost 6 and
  tear-update overhead costs 6. A native flag wrapper is not automatically a Q0
  capability. Conditions, numerical variants, cosmetics, costs and ordinary
  rewards are not new powers or grounds for artificial weight discounts.
- Inspected the full-plan goal, reusable-family/acceptance requirements, current
  catalogs, profile weights, planner semantics, production shielding/status/tear
  paths and expanded ownership/secondary-effect handling. Inventory schema 1 /
  taxonomy 1.0.4 joins 721 items with no missing descriptions; Q0-Q4 populations
  89/225/203/166/38. It was not regenerated; heuristic tags are not feasibility.
- **Recommend bounded nonexplosive ordinary-rock destruction for next review.**
  Real API and multiple item witnesses are verified. A proposed flat cost 4 fits
  Q0 arithmetically; semantic admission, safe runtime behavior and balance remain
  unverified. No completely verified new-power/Q0 acceptance is claimed here.

## First family: nonexplosive ordinary-rock destruction

Exact inventory identities/qualities and **zero-based clause indices** below.
Clauses are paraphrased. Witnesses establish partial reusable operations, not
complete vanilla-item equivalence.

| ID / item | Quality | Clauses | Relevant evidence |
| --- | --- | --- | --- |
| 463 Sulfuric Acid | 2 | 1 | Some tears destroy rocks and open doors. |
| 592 Terra | 3 | 1,2 | Rock tears destroy obstacles alongside damage/knockback changes. |
| 302 Leo | 1 | 1 | Walking destroys rocks. |
| 314 Thunder Thighs | 1 | 3 | Walking destroys rocks. |
| 83 The Nail | 2 | 6 | Walking can destroy rocks. |
| 321 Samson's Chains | 1 | 0 | A draggable ball destroys rocks. |
| 147 Notched Axe | 1 | 1 | Axe breaks rocks/secret entrances and damages enemies. |
| 623 Sharp Key | 1 | 2 | Thrown key destroys obstacles and opens doors. |
| 675 Cracked Orb | 1 | 0,1,2,3 | On hurt, opens locked doors, reveals a room and destroys tinted/crawlspace rocks: corroboration only, not authorization for that broader behavior. |

**Primary API:** [API-Room] documents boolean Room:DestroyGrid(index, immediate).
It can affect rocks, poop/fire and secret doors, so unrestricted use is unsafe.
[API-Grid] distinguishes GRID_ROCK from tinted/bomb/golden/alternate rocks.
[API-Tears] documents TEAR_ACID and TEAR_ROCK, but native flags cannot enforce
the narrow per-grid allowlist. Do not use them as a safe-subset shortcut.
DestroyGridWithSource is Repentance+ tagged: do not assume that overload in J273
or invent an attribution parameter for the older DestroyGrid method.

**Semantic boundary:** spectral traverses terrain without removing it; removal
changes room geometry. Proposed utility has no enemy damage, explosion,
knockback or collateral grid mutation. ACID versus ROCK, body versus tears,
radius, probability and triggering conditions do not make additional powers.
Existing explosive tears/bombs also destroy terrain: parent must explicitly
decide whether their composite semantics subsume the proposed operation. If the
only difference is delivery of existing destruction, do not add a power. This
report recommends that decision and bounded implementation, not ledger credit.

**Small implementation brief, not implemented:**

- One ordinary GRID_ROCK within fixed 40-pixel player radius; at most one
  successful destruction per owner per room across all generated sources.
  Bounded grid-index scan; revalidate live type/state immediately before calling.
- Reject doors/walls/secret entrances, tinted/bomb/golden/alternate/spiked rocks,
  stairs, pits, fireplaces, pressure plates and crawlspace-targeting. Current
  entity tear-impact context is not a grid target. Room-enter/clear can initially
  perform a local scan; do not silently invent collision event fields.
- Require live owner and continued source ownership; commit only observed
  success. Do not restore rocks on source loss. Room identity/Continue must not
  reset the success cap into farming. No cross-owner credit laundering.
- Ordinary rocks can have natural drops/hidden side effects; no verified
  no-drop/no-crawlspace API is established here. Do not promise their absence,
  spawn extra rewards, or retrigger from resulting drops/room-clear callbacks.
  Test this explicitly; never broaden the allowlist to bomb rocks.
- **Q0 proposal only:** action weight 4, no scaling, stats, reward, familiar or
  active block. Current rules have no system overhead in profileWeight, so the
  hypothetical complete passive profile sums to 4. No existing weight changes,
  negative-cost discounts or archetype changes. Node/Lua weight parity, planner
  reachability, production callback tests and balance review are still required.
  Assigning 4 is not a safety proof; if a safe price exceeds 4, exclude from Q0.

## Important rejected handoff: timing shields already exist

The initial interim ward suggestion is **withdrawn as a new-power recommendation**.
Production Demo:onEntityTakeDamage calls readyShield and returns false when an
owned shield familiar is ready. This is actual damage interception, not merely
projectile deletion. Catalog power.shielding already covers it. Different
conditions, duration or contact-only delivery do not make another power.

[API-Callbacks] confirms MC_ENTITY_TAKE_DMG runs before damage and false cancels;
that API does not establish novelty. [API-Player] documents damage cooldown in
**render frames**, not game frames; do not assume exact custom-duration behavior
from SetMinDamageCooldown's terse signature or clear another source's cooldown.

Exact protection reuse witnesses: **162 Celtic Cross Q1 c0; 210 Gnawed Leaf Q1
c0; 298 Unicorn Stump Q1 c0,2; 326 Breath of Life Q1 c1,3; 327 The Polaroid Q2
c0; 457 Cone Head Q2 c1; 543 Hallowed Ground Q1 c1,5; 593 Mars Q0 c1; 635
Stitches Q1 c1; 663 Tooth and Nail Q2 c0-1; 677 Astral Projection Q1 c0,3**.
These support coverage/reuse, not another protection power. A new standalone Q0
delivery would require its own pricing/reachability proof without new-power claims.

## Lower-priority provisional possibilities

| Candidate | Actual inventory evidence | Verified API; unresolved boundary |
| --- | --- | --- |
| Enemy shrink/crush | **398 God's Flesh Q1 c0-1:** shrink enemy, then crush/kill by walking over it. **598 Pluto Q3 c1** shrinks Isaac and is not a second witness. | [API-Entity] AddShrink(EntityRef,duration), five-second cap; [API-Tears] TEAR_GODS_FLESH differs from TEAR_SHRINK. Current shrink changes tears. Need native AI/collision/crush proof, not cosmetic scaling or another delivery/condition of execute_enemy. One direct witness; Q0 price unverified. |
| Hostile bait mark | **618 Rotten Tomato Q2 c0,2:** tears mark an enemy that other enemies target. | [RG-Entity]/[RG-Bindings] expose AddBaited(EntityRef,duration), maximum ten seconds. Unlike charm, target stays hostile while other hostiles retarget it. One direct witness; installed-method availability, attack attribution and Q0 price unverified. |
| Manual tear steering | **329 Ludovico Q1 c1:** controllable persistent tear; **572 Eye of the Occult Q3 c3:** steer tears midair. | Unlike automatic homing, but persistent controlled-actor/input cleanup is new work; current tear-update overhead 6 exceeds Q0. Not a cheap flag or a renamed orbit. |

For either native target status, use one ordinary vulnerable nonboss hostile
target per owner/source, short finite duration and once-target/room latch;
exclude dead/mortal/allied targets. Use real owner EntityRef; stop refresh on
source loss and specify bounded native tails rather than clearing shared status
countdowns. Test asynchronous kills/attacks and source attribution so secondary
damage cannot masquerade as a fresh owned hit. No manual execution fallback,
unlimited refresh, full-item equivalence claim or research-time admission.

## Blocked alternatives: do not pad capacity

| Alternative | Exact inventory evidence and blocking reason |
| --- | --- |
| Gold freeze | **202 Midas' Touch Q1 c0,2; 450 Eye of Greed Q2 c1-2**. AddMidasFreeze(EntityRef,duration) is real [API-Entity], max five seconds, with documented color-duration bug. It is existing freeze plus ordinary death coins plus visuals under this task's rule. Parent independently agrees: no new semantic power. |
| Generic vulnerability | AddWeakness(EntityRef,duration) is real [RG-Entity]/[RG-Bindings], with ten-second cap; no generic-weakness collectible clause found in these 721 rows. API docs do not specify a multiplier. Do not invent AddVulnerability, assume a multiplier, or use method existence as item-frequency evidence. |
| Beam vulnerability | **726 Hemoptysis Q1 c3** affects Brimstone damage specifically. AddBrimstoneMark is real in [RG-Entity]/[RG-Bindings], not generic vulnerability. A source-conditioned multiplier is not automatically another power. No Q0/semantic proof. |
| Bleeding | **506 Backstabber Q3 c0; 508 Mom's Razor Q1 c0** describe movement-dependent bleeding; Backstabber also leaves creep. Real AddBleeding, four-second cap [RG-Entity]/[RG-Bindings]. Need irreducible semantics beyond poison/burn with a moving-target condition, numeric damage or existing creep. Not automatically a new power because a new status method exists. |
| Magnetism / pickup attraction | **53 Magneto Q1 c0; 315 Strange Attractor Q0 c0; 617 Lodestone Q2 c0,2**. Native attraction flags [API-Tears] and AddMagnetized [RG-Entity] are real. Enemy pulling overlaps power.pull; moving the attraction center/delivery is not distinct. Pickup movement is not confirmed acquisition and does not justify reward/economy credit. No demonstrated new irreducible power. |
| Shielded tears | TEAR_SHIELDED [API-Tears] is existing projectile blocking delivered through tears, not a new power. |
| Ice corpses | **596 Uranus Q3 c0-1** includes frozen corpses sliding and producing shards. Native ice exists, but corpse/shard ownership and kill chains need bounded lifecycle work. Ordinary freeze is already tracked; no immediately safe flag addition. |
| Held / absorbing tears | **222 Anti-Gravity Q3 c1-2; 532 Lachryphagy Q3 c0-1**. TEAR_WAIT is cleared after initial update [API-Tears]; late flag application cannot promise release-controlled tears. TEAR_ABSORB needs merge/child ownership and damage-growth caps; existing split/size/acceleration are not new powers. Q0 cost unproven. |
| Movement / teleport | **593 Mars Q0 c0-1; 635 Stitches Q1 c1; 44 Teleport! Q0 c0; 324 Undefined Q1 c0; 419 Teleport 2.0 Q3 c0**. Dash exists; its added invulnerability is existing shielding. Position swap needs actor/safe-position work; room teleports invoke room/level/save lifecycle, not a cheap numeric dash variant. |
| Economy | Coins-to-charge exists; conversions, free pickups, costs and ordinary rewards do not manufacture powers. **376 Restock Q2 c0-1** changes shop stock/prices: transactional/persistence work, not safe merely because a spawn API exists. No new prior or pickup-kind support inferred. |

## Critical native glow audit

Current production maps glow directly to TearFlags.TEAR_GLOW, not just a custom
color. [API-Tears] connects that flag to Godhead's halo, but only describes a
glow. [RG-Tear] documents GetTearHaloSprite and [RG-TearBinding] returns the
native _tearHaloANM2 sprite; neither proves the flag alone causes damage or
requires owning Godhead. The proprietary engine damage implementation was not
available in these inspected primary sources.

Conversely, **331 Godhead Q4 c4** in the exact inventory describes a damaging
tear aura (60 damage/second in this EID snapshot); c3 is homing. Therefore
declaring native glow cosmetic is unsafe, but full-item EID does not prove the
isolated flag's damage formula/ownership requirements either.

**Disposition: unresolved, plausibly gameplay-bearing native halo; not proven
cosmetic.** Do not delete/rename the existing power.glow, add a new damaging-aura
power, or change balance from this research. A later authorized disposable test
must compare bare tears with/without the bit and with/without Godhead, controlling
homing, size, damage and ownership; measure halo-only versus collision damage.
If gameplay is verified, review equivalence with power.damage_aura across delivery
before counting anything. No such live test was performed here.

## Provenance and primary URLs

Saved inventory SHA256:
**b2b46c5f968eb81f05ee34403945c5d0175da88bb117cc4719558d9bcfe212a7**.
Capture 2026-10-25T14:36:41Z, operator-supplied J273, REPENTOGON dev v1.9.7.12;
research did not independently probe a running game. ItemConfig export SHA256:
d675c79b46a60d9f399977bf7ed52ce94426408b260f5b2042abe5e0a69f2d6a.
Inventory capability provenance is older v9, not current capabilities v10.

EID metadata reports version 5.25 / commit d7aab88, ab+ then rep then rgon.
Actual primary files fetched read-only:

| Source URL | SHA256 / reconciliation |
| --- | --- |
| https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/d7aab88/descriptions/ab+/en_us.lua | e3d1dc30ba86c25b27897fb3d5951502c6fa8c52baad140260b97e263b010210; matches saved provenance |
| https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/d7aab88/descriptions/rep/en_us.lua | df13f66960ae30004834e52efbf729d17a3cf2607c167e0170ea89dc3c114906; matches saved provenance |
| https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/d7aab88/descriptions/rgon/en_us.lua | 85bd8621fbe4427cef22625c880e59d32a04005f1e04850808528096a367dd35; does NOT match recorded installed rgon 5bd1bde1bda8dce60b1aa60ca1f763601d8274bf3094f1f1bb0d5e8ecb399e1d |

The rgon mismatch cause is not established. Preserve actual saved clauses and
ItemConfig qualities; do not substitute upstream text or silently revise priors.

API source revisions were resolved read-only and pinned below. These are primary
maintainer documentation/bindings, not proof that current-head APIs all exist in
the captured dev installation. The older two-argument methods were deliberately
preferred over Repentance+-only overloads.

| Reference | Exact successfully fetched primary URL | SHA256 |
| --- | --- | --- |
| API-Tears | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/enums/TearFlags.md | 3935880c206a5a444baab0a16ee9ea07166318135ce344a55a5efcd09b0b93f0 |
| API-Entity | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/Entity.md | aecbeb88ec4a1deef7a565bb608588f9941a78325009aed37b8b37be8acc8d3e |
| API-Room | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/Room.md | d01e2a73134f8f22ec23f70c4d174137ddd48d3c21ce69c7d892abaa10164d91 |
| API-Grid | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/enums/GridEntityType.md | c48090cdfb9a78e62a6fca6122a79906978a17e8da076be09ed8ad8a86197d15 |
| API-Callbacks | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/enums/ModCallbacks.md | 220bc2eb3aa06bb47b26dbfb1e6574a7da445299470fc77b8aba178122d6edac |
| API-Player | https://raw.githubusercontent.com/wofsauge/IsaacDocs/e05b1fd90e33608a7a7a8dcb70a89cef908cc41a/docs/EntityPlayer.md | b90e4c61352d2ddb4603bb9a3f483a77c7525bd835b8a3b695e7d562c8ddc5fb |
| RG-Entity | https://raw.githubusercontent.com/TeamREPENTOGON/REPENTOGON/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/docs/docs/Entity.md | f23f168b9528d256c03ec5a1eed528fe347382214b5eeffc9398f7a2092b6906 |
| RG-Bindings | https://raw.githubusercontent.com/TeamREPENTOGON/REPENTOGON/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/repentogon/LuaInterfaces/Entities/LuaEntity.cpp | 584804b18b0bdc5b39c991e3dc34775c1dc9867e1c3b1af62f1505d75f146041 |
| RG-Tear | https://raw.githubusercontent.com/TeamREPENTOGON/REPENTOGON/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/docs/docs/EntityTear.md | 48cd3c41acd68daf26ca5e06dc8ca233db3fa78f15530b46c9edce0b840b29de |
| RG-TearBinding | https://raw.githubusercontent.com/TeamREPENTOGON/REPENTOGON/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/repentogon/LuaInterfaces/Entities/LuaEntityTear.cpp | 71fa7ae959736d933b512dc50aa42cf353f28f10ad1ee234eee839078a85ae59 |

Inspected local snapshot SHA256 values (parent can subsequently change its files):
power-catalog.json v4: 2d2f642a53eb4083950defd058c524af635b32032dd2ea6c2880cac78aa3f1df;
capabilities.json v10: 827f1899c7d9c75e4de645185eb5677fa67faa21a579a3c84575f188a82d1954;
expanded-effects.json: 2aec68223987c016c46485a196c99c799ffd4d3b492ffe25441dc1fe8641647c;
main.lua: 9924985cfed728cb7dd8690b3d886a95a3058db103631a13fb2205aeb8d48dea;
expanded_effects.lua: 11a236b84aafc88f79685cef4c27d2614c62b08fd5fe56a15ee85a4284abab26.

## Next action / stopping rule

Parent should review the semantic boundary for **bounded nonexplosive ordinary
rock removal**, then implement only that subset if accepted: allowlist and
no-door tests first, followed by success-only latches, owner/room/Continue cap,
secondary callback safety, and exact full-profile Q0 weight/reachability tests.
Do not implement broad native acid, Cracked Orb, map/door changes or gold freeze
as a shortcut. If overlap or safe Q0 pricing fails, report that concrete block.
No claim of ten safe mechanics, whole-plan completion or relaxed release gates.
Research wrote only this artifact via apply_patch; no source changes, Steam
writes, game/save operations, mod sync, commits or branches.
