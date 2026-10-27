import test from 'node:test';
import assert from 'node:assert/strict';
import { POWER_KEYS, powerSnapshot, buildPowerLedger } from '../content-contract/powers.mjs';
import { selectionPriors, validateSelectionPriors, selectionPriorMultiplier, secondarySelectionPrior } from './selection-priors.mjs';
import { compatibleSkeletons, selectSkeleton, seededRandom } from './power-planner.mjs';
import { validateProfile } from './generate.mjs';
import { buildPowerDesignBrief } from './power-design.mjs';

const empty = () => powerSnapshot(buildPowerLedger([]));

test('reviewed selection evidence is immutable and reconciles without Steam or generated files', () => {
  assert.deepEqual(selectionPriors.qualityTotals, [89, 225, 203, 166, 38]);
  assert.equal(selectionPriors.exportedItems, 721);
  assert.deepEqual(selectionPriors.families['power.projectile_reflection'].byQuality, [0, 4, 1, 1, 0]);
  assert.ok(Object.isFrozen(selectionPriors) && Object.isFrozen(selectionPriors.source));
  assert.ok(Object.isFrozen(selectionPriors.families['power.dash'].byQuality));
  assert.throws(() => { selectionPriors.policy.minimum = 0; });
  assert.deepEqual(validateSelectionPriors(selectionPriors), selectionPriors);
});

test('selection factors use the declared shrinkage formula, clamp odds and never ban zero observations', () => {
  const expectedReflection = ((4 + 50 * (6 / 721)) / (225 + 50)) / (6 / 721);
  assert.ok(Math.abs(selectionPriorMultiplier('power.projectile_reflection', 1) - expectedReflection) < 1e-12);
  const expectedExtraTears = ((7 + 50 * (21 / 721)) / (225 + 50)) / (21 / 721);
  assert.ok(Math.abs(selectionPriorMultiplier('power.extra_tears', 1) - expectedExtraTears) < 1e-12);
  assert.equal(selectionPriorMultiplier('power.projectile_reflection', 0), 0.5);
  assert.ok(selectionPriorMultiplier('power.projectile_reflection', 4) > 0.5);
  for (const power of POWER_KEYS) for (let quality = 0; quality <= 4; quality += 1) {
    const factor = selectionPriorMultiplier(power, quality);
    assert.ok(Number.isFinite(factor) && factor >= 0.5 && factor <= 2);
    if (!selectionPriors.families[power]) assert.equal(factor, 1, power);
  }
  for (const quality of [-1, 5, 1.5, NaN, '1']) assert.throws(() => selectionPriorMultiplier('power.dash', quality));
  for (const power of ['power.health', 'chance', 'dash', undefined]) assert.throws(() => selectionPriorMultiplier(power, 1));
});

test('secondary priors count semantic powers once and cannot multiply beyond the policy bounds', () => {
  assert.equal(secondarySelectionPrior(['power.dash'], 'power.dash', 1), 1);
  const powers = ['power.dash', 'power.projectile_reflection', 'power.extra_tears'];
  const expected = Math.sqrt(selectionPriorMultiplier('power.projectile_reflection', 1) * selectionPriorMultiplier('power.extra_tears', 1));
  assert.ok(Math.abs(secondarySelectionPrior(powers, 'power.dash', 1) - expected) < 1e-12);
  assert.equal(secondarySelectionPrior([...powers, 'power.extra_tears'], 'power.dash', 1), secondarySelectionPrior(powers, 'power.dash', 1));
  assert.equal(secondarySelectionPrior(['power.slow', 'power.poison'], 'power.slow', 1), 1);
  assert.throws(() => secondarySelectionPrior(null, 'power.dash', 1));
  assert.throws(() => secondarySelectionPrior([], 'power.dash', 5));
  assert.throws(() => secondarySelectionPrior([], 'unknown', 1));
  assert.throws(() => secondarySelectionPrior(['unknown'], 'power.dash', 1));
});

