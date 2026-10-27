import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { REVIEWED_SELECTION_TAGS, SELECTION_PRIOR_POLICY, selectionPriors, validateSelectionPriors } from '../../bridge/selection-priors.mjs';

export function buildSelectionPriors(reportText) {
  const report = JSON.parse(reportText);
  if (report.schemaVersion !== 1 || !report.summary?.reconciled || !Array.isArray(report.rows) || !Array.isArray(report.frequencies)) throw Error('Reconciled joined inventory required');
  const seen = new Set(), totals = [0, 0, 0, 0, 0];
  const families = Object.fromEntries(Object.entries(REVIEWED_SELECTION_TAGS).map(([power, tag]) => [power, { tag, byQuality: [0, 0, 0, 0, 0], total: 0 }]));
  for (const row of report.rows) {
    if (!Number.isSafeInteger(row.id) || row.id < 1 || seen.has(row.id) || !Number.isInteger(row.quality) || row.quality < 0 || row.quality > 4
      || row.descriptionMissing !== false || !Array.isArray(row.tags) || new Set(row.tags).size !== row.tags.length) throw Error('Invalid, duplicate, missing-description or out-of-quality inventory row');
    seen.add(row.id); totals[row.quality] += 1;
    for (const family of Object.values(families)) if (row.tags.includes(family.tag)) { family.byQuality[row.quality] += 1; family.total += 1; }
  }
  if (report.summary.exportedItems !== seen.size || report.summary.joinedItems !== seen.size || report.summary.missingDescriptions !== 0) throw Error('Inventory totals do not reconcile');
  const other = report.summary.qualityReconciliation?.filter(row => row.quality === 'other');
  if (report.summary.qualityReconciliation?.length !== 6 || other?.length !== 1 || other[0].exported !== 0 || other[0].joined !== 0 || other[0].delta !== 0) throw Error('Selection priors require a fully reconciled quality 0-4 inventory');
  for (let quality = 0; quality <= 4; quality += 1) {
    const rows = report.summary.qualityReconciliation?.filter(row => row.quality === String(quality));
    if (rows?.length !== 1 || rows[0].exported !== totals[quality] || rows[0].joined !== totals[quality] || rows[0].delta !== 0) throw Error('Inventory quality totals do not reconcile');
  }
  for (const family of Object.values(families)) {
    const frequencies = report.frequencies.filter(row => row.tag === family.tag);
    if (frequencies.length > 1 || (family.total && frequencies.length !== 1) || (frequencies.length && (frequencies[0].itemCount !== family.total
      || family.byQuality.some((count, quality) => frequencies[0].byQuality?.[quality] !== count)))) throw Error('Inventory frequency differs from joined rows: ' + family.tag);
  }
  const runtime = report.provenance?.runtime, eid = report.provenance?.eidInstallation;
  const result = {
    version: 1, evidenceKind: 'partial_tag_counts_not_item_support', policy: { ...SELECTION_PRIOR_POLICY },
    source: { kind: runtime?.kind, capturedAt: runtime?.capturedAt, gameVersion: runtime?.gameVersion, runtimeVersion: runtime?.runtimeVersion,
      taxonomyVersion: report.taxonomyVersion, eidEdition: eid?.edition, eidVersion: eid?.version, eidCommit: eid?.commit,
      exportSha256: report.provenance?.exportSource?.sha256, reportSha256: createHash('sha256').update(reportText).digest('hex') },
    exportedItems: seen.size, qualityTotals: totals, families,
  };
  return validateSelectionPriors(result, { allowFixture: true });
}

export async function runSelectionPriorCli(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { report: { type: 'string' }, check: { type: 'boolean' } } });
  const result = buildSelectionPriors(await readFile(values.report ?? 'work/vanilla-audit/inventory.json', 'utf8'));
  if (values.check) {
    validateSelectionPriors(result);
    if (!isDeepStrictEqual(result, selectionPriors)) throw Error('Selection-prior evidence differs from the curated snapshot; review it explicitly before changing sampling');
    return 'Selection priors match the reviewed joined inventory. No source files changed.';
  }
  return JSON.stringify(result, null, 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runSelectionPriorCli().then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; });
}
