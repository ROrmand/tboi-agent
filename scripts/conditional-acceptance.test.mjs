import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildLiveAcceptanceReport, renderLiveAcceptanceReport, lifecycleCases, currentAcceptanceBuild, readAcceptanceBuild, buildLiveAcceptanceTemplate } from './conditional-acceptance.mjs';

const now = new Date('2026-10-24T16:00:00Z');
const options = { conditions: ['chance'], effects: ['projectile_cone'], now };
const observation = (name, scenario) => ({
  ...(scenario ? { scenario } : {}),
  case: name, game_version: 'test fixture only', repentogon_version: 'fixture', character: 'fixture',
  trigger: 'fixture', expected: 'fixture expected', observed: 'fixture observed', passed: true,
  recorded_at: '2026-10-24T15:00:00Z',
  build: { ...currentAcceptanceBuild }, save_slot: 2, session: 'test-fixture-session',
});
const complete = () => ({ observations: [observation('condition.chance', 'satisfying'), observation('condition.chance', 'failing'),
  ...['effect.projectile_cone', ...lifecycleCases.map(name => 'lifecycle.' + name)].map(name => observation(name))] });

test('production matrix includes bounded execution and reflection without fabricating observations', () => {
  const report = buildLiveAcceptanceReport(undefined, { now });
  assert.equal(report.required_count, 70);
  for (const name of ['repeatable_luck_procs', 'summon_accumulation', 'friendly_creep', 'health_safety']) assert.ok(report.missing.includes('lifecycle.' + name));
  assert.ok(report.missing.includes('lifecycle.explosion_immunity'));
  assert.ok(report.missing.includes('lifecycle.explosive_tear_safety'));
  assert.ok(report.missing.includes('lifecycle.weapon_tint'));
  assert.ok(report.missing.includes('effect.execute_enemy'));
  assert.ok(report.missing.includes('effect.reflect_projectiles'));
  assert.equal(report.observed_count, 0);
  assert.equal(report.status, 'blocked');
});

test('missing live evidence is blocked, never implied by automated results', () => {
  const report = buildLiveAcceptanceReport(undefined, options);
  assert.equal(report.status, 'blocked');
  assert.equal(report.observed_count, 0);
  assert.ok(report.missing.includes('condition.chance'));
  assert.match(renderLiveAcceptanceReport(report), /Automated tests are not live-game evidence/);
  assert.match(renderLiveAcceptanceReport(report), new RegExp('0/' + report.required_scenario_count + ' required scenarios recorded'));
});

test('rendered progress distinguishes partial scenarios from completed cases', () => {
  const report = buildLiveAcceptanceReport({ observations: [observation('condition.chance', 'satisfying')] }, options);
  const rendered = renderLiveAcceptanceReport(report);
  assert.equal(report.observed_count, 0);
  assert.equal(report.observed_scenario_count, 1);
  assert.match(rendered, new RegExp('0/' + report.required_count + ' required cases recorded'));
  assert.match(rendered, new RegExp('1/' + report.required_scenario_count + ' required scenarios recorded'));
  assert.match(rendered, /condition.chance: failing/);
});

test('complete supplied matrix passes completeness checks without claiming authenticity', () => {
  const report = buildLiveAcceptanceReport(complete(), options);
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.missing, []);
  assert.match(report.note, /not their authenticity/);
});

test('failed, future, malformed, and unknown observations cannot satisfy release gates', () => {
  for (const replacement of [
    null, { ...observation('condition.chance'), passed: false },
    { ...observation('condition.chance'), recorded_at: '2026-10-25T15:00:00Z' },
    { ...observation('condition.chance'), game_version: '' },
    observation('unknown'),
  ]) {
    const evidence = complete();
    evidence.observations[0] = replacement;
    const report = buildLiveAcceptanceReport(evidence, options);
    assert.equal(report.status, 'blocked');
    assert.ok(report.missing.includes('condition.chance'));
    assert.ok(report.problems.length);
  }
});

test('duplicate observations do not increase coverage and failures are not hidden by retries', () => {
  const evidence = complete();
  evidence.observations.push(observation('condition.chance', 'satisfying'));
  assert.equal(buildLiveAcceptanceReport(evidence, options).observed_count, buildLiveAcceptanceReport(evidence, options).required_count);
  evidence.observations.push({ ...observation('condition.chance', 'satisfying'), passed: false });
  assert.equal(buildLiveAcceptanceReport(evidence, options).status, 'blocked');
});

