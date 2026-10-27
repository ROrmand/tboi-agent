# Read-only pickup collision observation probe

`demo/live-sprite-swap/pickup_probe.lua` is an **inert diagnostic module**, not a
pickup-acquisition implementation. Production loads inert module factories at
mod startup; it only constructs an observer after explicit operator opt-in
through the guarded `pickup_capture.lua` adapter. It is never
enabled automatically, persisted in saves or used to produce `pickup_kind`.

## Guarded in-game capture

After coordinating a disposable test session and restarting the synced mod,
select **Save File 2 or 3** and start or continue that disposable run. File 1,
unknown save identity, inactive runs and missing pre/post collision callbacks
are refused before either diagnostic instance is constructed. In Isaac's debug console:

```text
nebius probe pickups on
nebius probe pickups status
nebius probe pickups off
```

These are in-game console commands, not PowerShell commands. Results and
refusals appear in the console as well as the HUD/log. Restart Isaac after
syncing source changes; an already loaded mod retains old code.

Capture reads
normal pickup collisions during play; it does not spawn or award anything,
register another mod, call SaveData, alter collision returns, or save settings.
It emits `[Pickup Probe]` JSON packets into Isaac's existing log. Preserve the
whole log, including startup game/REPENTOGON versions and the enabled-mod list;
the adapter does not invent version metadata or turn these records into live
acceptance results. No additional EID export is needed.

Capture stops automatically on room/run/save changes, Continue/exit, a frame
counter reset, logger failure, or 128 completed records. Pending references are
cleared. Re-enable explicitly for each room/session you intend to observe. The
stop packet records pending/discarded observations, and overflow counters are
retained across drains. An incomplete capture cannot establish acquisition.
Every packet and raw record remains `diagnostic_not_confirmed_acquisition`;
there is no `collected` boolean. A resource change still is not an authoritative
success event or proof of which co-op player acquired a pickup.

## Advanced embedding protocol

Only after authorization, load the module in a disposable developer wrapper and
create one observer with `probe.new()`. This requires a runtime that supplies the
pre/post pickup-collision callbacks; do not guess a substitute callback if the
post callback is unavailable. In that wrapper:

1. At pre-pickup collision, call `observer:before(pickup, collider, frame)` with
   the actual callback arguments and current game frame. **Do not return its
   boolean from the engine callback**: it is diagnostic status, not permission
   to skip collision. Do not change the engine callback's normal return value.
2. At post-pickup collision, call `observer:after(pickup, collider, frame)` with
   the same frame coordinate. Again, do not return the diagnostic status.
3. On subsequent updates, call `observer:tick(frame)`. Only observations from an
   earlier frame settle. If a post callback was skipped, the record explicitly
   has `postCollisionObserved=false`.
4. Drain with `observer:drain()` and serialize the returned plain table through
   the developer wrapper's existing diagnostics. Drain does not cancel pending
   observations; call `observer:clear()` on room/run transitions, Continue,
   wrapper shutdown, or a frame-counter reset. Do not write product SaveData.

The probe itself registers no callbacks, reads no global player/nearest-player
fallback, spends no resources, spawns nothing, rolls no RNG, and writes no file
or save. It correlates **the exact pickup and `collider:ToPlayer()` references**;
InitSeed values are diagnostic fields, not ownership substitutes. A post callback
with a different entity, player, or frame cannot settle another collision.

## Evidence and limits

The pinned upstream and installed-enum rechecks are recorded in
`callback-source-review.md`. The generic post-collision implementation still
does not report successful acquisition; no production predicate was enabled.

Each record contains pre-collision, optional post-collision, and later settled
snapshots of raw resource/health getters, four active slots, and pickup state /
animation. Missing, throwing, or non-finite getter results are absent/unknown,
not zero. A removed pickup can still have an observation with unknown fields.

Every record is labeled `diagnostic_not_confirmed_acquisition`. There is **no
`collected` field or confirmed event**. A `Collect` animation, entity removal,
inventory delta, or post callback alone is not proof of an authoritative pickup
acquisition, nor proof of which co-op player acquired it. Other callbacks can
change inventory between snapshots. Two players touching one pickup remain two
distinct collision observations. This module does not enable `pickup_kind`.

Memory is bounded to 64 pending collisions and 128 completed records. Excess
pending observations are dropped; completed overflow evicts the oldest stored
record. Drain reports both drop counters and the remaining pending count.
Any dropped observation means that capture is incomplete. Array order is not
collision chronology; use the recorded frames. Clear also resets drop counters.

For a future authorized session, record game/REPENTOGON versions and enabled
mods, then observe coins, keys, bombs, hearts and batteries under ordinary,
full-inventory, rejected, shop, multiple-collider/co-op, and same-frame resource
change cases. Preserve raw evidence and compare it with authoritative engine
behavior before proposing acquisition semantics. Do not infer acceptance from
this mocked test suite:

```powershell
node --test native/ipc/pickup-probe.test.mjs bridge/sync-mod.test.mjs
node --test native/ipc/pickup-capture.test.mjs
```
