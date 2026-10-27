# Vanilla mechanic inventory — Milestone 2 / slices 5–6

Read-only inventory tooling, with `npm run vanilla:audit` and a source deployment
allowlist entry integrated by the parent. An authorized October 25, 2026
runtime capture reconciles 721/721 items in work/vanilla-audit/inventory.md.
No live gameplay acceptance follows from that inventory capture.
The current console wrapper is capture-only. The exporter does not modify
ItemConfig, players, inventory, rooms, pools, or unlocks.

The initial runtime SaveData integration incorrectly resolved to the existing
better donation machines mod save1.dat. Its JSON was preserved unchanged;
do not repeat that saving workflow or assume the previous mod data survived.
Current write calls require an explicitly supplied separately loaded audit
mod object; that target still needs runtime verification before use.

## Offline acceptance fixture

From the repository root, with Node and the repository's existing dependencies
installed (`wasmoon` is used for mocked Lua exporter tests):

```powershell
node --test scripts/vanilla-audit/audit.test.mjs scripts/vanilla-audit/exporter.test.mjs
node scripts/vanilla-audit/cli.mjs --fixture
```

All tests use checked-in synthetic inputs or temporary local inputs. They do
not read Steam, invoke Isaac, evaluate EID Lua, or access the network. Fixture
IDs, names, qualities and descriptions are deliberately invented, **not runtime
data**. The fixture joins eight IDs, preserves two missing/empty descriptions,
exercises all four dispositions, and reconciles qualities 0–4.

Fixture JSON/Markdown goes to `work/vanilla-audit/fixture/inventory.{json,md}`.
Full local inputs/results remain generated, not checked in. The CLI creates a
local `work/vanilla-audit/.gitignore` containing `*`, without changing the root
ignore file. `--out` may select a subdirectory of `work/vanilla-audit` only.

## Runtime export — deliberate parent integration REQUIRED

The module `demo/live-sprite-swap/vanilla_audit.lua` is loaded by main.lua and
is inert until explicitly called. Source sync was authorized and performed;
loading the later capture-only safety update still requires a Lua reload or
restart. For developer invocation, supply verified provenance:

```lua
local audit = include("vanilla_audit")
local provenance = {
  gameVersion = "<exact game version from this session's log>",
  runtimeVersion = "<exact REPENTOGON version, or explicitly vanilla/no REPENTOGON>",
  capturedAt = "<actual UTC ISO-8601 capture timestamp>",
  environmentNotes = "<enabled DLC/mods; note any vanilla metadata overrides>"
}
local snapshot = audit.capture(provenance)
local encoded = audit.encode(provenance)
local savedJson = audit.write(provenance, dedicatedAuditMod)
```

These are three alternative entry points, not steps to run consecutively.
`capture` returns a Lua table; `encode` returns JSON; `write` captures once,
writes JSON using an explicitly supplied, separately loaded dedicated audit
mod's `SaveData`, and returns the identical string. It never calls `RegisterMod`
at runtime and does not register callbacks. Do **not** pass the product's mod
object or use its save.
Do not put recurring exports in a frame callback. Save the returned JSON or
copy the dedicated audit savedata JSON, unchanged, to an explicitly named
file under `work/vanilla-audit/`; locate its actual savedata path in your
Isaac environment rather than assuming a particular save slot/location.

The synced development mod's `nebius audit vanilla` command is capture-only;
it reports the enumerated row count to `log.txt` and does not write savedata.
Use `write` only after a separately loaded dedicated audit mod object has been
verified for the running Isaac environment.

Replace every placeholder with the actual session value. Version strings are
required **operator-supplied** values, labeled as such, not inferred from a
repository checkout or a guessed API. `repentogonPresent` is observed at
capture. The last inspected local game log said `Game Version: J273`; that is
discovery evidence only, **not a captured metadata export or a future default**.

The exporter scans `1 .. CollectibleType.NUM_COLLECTIBLES - 1` and records
every non-nil `GetCollectible(id)` result, including hidden/locked entries.
It does not filter by availability, quality, descriptions or EID membership.
Nil holes are listed in `scope.absentIds`; ID 0 and appended mod IDs are
explicitly outside vanilla scope. `GetCollectibles().Size`, the enum boundary,
quality totals, exporter/schema versions and provenance accompany the rows.
Mismatched IDs, truncated lists and empty captures fail before savedata writes.
Enabled mods can override vanilla-range entries; the exporter cannot undo
those modifications. Capture in a known environment and record it.