test('conditions cannot pass from only a happy path, an unspecified scenario or duplicate scenarios', () => {
  for (const scenario of [undefined, 'satisfying', 'behavior', 'bogus']) {
    const evidence = complete();
    evidence.observations = evidence.observations.filter(row => !row.case.startsWith('condition.'));
    evidence.observations.push(observation('condition.chance', scenario), observation('condition.chance', scenario));
    const report = buildLiveAcceptanceReport(evidence, options);
    assert.equal(report.status, 'blocked');
    assert.ok(report.missing.includes('condition.chance'));
    assert.ok(report.missing_scenarios['condition.chance'].includes('failing'));
  }
});

test('threshold acceptance requires exact boundary and adjacent observations in addition to satisfying and failing states', () => {
  const thresholdOptions = { conditions: ['target_health_at_most'], effects: [], now };
  const evidence = { observations: ['satisfying', 'failing'].map(scenario => observation('condition.target_health_at_most', scenario))
    .concat(lifecycleCases.map(name => observation('lifecycle.' + name))) };
  let report = buildLiveAcceptanceReport(evidence, thresholdOptions);
  assert.deepEqual(report.missing_scenarios['condition.target_health_at_most'], ['boundary', 'adjacent']);
  assert.equal(report.observed_count, lifecycleCases.length);
  evidence.observations.push(observation('condition.target_health_at_most', 'boundary'));
  report = buildLiveAcceptanceReport(evidence, thresholdOptions);
  assert.deepEqual(report.missing_scenarios['condition.target_health_at_most'], ['adjacent']);
  assert.match(renderLiveAcceptanceReport(report), /condition.target_health_at_most: adjacent/);
  evidence.observations.push(observation('condition.target_health_at_most', 'adjacent'));
  report = buildLiveAcceptanceReport(evidence, thresholdOptions);
  assert.equal(report.status, 'passed');
  assert.equal(report.observed_scenario_count, report.required_scenario_count);
  assert.deepEqual(report.missing_scenarios, {});
});

test('production requirements distinguish condition comparisons without adding fictional live evidence', () => {
  const report = buildLiveAcceptanceReport(undefined, { now });
  assert.equal(report.version, 3);
  assert.equal(report.observed_scenario_count, 0);
  for (const name of ['resource_at_least', 'red_hearts_at_most', 'active_charge_at_least', 'damage_at_least', 'stage_at_most']) {
    assert.deepEqual(report.scenario_requirements['condition.' + name], ['satisfying', 'failing', 'boundary', 'adjacent']);
  }
  assert.deepEqual(report.scenario_requirements['condition.once_per_room'], ['satisfying', 'failing']);
  assert.deepEqual(report.scenario_requirements['effect.execute_enemy'], ['behavior']);
  assert.ok(report.required_scenario_count > report.required_count);
});

test('malformed scenario and case values fail closed without crashing the evidence checker', () => {
  for (const replacement of [{ scenario: 1 }, { scenario: ['satisfying'] }, { case: { startsWith: 'invalid' } }, { case: 1 }]) {
    const evidence = complete();
    evidence.observations[0] = { ...evidence.observations[0], ...replacement };
    const report = buildLiveAcceptanceReport(evidence, options);
    assert.equal(report.status, 'blocked');
    assert.ok(report.problems.length);
    assert.ok(report.missing.includes('condition.chance'));
  }
});

test('date-only, impossible-calendar, non-UTC and malformed timestamps cannot satisfy live acceptance', () => {
  for (const recorded_at of ['2026-02-30T00:00:00Z', '2026-04-31T00:00:00Z', '2025-02-29T00:00:00Z',
    '2026-10-24', '2026-10-24T14:00:00', '2026-10-24T15:00:00+01:00', '2026-10-23T24:00:00Z',
    '2026-10-24T14:00:00.0001Z', 0, null, { toString: 'invalid' }]) {
    const evidence = complete();
    evidence.observations[0].recorded_at = recorded_at;
    const report = buildLiveAcceptanceReport(evidence, options);
    assert.equal(report.status, 'blocked', JSON.stringify(recorded_at));
    assert.ok(report.missing.includes('condition.chance'));
    assert.ok(report.problems.some(problem => problem.includes('valid non-future UTC')));
  }
});

