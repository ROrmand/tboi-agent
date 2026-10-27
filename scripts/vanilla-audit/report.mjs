import { classifyDescription, CATEGORIES, DISPOSITIONS, TAXONOMY_VERSION } from './classifier.mjs';

export const qualityKey = quality => Number.isInteger(quality) && quality >= 0 && quality <= 4 ? String(quality) : 'other';
const emptyQuality = () => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, other: 0 });

function uniqueIds(rows, label) {
  const indexed = new Map();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id < 1) throw new Error(`${label}: invalid collectible ID ${row.id}`);
    if (indexed.has(row.id)) throw new Error(`${label}: duplicate collectible ID ${row.id}`);
    indexed.set(row.id, row);
  }
  return indexed;
}

export function validateExport(exported) {
  if (exported.schemaVersion !== 1) throw new Error('Unsupported ItemConfig export schemaVersion');
  for (const key of ['kind', 'source', 'gameVersion', 'runtimeVersion', 'capturedAt']) {
    if (typeof exported.provenance?.[key] !== 'string' || !exported.provenance[key].trim()) throw new Error(`Missing export provenance.${key}`);
  }
  if (!['runtime', 'fixture'].includes(exported.provenance.kind)) throw new Error('Invalid export provenance.kind');
  if (!Number.isFinite(Date.parse(exported.provenance.capturedAt))) throw new Error('Invalid export capturedAt timestamp');
  if (typeof exported.exporterVersion !== 'string' || !exported.exporterVersion) throw new Error('Missing exporterVersion');
  if (!Array.isArray(exported.collectibles) || !exported.collectibles.length) throw new Error('ItemConfig collectibles must be a nonempty array');
  const items = uniqueIds(exported.collectibles, 'ItemConfig');
  const scope = exported.scope;
  if (scope?.kind !== 'vanilla-enum-range' || scope.firstId !== 1 || !Number.isSafeInteger(scope.lastId) || scope.lastId < 1 || scope.enumLimitExclusive !== scope.lastId + 1 || !Number.isSafeInteger(scope.itemConfigListSize) || scope.itemConfigListSize < scope.enumLimitExclusive || !Array.isArray(scope.absentIds)) throw new Error('Invalid vanilla export scope');
  const absent = new Set();
  for (const id of scope.absentIds) {
    if (!Number.isSafeInteger(id) || id < 1 || id > scope.lastId || absent.has(id) || items.has(id)) throw new Error(`Invalid/duplicate absent ID ${id}`);
    absent.add(id);
  }
  const quality = emptyQuality();
  for (const item of items.values()) {
    if (item.id > scope.lastId) throw new Error(`Non-vanilla ID ${item.id} outside declared scope`);
    if (typeof item.name !== 'string' || !Number.isInteger(item.type) || !Number.isInteger(item.quality) || !Number.isSafeInteger(item.tags)) throw new Error(`Invalid ItemConfig metadata for ID ${item.id}`);
    quality[qualityKey(item.quality)]++;
  }
  if (items.size + absent.size !== scope.lastId) throw new Error('Export scope has unaccounted IDs (neither returned nor absent)');
  if (exported.counts?.total !== items.size) throw new Error('Export total count does not reconcile');
  for (const key of Object.keys(quality)) {
    if (exported.counts?.quality?.[key] !== quality[key]) throw new Error(`Export quality ${key} count does not reconcile`);
  }
  return { items, quality };
}

