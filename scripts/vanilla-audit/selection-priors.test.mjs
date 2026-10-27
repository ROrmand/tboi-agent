import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSelectionPriors, runSelectionPriorCli } from './selection-priors.mjs';
import { validateSelectionPriors } from '../../bridge/selection-priors.mjs';

function fixtureReport() {
  return {
    schemaVersion: 1, taxonomyVersion: 'synthetic-fixture-only',
    provenance: { runtime: { kind: 'fixture', capturedAt: '2026-01-01T00:00:00Z', gameVersion: 'fixture', runtimeVersion: 'fixture-not-live' },
      exportSource: { sha256: '1'.repeat(64) }, eidInstallation: { edition: 'fixture', version: 'fixture', commit: 'fixture' } },
    summary: { reconciled: true, exportedItems: 5, joinedItems: 5, missingDescriptions: 0,
      qualityReconciliation: [...Array.from({ length: 5 }, (_, quality) => ({ quality: String(quality), exported: 1, joined: 1, delta: 0 })), { quality: 'other', exported: 0, joined: 0, delta: 0 }] },
    rows: [
      { id: 1, quality: 0, descriptionMissing: false, tags: ['action.projectile_block'] },
      { id: 2, quality: 1, descriptionMissing: false, tags: ['action.projectile_reflect', 'action.extra_tears'] },
      { id: 3, quality: 2, descriptionMissing: false, tags: ['action.projectile_block'] },
      { id: 4, quality: 3, descriptionMissing: false, tags: ['action.player_dash'] },
      { id: 5, quality: 4, descriptionMissing: false, tags: ['action.enemy_mark'] },
    ],
    frequencies: [
      { tag: 'action.projectile_block', itemCount: 2, byQuality: { 0: 1, 1: 0, 2: 1, 3: 0, 4: 0 } },
      { tag: 'action.projectile_reflect', itemCount: 1, byQuality: { 0: 0, 1: 1, 2: 0, 3: 0, 4: 0 } },
      { tag: 'action.player_dash', itemCount: 1, byQuality: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0 } },
      { tag: 'action.extra_tears', itemCount: 1, byQuality: { 0: 0, 1: 1, 2: 0, 3: 0, 4: 0 } },
    ],
  };
}

test('read-only extraction reproduces distinct-item counts and preserves fixture provenance', () => {
  const text = JSON.stringify(fixtureReport());
  const result = buildSelectionPriors(text);
  assert.equal(result.source.kind, 'fixture');
  assert.equal(result.source.reportSha256, createHash('sha256').update(text).digest('hex'));
  assert.deepEqual(result.qualityTotals, [1, 1, 1, 1, 1]);
  assert.deepEqual(result.families['power.projectile_blocking'].byQuality, [1, 0, 1, 0, 0]);
  assert.equal(result.families['power.projectile_blocking'].total, 2);
  assert.equal(Object.keys(result.families).length, 4);
  assert.throws(() => validateSelectionPriors(result), /runtime evidence, not fixtures/);
  assert.deepEqual(buildSelectionPriors(text), result);
});

test('claimed reconciliation cannot hide mismatched rows, frequencies, missing descriptions or metadata', () => {
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.rows.push(value.rows[0]); },
    value => { value.rows[0].quality = 8; },
    value => { value.rows[0].descriptionMissing = true; },
    value => { value.rows[0].tags.push(value.rows[0].tags[0]); },
    value => { value.summary.exportedItems += 1; },
    value => { value.summary.qualityReconciliation[0].exported += 1; },
    value => { value.summary.qualityReconciliation[5].joined = 1; },
    value => { value.frequencies[0].itemCount = 999; },
    value => { value.frequencies[0].byQuality[0] = 0; },
    value => { value.frequencies.push(value.frequencies[0]); },
    value => { value.frequencies.shift(); },
    value => { value.provenance.exportSource.sha256 = 'unverified'; },
    value => { delete value.provenance.eidInstallation; },
  ]) {
    const report = fixtureReport(); mutate(report);
    assert.throws(() => buildSelectionPriors(JSON.stringify(report)));
  }
});

test('CLI only emits review candidates and rejects fixtures or changed evidence as production updates', async () => {
  const prefix = path.join(tmpdir(), 'isaac-selection-priors-');
  const directory = await mkdtemp(prefix);
  try {
    const file = path.join(directory, 'report.json');
    let report = fixtureReport();
    await writeFile(file, JSON.stringify(report));
    const output = await runSelectionPriorCli(['--report', file]);
    assert.equal(JSON.parse(output).source.kind, 'fixture');
    await assert.rejects(runSelectionPriorCli(['--report', file, '--check']), /runtime evidence, not fixtures/);
    report.provenance.runtime.kind = 'runtime';
    const text = JSON.stringify(report); await writeFile(file, text);
    await assert.rejects(runSelectionPriorCli(['--report', file, '--check']), /differs from the curated snapshot/);
    assert.equal(await readFile(file, 'utf8'), text);
    await assert.rejects(runSelectionPriorCli(['--force']), /Unknown option/);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)));
    await rm(directory, { recursive: true, force: true });
  }
});