test('valid calendar dates and explicit UTC timestamps with millisecond precision retain completeness', () => {
  for (const recorded_at of ['2024-02-29T15:00:00Z', '2026-10-24T15:00:00Z', '2026-10-24T15:00:00+00:00',
    '2026-10-24T15:00:00.1Z', '2026-10-24T15:00:00.12Z', '2026-10-24T15:00:00.123Z']) {
    const evidence = complete();
    evidence.observations.forEach(row => { row.recorded_at = recorded_at; });
    assert.equal(buildLiveAcceptanceReport(evidence, options).status, 'passed', recorded_at);
  }
});

test('old builds, absent provenance and protected save slots cannot contribute acceptance', () => {
  const changes = [
    { build: undefined }, { build: null }, { build: [] },
    ...Object.entries(currentAcceptanceBuild).map(([field, value]) => ({ build: { ...currentAcceptanceBuild, [field]: typeof value === 'number' ? value - 1 : '0'.repeat(64) } })),
    { save_slot: 1 }, { save_slot: '2' }, { save_slot: 0 }, { save_slot: undefined },
    { session: '' }, { session: '  ' }, { session: null },
  ];
  for (const change of changes) {
    const evidence = complete();
    evidence.observations[0] = { ...evidence.observations[0], ...change };
    const report = buildLiveAcceptanceReport(evidence, options);
    assert.equal(report.status, 'blocked', JSON.stringify(change));
    assert.ok(report.missing_scenarios['condition.chance'].includes('satisfying'));
    assert.ok(report.problems.length);
    assert.deepEqual(report.expected_build, currentAcceptanceBuild);
  }
  const evidence = complete();
  evidence.observations.forEach(row => { row.save_slot = 3; });
  assert.equal(buildLiveAcceptanceReport(evidence, options).status, 'passed');
});

test('current source identity is deterministic and unobserved templates cannot count as evidence', () => {
  assert.deepEqual(readAcceptanceBuild(), currentAcceptanceBuild);
  assert.match(currentAcceptanceBuild.product_source_sha256, /^[a-f0-9]{64}$/);
  const template = buildLiveAcceptanceTemplate(['condition.chance'], options);
  assert.deepEqual(template.observations.map(row => row.scenario), ['satisfying', 'failing']);
  assert.ok(template.observations.every(row => row.passed === false && row.build === null && row.save_slot === null && row.observed === '' && row.recorded_at === ''));
  const report = buildLiveAcceptanceReport(template, options);
  assert.equal(report.observed_scenario_count, 0);
  assert.equal(report.status, 'blocked');
  assert.throws(() => buildLiveAcceptanceTemplate(['condition.pickup_kind']), /Unknown acceptance case/);
  const full = buildLiveAcceptanceTemplate();
  assert.equal(full.observations.length, buildLiveAcceptanceReport().required_scenario_count);
});

test('template CLI creates only unpassed rows and refuses overwrite or unknown cases', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'isaac-live-template-'));
  const output = path.join(directory, 'fresh.json');
  const script = path.resolve('scripts/conditional-acceptance.mjs');
  const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  try {
    const created = invoke('--template', output, 'lifecycle.friendly_creep');
    assert.equal(created.status, 0, created.stderr);
    const original = await readFile(output, 'utf8');
    const template = JSON.parse(original);
    assert.equal(template.observations.length, 1);
    assert.equal(template.observations[0].passed, false);
    assert.equal(template.observations[0].build, null);
    assert.notEqual(invoke('--template', output).status, 0);
    assert.equal(await readFile(output, 'utf8'), original);
    const invalidOutput = path.join(directory, 'invalid.json');
    assert.notEqual(invoke('--template', invalidOutput, 'unknown').status, 0);
    await assert.rejects(readFile(invalidOutput), { code: 'ENOENT' });
    const reportDirectory = path.join(directory, 'report');
    const checked = invoke(output, reportDirectory);
    assert.equal(checked.status, 1);
    const report = JSON.parse(await readFile(path.join(reportDirectory, 'report.json'), 'utf8'));
    assert.equal(report.observed_count, 0);
    assert.deepEqual(report.expected_build, currentAcceptanceBuild);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
