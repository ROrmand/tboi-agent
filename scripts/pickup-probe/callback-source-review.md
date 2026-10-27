# Pickup producer source review — October 25, 2026

The ordinary-pickup acquisition blocker was rechecked without running Isaac,
syncing a mod, exporting again, or modifying any save. It remains unresolved.

## Pinned upstream evidence

Reviewed REPENTOGON commit `2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3`,
committed October 25, 2026 at 16:49:16 UTC:

- https://github.com/TeamREPENTOGON/REPENTOGON/blob/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/repentogon/LuaInterfaces/CustomCallbacks.cpp
- https://github.com/TeamREPENTOGON/REPENTOGON/blob/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/repentogon/resources/scripts/enums_ex.lua
- https://github.com/TeamREPENTOGON/REPENTOGON/blob/2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3/docs/docs/enums/ModCallbacks.md

`HandleCollisionCallbacks` calls the post-collision callback whenever the
internal collision code runs. It does not condition that notification on
successful pickup acquisition. `RunCollisionCallback` supplies the entity,
collider and Low argument, but not the internal result or an acquisition flag.
The pickup registration uses this generic path (post callback 1239).
Consequently, receiving MC_POST_PICKUP_COLLISION still cannot establish that
the collider acquired the pickup.

The reviewed callback enum has separate shop-purchase, card-collection and
pill-collection notifications, but no generic successful ordinary-pickup
notification. This is a bounded source inspection, not proof that no other
implementation strategy can ever work. Restricted callbacks do not satisfy
the existing coin/key/bomb/heart/battery acquisition contract.

## Installed environment

Read-only inspection of the installed REPENTOGON resources/scripts/enums_ex.lua
shows the same relevant callback names and IDs. Its SHA256 is
`769f3835e5e061a012bd52f1a4390b2fd10501f9f2af8fa49553c5bc1d7a74f8`.
This does not establish which code the currently running process has loaded.

## Consequence

Keep pickup_kind disabled. The existing observation probe remains diagnostic,
not an acquisition detector. Further live observation requires a coordinated
disposable session and cannot be replaced with collision notifications, entity
removal, Collect animations, or potentially unrelated resource deltas.
Shop-only or pill/card-only semantics would require an explicit contract
decision, not a silent narrowing of this requirement.

## October 26 recheck and next evidence path

GitHub's primary commit API reports the same most recent relevant source
changes: CustomCallbacks.cpp at `2a4e3a5fc01f5a58fca3d4f1f62740af0c0c16a3`,
enums_ex.lua at `35b927cbb0fcece5e73be43dccedebcd19aad1a1`, and callback docs at
`b637007af7afb53f150d7505aa417c67a21bf58e`. Exact results are retained in
`work/pickup-capture/upstream-source-check.json`. The local generic collision
implementation still discards the native return value when notifying the post
callback; this source recheck does not unblock successful acquisition.

The guarded, opt-in capture adapter now makes the existing diagnostic probe
usable through `nebius probe pickups on` in a coordinated disposable session on
Save File 2 or 3. Its raw snapshots and overflow/lifecycle records can support
further investigation, but cannot alone establish acquisition semantics. No
capture was enabled and no live success was observed while implementing it.
Keep the production condition disabled until the complete ordinary-pickup
owner/success contract is established, including rejected, full-inventory, shop,
co-op and same-frame resource-change cases.