export function buildReport(exported, eid, { exportSource = null, capabilitySource = null } = {}) {
  const { items, quality: exportedQuality } = validateExport(exported);
  const descriptions = uniqueIds(eid.records, 'EID join');
  const rows = [...items.values()].sort((left, right) => left.id - right.id).map(item => {
    const description = descriptions.get(item.id);
    return {
      ...item, itemConfigTags: item.tags, itemConfigDescription: item.description ?? null,
      eidName: description?.name ?? null, descriptionMissing: !description?.description?.trim(),
      eidSource: description?.source ?? null, eidHistory: description?.history ?? [],
      ...classifyDescription(description?.description ?? ''),
    };
  });
  const joinedQuality = emptyQuality();
  const missingByQuality = emptyQuality();
  const dispositions = Object.fromEntries(Object.keys(DISPOSITIONS).map(key => [key, 0]));
  const frequencyMap = new Map();
  for (const row of rows) {
    const key = qualityKey(row.quality);
    joinedQuality[key]++;
    if (row.descriptionMissing) missingByQuality[key]++;
    dispositions[row.disposition]++;
    for (const tag of row.tags) {
      const evidence = row.mechanics.filter(mechanic => mechanic.tag === tag);
      const frequency = frequencyMap.get(tag) ?? { tag, category: evidence[0].category, itemCount: 0, clauseOccurrences: 0, byQuality: emptyQuality() };
      frequency.itemCount++;
      frequency.clauseOccurrences += evidence.length;
      frequency.byQuality[key]++;
      frequencyMap.set(tag, frequency);
    }
  }
  const frequencies = [...frequencyMap.values()].sort((left, right) => right.itemCount - left.itemCount || left.tag.localeCompare(right.tag)).map(frequency => ({
    ...frequency,
    fractionByQuality: Object.fromEntries(Object.keys(joinedQuality).map(key => [key, joinedQuality[key] ? frequency.byQuality[key] / joinedQuality[key] : null])),
  }));
  return {
    schemaVersion: 1, taxonomyVersion: TAXONOMY_VERSION,
    provenance: { runtime: exported.provenance, exportSource, exporterVersion: exported.exporterVersion, eid: eid.provenance, capabilitySource },
    scope: exported.scope, taxonomy: CATEGORIES, dispositionLabels: DISPOSITIONS,
    limitations: [
      'Heuristic primitive inventory, not executable profiles, full vanilla behavior coverage, or a live gameplay acceptance result.',
      'Frequency counts are distinct items per tag; categories/tags overlap. Denominator includes missing descriptions.',
      'Partial matches remain unknown clauses; confidence is rule confidence, not a probability or proof of support.',
      'Missing descriptions are not inferred from quality, name, tags, or short ItemConfig text.',
      'EID modular/dynamic descriptions, separate synergy tables and runtime substitutions are not evaluated.',
      'Vanilla enum range excludes appended mod IDs but cannot undo mod overrides of vanilla ItemConfig entries.',
    ],
    summary: {
      exportedItems: items.size, joinedItems: rows.length,
      missingDescriptions: rows.filter(row => row.descriptionMissing).length,
      unknownClauses: rows.reduce((total, row) => total + row.unknownClauses.length, 0),
      dispositions, missingByQuality,
      qualityReconciliation: Object.keys(exportedQuality).map(key => ({ quality: key, exported: exportedQuality[key], joined: joinedQuality[key], delta: joinedQuality[key] - exportedQuality[key] })),
      reconciled: rows.length === items.size && Object.keys(exportedQuality).every(key => exportedQuality[key] === joinedQuality[key]),
      eidOnlyIds: [...descriptions.keys()].filter(id => !items.has(id)).sort((left, right) => left - right),
    },
    frequencies, overrides: eid.overrides ?? [], rows,
  };
}

const cell = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/\r?\n/g, '<br>');

export function renderMarkdown(report) {
  const lines = [
    '# Vanilla mechanic inventory', '',
    `Data kind: **${cell(report.provenance.runtime.kind)}**. Game: ${cell(report.provenance.runtime.gameVersion)}. Runtime: ${cell(report.provenance.runtime.runtimeVersion)}. Captured: ${cell(report.provenance.runtime.capturedAt)}.`, '',
    `Joined ${report.summary.joinedItems}/${report.summary.exportedItems}; missing EID descriptions: ${report.summary.missingDescriptions}; unknown/partial clauses: ${report.summary.unknownClauses}.`, '',
    '## Provenance', '', '```json', JSON.stringify(report.provenance, null, 2), '```', '',
    '## Limits', '', ...report.limitations.map(limit => `- ${limit}`), '',
    '## Quality reconciliation', '', '| Quality | Exported | Joined | Delta |', '| --- | ---: | ---: | ---: |',
    ...report.summary.qualityReconciliation.map(row => `| ${row.quality} | ${row.exported} | ${row.joined} | ${row.delta} |`), '',
    '## Dispositions', '', ...Object.entries(report.summary.dispositions).map(([key, count]) => `- ${DISPOSITIONS[key]}: ${count}`), '',
    '## Mechanic frequency by quality', '',
    'Cells show distinct item counts / all exported items of that quality. Repeated clauses count once per item/tag. Other-quality rows remain in JSON.', '',
    '| Mechanic | Category | Items | Q0 | Q1 | Q2 | Q3 | Q4 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.frequencies.map(frequency => `| ${frequency.tag} | ${frequency.category} | ${frequency.itemCount} | ${[0, 1, 2, 3, 4].map(quality => `${frequency.byQuality[quality]}/${report.summary.qualityReconciliation.find(row => row.quality === String(quality)).exported}`).join(' | ')} |`), '',
    '## Joined inventory', '', '| ID | Name | Quality | Type | ItemConfig tags | EID description | Mechanic tags | Disposition / confidence |', '| ---: | --- | ---: | ---: | --- | --- | --- | --- |',
    ...report.rows.map(row => `| ${row.id} | ${cell(row.name)} | ${row.quality} | ${row.type} | ${cell(row.itemConfigTags)} | ${cell(row.sourceText) || '(missing)'} | ${cell(row.tags.join(', '))} | ${row.dispositionLabel} / ${row.confidence} |`), '',
    '## Conditional phrases', '',
    ...report.rows.flatMap(row => row.conditionalPhrases.map(clause => `- ID ${row.id}, clause ${clause.index}: ${cell(clause.source)}`)), '',
    '## Unknown / partial clauses (not discarded)', '',
    ...report.rows.flatMap(row => row.unknownClauses.map(clause => `- ID ${row.id}, clause ${clause.index} (${clause.coverage}): ${cell(clause.source) || '(empty/missing)'}${clause.unknownMarkup.length ? `; unknown markup: ${cell(clause.unknownMarkup.join(', '))}` : ''}`)), '',
    '## EID-only IDs (not added to inventory)', '', report.summary.eidOnlyIds.join(', ') || '(none)', '',
  ];
  return lines.join('\n');
}