test('invalid provenance, unreconciled counts and unreviewed families cannot change production priors', () => {
  const mutations = [
    value => { value.version = 2; },
    value => { value.evidenceKind = 'fully_supported_items'; },
    value => { value.policy.minimum = 0; },
    value => { value.policy.maximum = 100; },
    value => { value.policy.priorItems = 0; },
    value => { value.source.kind = 'fixture'; },
    value => { value.source.reportSha256 = 'missing'; },
    value => { value.source.exportSha256 = ''; },
    value => { value.source.capturedAt = 'not a date'; },
    value => { value.qualityTotals[0] += 1; },
    value => { value.qualityTotals.pop(); },
    value => { value.families['power.dash'].byQuality[0] = 100; },
    value => { value.families['power.dash'].total = 0; },
    value => { value.families['power.dash'].byQuality[0] = 0.5; },
    value => { value.families['power.dash'].tag = 'actor.familiar'; },
    value => { value.families['power.slow'] = structuredClone(value.families['power.dash']); },
    value => { value.condition = 'chance'; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(selectionPriors); mutate(copy);
    assert.throws(() => validateSelectionPriors(copy));
  }
});

test('planner uses the prior in the primary lottery without changing candidate or supporting choices', () => {
  let changedFromNeutral = 0;
  for (let seed = 0; seed < 128; seed += 1) {
    const request = { source: 'Generator', allowedSystems: ['rules'] };
    const { candidates, support } = compatibleSkeletons({ quality: 1, seed, request });
    const families = [...new Set(candidates.flatMap(candidate => candidate.powerKeys))].sort();
    const draw = seededRandom('power:1:' + seed)();
    const pick = prior => {
      const weights = families.map(power => Math.max(...candidates.filter(candidate => candidate.powerKeys.includes(power)).map(candidate => candidate.weight)) * prior(power));
      let remaining = draw * weights.reduce((total, weight) => total + weight, 0);
      return families.find((power, index) => { remaining -= weights[index]; return remaining < 0; }) ?? families.at(-1);
    };
    const expected = pick(power => selectionPriorMultiplier(power, 1));
    const neutral = pick(() => 1);
    const selected = selectSkeleton({ quality: 1, powerUsage: empty(), seed, request, validateProfile });
    assert.equal(selected.primaryPower, expected);
    assert.deepEqual(selected.support, support);
    assert.equal(selected.selectionPrior.primaryMultiplier, selectionPriorMultiplier(expected, 1));
    assert.deepEqual(selectSkeleton({ quality: 1, powerUsage: empty(), seed, request }), selected);
    if (expected !== neutral) changedFromNeutral += 1;
  }
  assert.ok(changedFromNeutral > 0, 'Prior must affect actual choices, not only diagnostics');
});

test('boosted reflection still obeys unused-first and explicit Creator override rules', () => {
  const options = { quality: 1, seed: 0, validateProfile };
  const first = buildPowerDesignBrief('Reflect enemy projectiles', empty(), options);
  const snapshot = powerSnapshot(buildPowerLedger([{ id: 'reflected', profile: first.skeleton.profile, source: 'Creator' }]));
  for (let seed = 0; seed < 20; seed += 1) {
    const selected = selectSkeleton({ ...options, seed, powerUsage: snapshot, request: { source: 'Generator', allowedSystems: ['rules'] } });
    assert.ok(!selected.powerKeys.includes('power.projectile_reflection'));
  }
  const explicit = buildPowerDesignBrief('Reflect enemy projectiles', snapshot, options);
  assert.deepEqual(explicit.skeleton.powerKeys, ['power.projectile_reflection']);
  assert.equal(explicit.skeleton.multipliers['power.projectile_reflection'], 1);
  assert.deepEqual(JSON.parse(explicit.ideaBrief).selection_prior, explicit.skeleton.selectionPrior);
  assert.equal(JSON.parse(buildPowerDesignBrief('Add luck', empty(), options).ideaBrief).selection_prior, null);
});