## Installed English EID / live join

Supply the installed mod root and explicitly match the game's EID edition:

```powershell
$eid = 'C:/Program Files (x86)/Steam/steamapps/common/The Binding of Isaac Rebirth/mods/external item descriptions_836319872'
node scripts/vanilla-audit/cli.mjs --parse-only --eid-root "$eid" --edition rgon --out work/vanilla-audit/installed-eid
node scripts/vanilla-audit/cli.mjs --export work/vanilla-audit/itemconfig.json --eid-root "$eid" --edition rgon
```

`--parse-only` produces `eid-inventory.json` plus `eid-status.md`. It does NOT
invent ItemConfig rows, qualities, live ID counts or quality frequencies.
No Steam autodetection/network fallback is used at runtime. Missing files or
missing export data are explicit errors. Without `--parse-only`, the CLI
requires a schema-v1 runtime/fixture export before producing a joined report.

Edition policies mirror the inspected EID language manager:

- `ab+`: base English table only.
- `rep`: base then Repentance overrides.
- `rep+`: base, Repentance, then Repentance+ overrides.
- `rgon`: base, Repentance, then **rgon INSTEAD OF rep+** overrides.

For another installed layout, supply `--eid base.lua --eid overlay.lua` in
explicit precedence order, alongside `--export`. Duplicate IDs within a source
or export are fatal; duplicates between explicitly ordered EID layers are
intentional overrides, retained with previous/replacement sources and history.
The final join is driven exclusively by exported IDs, one row each, including
missing descriptions. EID-only placeholder/unused IDs are listed separately.

The parser lexes Lua comments, quoted/long strings, escapes and literal table
constructors. It selects only `collectibles` / `repCollectibles` tables,
supports implicit/explicit keys and literal-string concatenation, and refuses
expressions in those tables. It NEVER evaluates Lua. Unrelated executable
statements are not run. Runtime table mutations, modular descriptions, name
overrides, separate synergy tables and dynamic substitutions are not modeled;
this is a source-table inventory, not an emulation of EID's UI/runtime.
Unknown syntax fails rather than silently returning a partial selected table.

## Report contract and review policy

`inventory.json` contains source hashes/paths, EID installation version/commit
and loader hash when available, capability snapshot hash/version, runtime
provenance, scope, overrides, joined rows, counts and frequencies.
`inventory.md` renders metadata, source descriptions, mechanic tags,
conditional phrases, dispositions and all unknown/partial clauses.

- `itemConfigTags` preserves the runtime numeric bitmask; `tags` contains
  deduplicated mechanic tags. Runtime name/type/quality and short description
  are preserved separately from the EID name and full source text.
- Source markup and every clause are retained. Known icons are normalized;
  unknown/unbalanced tokens remain visible. A keyword match is only partial,
  not complete semantic understanding. Partial clauses stay in unknowns.
- Nine taxonomy categories separate trigger, condition, action, modifier,
  actor, field, economy, lifecycle and synergy/override. Tags include rule ID,
  matched evidence, clause index, confidence and implementation rationale.
- Four dispositions: `supported` (supported now), `reusable` (reusable and safe
  to add), `new-system` (possible but needs a new bounded runtime system), and
  `excluded`. Unknown/missing semantics conservatively use `new-system` with
  manual review required, **not a claim of feasibility**. Explicit unsafe/bespoke
  UI/level/code rules take exclusion precedence.
- Only narrow, anchored full-clause rules can establish supported/reusable
  item coverage. Full rules suppress overlapping generic rules in the same
  category. Confidence is a rule heuristic, not a statistical probability;
  any unknown clause gives overall confidence zero. Support means a primitive
  exists, not exact vanilla behavior, numeric balance or validator acceptance.
- Counts for qualities 0–4 must match declared live-export counts exactly.
  Invalid/unaccounted IDs or inconsistent totals fail. Out-of-range integer
  qualities remain in a visible `other` bucket instead of being discarded.
- Frequencies count distinct exported items per mechanic and quality; repeated
  clauses count once per item/tag, with separate clause occurrences. Fractions
  use **all** exported IDs of that quality, including missing descriptions;
  empty denominators are null. Tags overlap, so frequencies are not a partition.
  Unclassified clauses make observed tag counts a conservative inventory, not
  automatically suitable production weights.

