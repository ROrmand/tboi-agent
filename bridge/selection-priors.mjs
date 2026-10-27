import { readFileSync } from 'node:fs';
import { POWER_KEYS } from '../content-contract/powers.mjs';

export const REVIEWED_SELECTION_TAGS = Object.freeze({
  'power.projectile_blocking': 'action.projectile_block',
  'power.projectile_reflection': 'action.projectile_reflect',
  'power.dash': 'action.player_dash',
  'power.extra_tears': 'action.extra_tears',
});
export const SELECTION_PRIOR_POLICY = Object.freeze({ minimum: 0.5, maximum: 2, priorItems: 50 });

function keys(value, expected, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw Error('Invalid selection-prior ' + location);
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export function validateSelectionPriors(value, { allowFixture = false } = {}) {
  keys(value, ['version', 'evidenceKind', 'policy', 'source', 'exportedItems', 'qualityTotals', 'families'], 'snapshot');
  if (value.version !== 1 || value.evidenceKind !== 'partial_tag_counts_not_item_support') throw Error('Unsupported selection-prior evidence contract');
  keys(value.policy, Object.keys(SELECTION_PRIOR_POLICY), 'policy');
  if (Object.entries(SELECTION_PRIOR_POLICY).some(([key, expected]) => value.policy[key] !== expected)) throw Error('Selection-prior policy requires explicit versioned review');
  keys(value.source, ['kind', 'capturedAt', 'gameVersion', 'runtimeVersion', 'taxonomyVersion', 'eidEdition', 'eidVersion', 'eidCommit', 'exportSha256', 'reportSha256'], 'source');
  if (value.source.kind !== 'runtime' && !(allowFixture && value.source.kind === 'fixture')) throw Error('Production selection priors require runtime evidence, not fixtures');
  if (Object.values(value.source).some(entry => typeof entry !== 'string' || !entry.trim()) || !Number.isFinite(Date.parse(value.source.capturedAt))
    || !/^[a-f0-9]{64}$/.test(value.source.exportSha256) || !/^[a-f0-9]{64}$/.test(value.source.reportSha256)) throw Error('Invalid selection-prior provenance');
  if (!Number.isSafeInteger(value.exportedItems) || value.exportedItems < 1 || !Array.isArray(value.qualityTotals) || value.qualityTotals.length !== 5
    || value.qualityTotals.some(count => !Number.isSafeInteger(count) || count < 0)
    || value.qualityTotals.reduce((total, count) => total + count, 0) !== value.exportedItems) throw Error('Selection-prior quality totals do not reconcile');
  keys(value.families, Object.keys(REVIEWED_SELECTION_TAGS), 'families');
  for (const [power, family] of Object.entries(value.families)) {
    keys(family, ['tag', 'byQuality', 'total'], power);
    if (!POWER_KEYS.includes(power) || family.tag !== REVIEWED_SELECTION_TAGS[power] || !Array.isArray(family.byQuality) || family.byQuality.length !== 5
      || family.byQuality.some((count, quality) => !Number.isSafeInteger(count) || count < 0 || count > value.qualityTotals[quality])
      || !Number.isSafeInteger(family.total) || family.byQuality.reduce((total, count) => total + count, 0) !== family.total) throw Error('Invalid selection-prior counts for ' + power);
  }
  return freeze(structuredClone(value));
}

export const selectionPriors = validateSelectionPriors(JSON.parse(readFileSync(new URL('../content-contract/selection-priors.json', import.meta.url), 'utf8')));

export function selectionPriorMultiplier(power, quality) {
  if (!POWER_KEYS.includes(power)) throw Error('Unknown selection-prior power');
  if (!Number.isInteger(quality) || quality < 0 || quality > 4) throw Error('Selection-prior quality must be 0-4');
  const family = selectionPriors.families[power];
  if (!family?.total || !selectionPriors.qualityTotals[quality]) return 1;
  const globalRate = family.total / selectionPriors.exportedItems;
  const policy = selectionPriors.policy;
  const rate = (family.byQuality[quality] + policy.priorItems * globalRate) / (selectionPriors.qualityTotals[quality] + policy.priorItems);
  return Math.max(policy.minimum, Math.min(policy.maximum, rate / globalRate));
}

export function secondarySelectionPrior(powers, primaryPower, quality) {
  if (!Array.isArray(powers)) throw Error('Secondary selection-prior powers must be an array');
  selectionPriorMultiplier(primaryPower, quality);
  powers.forEach(power => selectionPriorMultiplier(power, quality));
  const secondary = [...new Set(powers)].filter(power => power !== primaryPower);
  return secondary.length ? Math.exp(secondary.reduce((total, power) => total + Math.log(selectionPriorMultiplier(power, quality)), 0) / secondary.length) : 1;
}