## Current runtime evidence and remaining live blockers

Read-only discovery on October 24, 2026 found installed EID 5.25, commit
`d7aab88`, at the path above. Parsing the explicitly selected rgon policy
read 552 base rows, 414 Repentance rows and 20 rgon override rows, resulting
in 732 distinct EID IDs and 254 recorded overrides. This is NOT a live count.
Those parse-only figures were the pre-export discovery baseline, not runtime
quality counts. The October 25 runtime capture now joins 721/721 vanilla IDs,
with zero missing descriptions and zero quality reconciliation deltas.

The unchanged capture is work/vanilla-audit/itemconfig.json; the generated
joined inventory preserves its provenance. No additional user export is
required. Rebuilding the report reads the capture and installed EID files;
it does not interact with Isaac or write mod savedata. The earlier saving
integration defect and required safety reload are documented at the start
of this file. Pickup acquisition and live gameplay acceptance remain open;
the metadata export is not evidence for either.

Taxonomy 1.0.4 retains the partial cues for projectile reflection, projectile
blocking, extra tears, player dash and enemy marking. These separate
candidate primitives hidden by broad spawn/damage tags. Reflection is not
removal-only blocking; a damage shield is not automatically a projectile
block; a familiar dashing is not automatically a player dash. Kill-order
marks and laser reflection are not folded into these cues. All matching
clauses still require review, including those mentioning an existing bounded
handler. The reflection cue now references the implemented bounded handler,
not a promise to reproduce every reflected projectile or vanilla actor.
Supported-item counts remain unchanged.

The runtime report finds reflection in 6 items (Q0/Q1: 0/4), projectile
blocking in 22 (2/7), player dash in 4 (1/1), extra tears in 21 (4/7), and
enemy marking in 1 (0/0). These are observed phrase matches, not exhaustive
mechanic prevalence or exact item implementations. The new bounded reflection
handler returns ordinary unflagged moving bullets as plain player-owned tears;
it does not reproduce the complete behavior of these six items. It is distinct
from the removal-only block handler, but one additional power is not enough
to resolve the Q0/Q1 fingerprint capacity shortfall.

### Reviewed selection priors

Taxonomy 1.0.4 also recognizes counted tear volleys, bursts/clusters and shotgun
attacks, plus explicit destruction of enemy shots. Additive Tears stats, impact
splitting, single tears and explicit negations are not counted as those cues.
Vengeful Spirit is excluded from blocking because its text says wisps do not
block shots. Broad phrase matches remain partial, not full item support.

`content-contract/selection-priors.json` pins the runtime export/report hashes,
quality totals and four reviewed semantic mappings. All other powers stay
neutral. For each family, globalRate = total / 721 and qualityRate =
(qualityCount + 50 * globalRate) / (qualityTotal + 50). The selection factor is
qualityRate / globalRate clamped to 0.5–2; absent evidence stays neutral. The
50-item shrinkage and bounds are explicit design policy, not confidence or
proven balance. Secondary factors use a geometric mean of distinct nonprimary
powers. Eligibility, unused-first, recent history, budgets and supporting
stat/health selection remain independent and unchanged.

Run `node scripts/vanilla-audit/selection-priors.mjs --check` to compare the
current generated report with the curated evidence. Without `--check`, the
command only prints a candidate for explicit review; it never updates source.
Fixture provenance cannot pass the production check. Ordinary generation and
unit tests need neither Steam nor generated audit files.

Primary/local references used (development research only; tests never fetch):

- https://wofsauge.github.io/IsaacDocs/rep/ItemConfig.html
- https://wofsauge.github.io/IsaacDocs/rep/ItemConfig_Item.html
- https://wofsauge.github.io/IsaacDocs/rep/CppContainer_Vector_ItemConfigList.html
- https://wofsauge.github.io/IsaacDocs/rep/enums/CollectibleType.html
- https://github.com/wofsauge/External-Item-Descriptions/wiki/Markup
- Installed EID `features/eid_language_manager.lua`, `main.lua` and the English
  tables under `descriptions/{ab+,rep,rep+,rgon}/en_us.lua` (read-only).
- Installed game `resources/scripts/json.lua`, `resources/scripts/enums.lua`,
  local game log and repository capability contract (read-only).
